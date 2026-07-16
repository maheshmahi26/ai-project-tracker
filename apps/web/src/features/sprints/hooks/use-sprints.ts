import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { sprintsApi } from '../api/sprints-api';

export function useSprints(projectId: string | undefined) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.sprints.list(orgId, projectId ?? ''),
    queryFn: () => sprintsApi.list(projectId as string),
    enabled: Boolean(projectId),
  });
}
