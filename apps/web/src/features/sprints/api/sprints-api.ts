import type { SprintDTO } from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export const sprintsApi = {
  list: (projectId: string): Promise<SprintDTO[]> =>
    apiClient.get<SprintDTO[]>(`/projects/${projectId}/sprints`, { params: { status: 'all' } }),
};
