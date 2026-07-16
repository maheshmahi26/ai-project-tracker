import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { activityApi, type ActivityListParams } from '../api/activity-api';

export function useActivity(params: ActivityListParams = {}) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.activity.list(orgId, params as unknown as Record<string, unknown>),
    queryFn: () => activityApi.list(params),
  });
}
