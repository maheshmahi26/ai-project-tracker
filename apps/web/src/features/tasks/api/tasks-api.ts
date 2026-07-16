import type {
  ApiMeta,
  AssignTaskInput,
  BulkDeleteTasksInput,
  BulkUpdateTasksInput,
  CreateSubtaskInput,
  CreateTaskInput,
  MoveTaskInput,
  TaskDTO,
  UpdateTaskInput,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface TaskListParams {
  projectId?: string;
  sprintId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  parentId?: string;
  q?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
}

export interface TasksPage {
  items: TaskDTO[];
  page?: ApiMeta['page'];
}

export const tasksApi = {
  async list(params: TaskListParams): Promise<TasksPage> {
    const { data, meta } = await apiClient.getWithMeta<TaskDTO[]>('/tasks', {
      params: {
        projectId: params.projectId,
        sprintId: params.sprintId,
        status: params.status || undefined,
        priority: params.priority || undefined,
        assigneeId: params.assigneeId,
        parentId: params.parentId,
        q: params.q || undefined,
        sort: params.sort || undefined,
        limit: params.limit,
        cursor: params.cursor,
      },
    });
    return { items: data, page: meta.page };
  },

  get: (id: string): Promise<TaskDTO> => apiClient.get<TaskDTO>(`/tasks/${id}`),

  create: (input: CreateTaskInput): Promise<TaskDTO> => apiClient.post<TaskDTO>('/tasks', input),

  update: (id: string, input: UpdateTaskInput): Promise<TaskDTO> =>
    apiClient.patch<TaskDTO>(`/tasks/${id}`, input),

  assign: (id: string, input: AssignTaskInput): Promise<TaskDTO> =>
    apiClient.post<TaskDTO>(`/tasks/${id}/assign`, input),

  move: (id: string, input: MoveTaskInput): Promise<TaskDTO> =>
    apiClient.post<TaskDTO>(`/tasks/${id}/move`, input),

  remove: (id: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/tasks/${id}`),

  undoDelete: (id: string): Promise<TaskDTO> =>
    apiClient.post<TaskDTO>(`/tasks/${id}/undo-delete`, {}),

  bulkUpdate: (input: BulkUpdateTasksInput): Promise<{ updated: number }> =>
    apiClient.post<{ updated: number }>('/tasks/bulk-update', input),

  bulkDelete: (input: BulkDeleteTasksInput): Promise<{ deleted: number }> =>
    apiClient.post<{ deleted: number }>('/tasks/bulk-delete', input),

  listSubtasks: (id: string): Promise<TasksPage> =>
    apiClient
      .getWithMeta<TaskDTO[]>(`/tasks/${id}/subtasks`)
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  createSubtask: (id: string, input: CreateSubtaskInput): Promise<TaskDTO> =>
    apiClient.post<TaskDTO>(`/tasks/${id}/subtasks`, input),
};
