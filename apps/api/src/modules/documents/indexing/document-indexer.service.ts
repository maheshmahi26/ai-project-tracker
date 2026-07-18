import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppConfigService } from '../../../config/config.module';
import { GeminiClient } from '../../../infra/ai/gemini.client';
import { QdrantClient, type QdrantPoint } from '../../../infra/qdrant/qdrant.client';
import { StorageService } from '../../files/storage/storage.service';
import { DocumentsRepository } from '../documents.repository';
import { EmbeddingsRepository } from '../embeddings.repository';
import { chunkText, type Chunk } from './chunk';
import { parseDocument } from './parse';

/**
 * The heart of the RAG ingestion pipeline. Run by the BullMQ processor (and
 * directly by tests). Idempotent: it clears any prior chunks/vectors for the
 * document before re-indexing, so retries never duplicate data.
 *
 * fetch → parse → chunk → embed (batched) → upsert Qdrant → store Mongo chunks.
 * On a transient failure it marks the document `failed` and rethrows so BullMQ
 * retries with backoff; an empty document fails terminally (no throw).
 */
@Injectable()
export class DocumentIndexer {
  private readonly logger = new Logger(DocumentIndexer.name);

  constructor(
    private readonly documents: DocumentsRepository,
    private readonly embeddings: EmbeddingsRepository,
    private readonly storage: StorageService,
    private readonly gemini: GeminiClient,
    private readonly qdrant: QdrantClient,
    private readonly config: AppConfigService,
  ) {}

  async index(orgId: string, documentId: string): Promise<{ chunkCount: number }> {
    const doc = await this.documents.findById(orgId, documentId);
    if (!doc) {
      this.logger.warn(`Document ${documentId} not found (org ${orgId}); skipping.`);
      return { chunkCount: 0 };
    }

    await this.documents.updateStatus(orgId, documentId, { status: 'processing', error: null });

    try {
      // Create the collection before any Qdrant op (idempotent), then wipe any
      // partial results from a previous attempt. Both are inside the try so a
      // failure marks the document `failed` instead of leaving it `processing`.
      await this.qdrant.ensureCollection();
      await this.qdrant.deleteByDocument(orgId, documentId);
      await this.embeddings.deleteByDocument(orgId, documentId);

      const bytes = await this.storage.getObject(doc.storageKey);
      const text = await parseDocument(doc.sourceType, bytes);
      const chunks = chunkText(text, {
        chunkTokens: this.config.get('RAG_CHUNK_TOKENS'),
        overlapTokens: this.config.get('RAG_CHUNK_OVERLAP_TOKENS'),
      });

      if (chunks.length === 0) {
        await this.documents.updateStatus(orgId, documentId, {
          status: 'failed',
          chunkCount: 0,
          error: 'No text could be extracted from the document.',
        });
        return { chunkCount: 0 };
      }

      const projectId = doc.projectId ? doc.projectId.toString() : null;
      const batchSize = this.config.get('RAG_EMBED_BATCH');

      for (let start = 0; start < chunks.length; start += batchSize) {
        const batch = chunks.slice(start, start + batchSize);
        const vectors = await this.gemini.embed(batch.map((c) => c.text));
        if (vectors.length !== batch.length) {
          throw new Error(`Embedding count mismatch: got ${vectors.length}, expected ${batch.length}`);
        }

        const points: QdrantPoint[] = [];
        const rows = batch.map((chunk: Chunk, i) => {
          const pointId = randomUUID();
          points.push({
            id: pointId,
            vector: vectors[i] as number[],
            payload: { orgId, projectId, documentId, chunkIndex: chunk.index },
          });
          return {
            orgId: new Types.ObjectId(orgId),
            documentId: new Types.ObjectId(documentId),
            projectId: projectId ? new Types.ObjectId(projectId) : null,
            chunkIndex: chunk.index,
            text: chunk.text,
            qdrantPointId: pointId,
            metadata: { tokens: chunk.tokens },
          };
        });

        await this.qdrant.upsert(points);
        await this.embeddings.insertMany(rows);
      }

      await this.documents.updateStatus(orgId, documentId, {
        status: 'indexed',
        chunkCount: chunks.length,
        error: null,
      });
      this.logger.log(`Indexed document ${documentId}: ${chunks.length} chunks.`);
      return { chunkCount: chunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Indexing failed for document ${documentId}: ${message}`);
      await this.documents.updateStatus(orgId, documentId, {
        status: 'failed',
        error: message.slice(0, 500),
      });
      // Rethrow so BullMQ retries transient failures with backoff.
      throw err;
    }
  }
}
