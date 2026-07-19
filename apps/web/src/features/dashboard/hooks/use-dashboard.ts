import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { ApiClientError } from '@/lib/api-client';
import { useOrgStore } from '@/stores/org-store';
import { dashboardApi, type DashboardScope, type ExportTasksParams } from '../api/dashboard-api';

/** Server caches these ~30s and busts on writes, so a modest client staleTime is fine. */
const STALE_MS = 30_000;

const asFilters = (o: object): Record<string, unknown> => o as Record<string, unknown>;

export function useOverview(scope: DashboardScope) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'overview', asFilters(scope)),
    queryFn: () => dashboardApi.overview(scope),
    staleTime: STALE_MS,
  });
}

export function useVelocity(scope: DashboardScope) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'velocity', asFilters(scope)),
    queryFn: () => dashboardApi.velocity(scope),
    staleTime: STALE_MS,
  });
}

export function useBurndown(sprintId: string | undefined) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'burndown', { sprintId }),
    queryFn: () => dashboardApi.burndown(sprintId as string),
    enabled: Boolean(sprintId),
    staleTime: STALE_MS,
  });
}

export function useTasksPerUser(scope: DashboardScope) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'tasks-per-user', asFilters(scope)),
    queryFn: () => dashboardApi.tasksPerUser(scope),
    staleTime: STALE_MS,
  });
}

export function usePriorityDistribution(scope: DashboardScope) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'priority-distribution', asFilters(scope)),
    queryFn: () => dashboardApi.priorityDistribution(scope),
    staleTime: STALE_MS,
  });
}

export function useProjectProgress() {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'project-progress'),
    queryFn: () => dashboardApi.projectProgress(),
    staleTime: STALE_MS,
  });
}

export function useUsersByRole() {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'users-by-role'),
    queryFn: () => dashboardApi.usersByRole(),
    staleTime: STALE_MS,
  });
}

export function useWeeklyReport(scope: DashboardScope) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.dashboard.widget(orgId, 'weekly', asFilters(scope)),
    queryFn: () => dashboardApi.weekly(scope),
    staleTime: STALE_MS,
  });
}

/** Downloads the tasks CSV and triggers a browser save. */
export function useExportTasks() {
  return useMutation({
    mutationFn: async (params: ExportTasksParams) => {
      const blob = await dashboardApi.exportTasksCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tasks.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success('Export ready — check your downloads.'),
    onError: (err) => {
      const message =
        err instanceof ApiClientError ? err.message : 'Export failed. Please try again.';
      toast.error(message);
    },
  });
}
