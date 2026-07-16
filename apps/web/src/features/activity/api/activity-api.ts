import type { ActivityLogDTO, ApiMeta } from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface ActivityListParams {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  cursor?: string;
}

export interface ActivityPage {
  items: ActivityLogDTO[];
  page?: ApiMeta['page'];
}

export const activityApi = {
  async list(params: ActivityListParams): Promise<ActivityPage> {
    const { data, meta } = await apiClient.getWithMeta<ActivityLogDTO[]>('/activity', {
      params: {
        projectId: params.projectId,
        entityType: params.entityType,
        entityId: params.entityId,
        limit: params.limit,
        cursor: params.cursor,
      },
    });
    return { items: data, page: meta.page };
  },
};
