import type {
  BurndownDTO,
  DashboardOverviewDTO,
  PriorityDistributionDTO,
  ProjectProgressDTO,
  TasksPerUserDTO,
  VelocityPointDTO,
  WeeklyReportDTO,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface DashboardScope {
  projectId?: string;
}

export interface ExportTasksParams {
  projectId?: string;
  sprintId?: string;
  status?: string;
}

function scopeParams(scope: DashboardScope): Record<string, string | undefined> {
  return { projectId: scope.projectId || undefined };
}

export const dashboardApi = {
  overview: (scope: DashboardScope): Promise<DashboardOverviewDTO> =>
    apiClient.get<DashboardOverviewDTO>('/dashboard/overview', { params: scopeParams(scope) }),

  velocity: (scope: DashboardScope): Promise<VelocityPointDTO[]> =>
    apiClient.get<VelocityPointDTO[]>('/dashboard/velocity', { params: scopeParams(scope) }),

  burndown: (sprintId: string): Promise<BurndownDTO> =>
    apiClient.get<BurndownDTO>('/dashboard/burndown', { params: { sprintId } }),

  tasksPerUser: (scope: DashboardScope): Promise<TasksPerUserDTO[]> =>
    apiClient.get<TasksPerUserDTO[]>('/dashboard/tasks-per-user', { params: scopeParams(scope) }),

  priorityDistribution: (scope: DashboardScope): Promise<PriorityDistributionDTO[]> =>
    apiClient.get<PriorityDistributionDTO[]>('/dashboard/priority-distribution', {
      params: scopeParams(scope),
    }),

  projectProgress: (): Promise<ProjectProgressDTO[]> =>
    apiClient.get<ProjectProgressDTO[]>('/dashboard/project-progress'),

  weekly: (scope: DashboardScope): Promise<WeeklyReportDTO> =>
    apiClient.get<WeeklyReportDTO>('/reports/weekly', { params: scopeParams(scope) }),

  exportTasksCsv: (params: ExportTasksParams): Promise<Blob> =>
    apiClient.getBlob('/reports/tasks.csv', {
      params: {
        projectId: params.projectId || undefined,
        sprintId: params.sprintId || undefined,
        status: params.status || undefined,
      },
    }),
};
