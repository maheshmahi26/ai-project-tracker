import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import {
  documentSourceForMime,
  type ConfirmDocumentInput,
  type DocumentDTO,
  type ListDocumentsQuery,
  type PresignDocumentInput,
  type PresignFileResult,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import { QdrantClient } from '../../infra/qdrant/qdrant.client';
import { ProjectsRepository } from '../projects/projects.repository';
import { StorageService } from '../files/storage/storage.service';
import { DocumentsRepository } from './documents.repository';
import { EmbeddingsRepository } from './embeddings.repository';
import { toDocumentDTO } from './documents.mapper';
import { DOCUMENT_QUEUE, type IndexDocumentJob } from './documents.constants';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documents: DocumentsRepository,
    private readonly embeddings: EmbeddingsRepository,
    private readonly storage: StorageService,
    private readonly qdrant: QdrantClient,
    private readonly projects: ProjectsRepository,
    @InjectQueue(DOCUMENT_QUEUE) private readonly queue: Queue<IndexDocumentJob>,
  ) {}

  /** Step 1: validate target, return a short-lived presigned PUT URL. */
  async presign(orgId: string, input: PresignDocumentInput): Promise<PresignFileResult> {
    await this.assertProject(orgId, input.projectId);
    const storageKey = buildStorageKey(orgId, input.fileName);
    const url = await this.storage.presignUpload({
      key: storageKey,
      contentType: input.mimeType,
      maxSizeBytes: input.sizeBytes,
    });
    return { url, storageKey, expiresInSec: this.storage.urlTtlSec };
  }

  /** Step 2: persist the Document record and enqueue the indexing job. */
  async confirm(
    orgId: string,
    actorId: string,
    input: ConfirmDocumentInput,
  ): Promise<DocumentDTO> {
    await this.assertProject(orgId, input.projectId);
    const sourceType = documentSourceForMime(input.mimeType);
    if (!sourceType) throw AppException.validation('Unsupported document type');

    const doc = await this.documents.create({
      orgId: new Types.ObjectId(orgId),
      uploaderId: new Types.ObjectId(actorId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
      title: input.title,
      sourceType,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      status: 'uploaded',
    });

    const documentId = doc._id.toString();
    await this.queue.add(
      'index',
      { orgId, documentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: 100 },
    );
    this.logger.debug(`Queued index-document job for ${documentId}`);
    return toDocumentDTO(doc);
  }

  async list(orgId: string, query: ListDocumentsQuery): Promise<PaginatedResult<DocumentDTO>> {
    const rows = await this.documents.list({
      orgId,
      status: query.status,
      projectId: query.projectId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toDocumentDTO), query.limit, (d) => d.id);
  }

  async get(orgId: string, id: string): Promise<DocumentDTO> {
    const doc = await this.documents.findById(orgId, id);
    if (!doc) throw AppException.notFound('Document not found');
    return toDocumentDTO(doc);
  }

  /**
   * Delete a document and keep the vector store in sync: remove its Qdrant points
   * and Mongo chunk rows, then soft-delete the record and best-effort remove the
   * stored object.
   */
  async remove(orgId: string, id: string): Promise<void> {
    const doc = await this.documents.findById(orgId, id);
    if (!doc) throw AppException.notFound('Document not found');

    await this.qdrant.deleteByDocument(orgId, id);
    await this.embeddings.deleteByDocument(orgId, id);
    const ok = await this.documents.softDelete(orgId, id);
    if (!ok) throw AppException.notFound('Document not found');
    await this.storage.deleteObject(doc.storageKey);
  }

  private async assertProject(orgId: string, projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw AppException.notFound('Project not found');
  }
}

function buildStorageKey(orgId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `orgs/${orgId}/documents/${randomUUID()}-${safe}`;
}
