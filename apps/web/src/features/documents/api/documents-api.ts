import type {
  ApiMeta,
  DocumentDTO,
  DocumentStatus,
  DocumentTaskPlan,
  KnowledgeSearchResult,
  PresignFileResult,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface DocumentsPage {
  items: DocumentDTO[];
  page?: ApiMeta['page'];
}

export interface DocumentListParams {
  status?: DocumentStatus;
  projectId?: string;
  limit?: number;
  cursor?: string;
}

/** Map a File to a supported MIME type, inferring from the extension when the browser omits it. */
export function documentMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'md':
    case 'markdown':
      return 'text/markdown';
    default:
      return 'text/plain';
  }
}

export const documentsApi = {
  list: (params: DocumentListParams = {}): Promise<DocumentsPage> =>
    apiClient
      .getWithMeta<DocumentDTO[]>('/documents', {
        params: {
          status: params.status,
          projectId: params.projectId,
          limit: params.limit ?? 50,
          cursor: params.cursor,
        },
      })
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  get: (id: string): Promise<DocumentDTO> => apiClient.get<DocumentDTO>(`/documents/${id}`),

  presign: (input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    projectId?: string;
  }): Promise<PresignFileResult> => apiClient.post<PresignFileResult>('/documents/presign', input),

  confirm: (input: {
    storageKey: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    projectId?: string;
  }): Promise<DocumentDTO> => apiClient.post<DocumentDTO>('/documents', input),

  remove: (id: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/documents/${id}`),

  semanticSearch: (input: {
    query: string;
    projectId?: string;
    limit?: number;
  }): Promise<KnowledgeSearchResult> =>
    apiClient.post<KnowledgeSearchResult>('/search/semantic', input),

  generateTasks: (id: string, count = 6): Promise<DocumentTaskPlan> =>
    apiClient.post<DocumentTaskPlan>(`/documents/${id}/generate-tasks`, { count }),
};

/** Full upload flow: presign → PUT bytes directly to storage → confirm metadata + enqueue indexing. */
export async function uploadDocument(
  file: File,
  opts: { title?: string; projectId?: string } = {},
): Promise<DocumentDTO> {
  const mimeType = documentMimeType(file);
  const presigned = await documentsApi.presign({
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    projectId: opts.projectId,
  });

  const put = await fetch(presigned.url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);

  return documentsApi.confirm({
    storageKey: presigned.storageKey,
    title: opts.title?.trim() || file.name,
    mimeType,
    sizeBytes: file.size,
    projectId: opts.projectId,
  });
}
