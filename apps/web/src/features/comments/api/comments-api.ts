import type {
  ApiMeta,
  CommentDTO,
  CreateCommentInput,
  UpdateCommentInput,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface CommentsPage {
  items: CommentDTO[];
  page?: ApiMeta['page'];
}

export const commentsApi = {
  list: (taskId: string, cursor?: string): Promise<CommentsPage> =>
    apiClient
      .getWithMeta<CommentDTO[]>(`/tasks/${taskId}/comments`, {
        params: { limit: 50, cursor },
      })
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  create: (taskId: string, input: CreateCommentInput): Promise<CommentDTO> =>
    apiClient.post<CommentDTO>(`/tasks/${taskId}/comments`, input),

  update: (taskId: string, id: string, input: UpdateCommentInput): Promise<CommentDTO> =>
    apiClient.patch<CommentDTO>(`/tasks/${taskId}/comments/${id}`, input),

  remove: (taskId: string, id: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/tasks/${taskId}/comments/${id}`),
};
