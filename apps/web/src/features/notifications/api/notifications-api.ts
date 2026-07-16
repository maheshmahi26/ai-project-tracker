import type { ApiMeta, NotificationDTO } from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface NotificationsPage {
  items: NotificationDTO[];
  page?: ApiMeta['page'];
}

export const notificationsApi = {
  list: (params: { unreadOnly?: boolean; limit?: number; cursor?: string } = {}): Promise<NotificationsPage> =>
    apiClient
      .getWithMeta<NotificationDTO[]>('/notifications', {
        params: {
          unreadOnly: params.unreadOnly ? 'true' : undefined,
          limit: params.limit ?? 20,
          cursor: params.cursor,
        },
      })
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  markRead: (id: string): Promise<{ success: true }> =>
    apiClient.post<{ success: true }>(`/notifications/${id}/read`, {}),

  markAllRead: (): Promise<{ updated: number }> =>
    apiClient.post<{ updated: number }>('/notifications/read-all', {}),
};
