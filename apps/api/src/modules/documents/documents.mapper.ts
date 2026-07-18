import type { DocumentDTO } from '@ai-projectos/shared';
import type { DocumentLean } from './documents.repository';

export function toDocumentDTO(doc: DocumentLean): DocumentDTO {
  return {
    id: doc._id.toString(),
    orgId: doc.orgId.toString(),
    uploaderId: doc.uploaderId.toString(),
    projectId: doc.projectId ? doc.projectId.toString() : null,
    title: doc.title,
    sourceType: doc.sourceType,
    storageKey: doc.storageKey,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    chunkCount: doc.chunkCount,
    error: doc.error ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
