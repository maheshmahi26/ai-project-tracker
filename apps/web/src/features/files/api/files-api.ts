import type {
  ConfirmFileInput,
  FileDTO,
  FileScope,
  PresignFileInput,
  PresignFileResult,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export const filesApi = {
  list: (scope: FileScope): Promise<FileDTO[]> =>
    apiClient.get<FileDTO[]>('/files', {
      params: { scopeType: scope.type, scopeId: scope.id },
    }),

  presign: (input: PresignFileInput): Promise<PresignFileResult> =>
    apiClient.post<PresignFileResult>('/files/presign', input),

  confirm: (input: ConfirmFileInput): Promise<FileDTO> => apiClient.post<FileDTO>('/files', input),

  download: (id: string): Promise<{ url: string; expiresInSec: number }> =>
    apiClient.get<{ url: string; expiresInSec: number }>(`/files/${id}/download`),

  remove: (id: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/files/${id}`),
};

/** Full upload flow: presign → PUT bytes directly to storage → confirm metadata. */
export async function uploadFile(file: File, scope: FileScope): Promise<FileDTO> {
  const presigned = await filesApi.presign({
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    scope,
  });

  const put = await fetch(presigned.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);

  return filesApi.confirm({
    storageKey: presigned.storageKey,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    scope,
  });
}
