import type {
  ApiMeta,
  CreateProjectInput,
  ProjectDTO,
  UpdateProjectInput,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface ProjectListParams {
  status: 'active' | 'archived' | 'all';
  q?: string;
  sort?: string;
  page: number;
  pageSize: number;
}

export interface ProjectsPage {
  items: ProjectDTO[];
  page?: ApiMeta['page'];
}

export const projectsApi = {
  async list(params: ProjectListParams): Promise<ProjectsPage> {
    const { data, meta } = await apiClient.getWithMeta<ProjectDTO[]>('/projects', {
      params: {
        status: params.status,
        q: params.q || undefined,
        sort: params.sort || undefined,
        page: params.page,
        pageSize: params.pageSize,
      },
    });
    return { items: data, page: meta.page };
  },

  get: (id: string): Promise<ProjectDTO> => apiClient.get<ProjectDTO>(`/projects/${id}`),

  create: (input: CreateProjectInput): Promise<ProjectDTO> =>
    apiClient.post<ProjectDTO>('/projects', input),

  update: (id: string, input: UpdateProjectInput): Promise<ProjectDTO> =>
    apiClient.patch<ProjectDTO>(`/projects/${id}`, input),

  archive: (id: string): Promise<ProjectDTO> =>
    apiClient.post<ProjectDTO>(`/projects/${id}/archive`, {}),

  restore: (id: string): Promise<ProjectDTO> =>
    apiClient.post<ProjectDTO>(`/projects/${id}/restore`, {}),

  remove: (id: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/projects/${id}`),

  undoDelete: (id: string): Promise<ProjectDTO> =>
    apiClient.post<ProjectDTO>(`/projects/${id}/undo-delete`, {}),
};
