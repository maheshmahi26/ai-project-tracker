import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  ConfirmFileInput,
  FileDTO,
  FileScope,
  PresignFileInput,
  PresignFileResult,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import type { RequestMeta } from '../auth/auth.service';
import { DomainEventBus } from '../events/domain-event-bus';
import type { DomainEventName } from '../events/domain-event';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { StorageService } from './storage/storage.service';
import { FilesRepository, type FileLean } from './files.repository';
import { toFileDTO } from './files.mapper';

@Injectable()
export class FilesService {
  constructor(
    private readonly repo: FilesRepository,
    private readonly storage: StorageService,
    private readonly tasks: TasksRepository,
    private readonly projects: ProjectsRepository,
    private readonly events: DomainEventBus,
  ) {}

  /** Step 1: validate the target, return a short-lived presigned PUT URL. */
  async presign(orgId: string, input: PresignFileInput): Promise<PresignFileResult> {
    await this.assertScope(orgId, input.scope);
    const storageKey = buildStorageKey(orgId, input.scope, input.fileName);
    const url = await this.storage.presignUpload({
      key: storageKey,
      contentType: input.mimeType,
      maxSizeBytes: input.sizeBytes,
    });
    return { url, storageKey, expiresInSec: this.storage.urlTtlSec };
  }

  /** Step 2: the client uploaded the bytes; persist the metadata record. */
  async confirm(
    orgId: string,
    actorId: string,
    input: ConfirmFileInput,
    meta: RequestMeta,
  ): Promise<FileDTO> {
    await this.assertScope(orgId, input.scope);
    const file = await this.repo.create({
      orgId: new Types.ObjectId(orgId),
      uploaderId: new Types.ObjectId(actorId),
      scope: { type: input.scope.type, id: input.scope.id },
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
    });
    if (input.scope.type === 'task') {
      await this.tasks.updateById(orgId, input.scope.id, { $inc: { attachmentsCount: 1 } });
    }
    await this.emit('file.uploaded', file, actorId, meta, { verb: 'attached file' });
    return toFileDTO(file);
  }

  async listByScope(orgId: string, scopeType: string, scopeId: string): Promise<FileDTO[]> {
    const files = await this.repo.listByScope(orgId, scopeType, scopeId);
    return files.map(toFileDTO);
  }

  /** Returns a short-lived presigned GET URL for the private object. */
  async download(orgId: string, id: string): Promise<{ url: string; expiresInSec: number }> {
    const file = await this.requireFile(orgId, id);
    const url = await this.storage.presignDownload({
      key: file.storageKey,
      fileName: file.fileName,
    });
    return { url, expiresInSec: this.storage.urlTtlSec };
  }

  async remove(orgId: string, actorId: string, id: string, meta: RequestMeta): Promise<void> {
    const file = await this.requireFile(orgId, id);
    const ok = await this.repo.softDelete(orgId, id);
    if (!ok) throw AppException.notFound('File not found');
    if (file.scope.type === 'task') {
      await this.tasks.updateById(orgId, file.scope.id, { $inc: { attachmentsCount: -1 } });
    }
    // Best-effort object removal; never fails the request.
    await this.storage.deleteObject(file.storageKey);
    await this.emit('file.deleted', file, actorId, meta, { verb: 'removed file' });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireFile(orgId: string, id: string): Promise<FileLean> {
    const file = await this.repo.findById(orgId, id);
    if (!file) throw AppException.notFound('File not found');
    return file;
  }

  private async assertScope(orgId: string, scope: FileScope): Promise<void> {
    if (scope.type === 'task') {
      const task = await this.tasks.findById(orgId, scope.id);
      if (!task) throw AppException.notFound('Task not found');
    } else if (scope.type === 'project') {
      const project = await this.projects.findById(orgId, scope.id);
      if (!project) throw AppException.notFound('Project not found');
    }
    // `comment` scope is validated by id shape only (schema-level) to avoid a
    // hard dependency on the comments module.
  }

  private async emit(
    name: DomainEventName,
    file: FileLean,
    actorId: string,
    meta: RequestMeta,
    extra: { verb: string },
  ): Promise<void> {
    const id = file._id.toString();
    await this.events.publish({
      name,
      orgId: file.orgId.toString(),
      actorId,
      source: 'ui',
      entity: { type: 'file', id },
      after: name === 'file.uploaded' ? { fileName: file.fileName, sizeBytes: file.sizeBytes } : null,
      verb: extra.verb,
      object: { type: file.scope.type, id: file.scope.id, label: file.fileName },
      projectId: file.scope.type === 'project' ? file.scope.id : null,
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

function buildStorageKey(orgId: string, scope: FileScope, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `orgs/${orgId}/${scope.type}/${scope.id}/${randomUUID()}-${safe}`;
}
