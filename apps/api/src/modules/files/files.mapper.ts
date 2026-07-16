import type { FileDTO } from '@ai-projectos/shared';
import type { FileLean } from './files.repository';

export function toFileDTO(file: FileLean): FileDTO {
  return {
    id: file._id.toString(),
    orgId: file.orgId.toString(),
    uploaderId: file.uploaderId.toString(),
    scope: { type: file.scope.type, id: file.scope.id },
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    storageKey: file.storageKey,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}
