import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CreateProjectInput,
  ProjectDTO,
  UpdateProjectInput,
} from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { projectsApi, type ProjectListParams, type ProjectsPage } from '../api/projects-api';

export function useProjects(params: ProjectListParams) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.list(orgId, params as unknown as Record<string, unknown>),
    queryFn: () => projectsApi.list(params),
    // Keep the previous page visible while the next one loads (smooth paging).
    placeholderData: (prev) => prev,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.projects.detail(id) : ['projects', 'detail', 'none'],
    queryFn: () => projectsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateProjectInput }) =>
      projectsApi.update(vars.id, vars.input),
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.projects.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists });
    },
  });
}

/** Snapshot of every cached project list, for optimistic rollback. */
type ListSnapshot = ReturnType<QueryClient['getQueriesData']>;

function patchLists(
  queryClient: QueryClient,
  updater: (items: ProjectDTO[]) => ProjectDTO[],
): ListSnapshot {
  const previous = queryClient.getQueriesData<ProjectsPage>({ queryKey: queryKeys.projects.lists });
  queryClient.setQueriesData<ProjectsPage>({ queryKey: queryKeys.projects.lists }, (old) =>
    old ? { ...old, items: updater(old.items) } : old,
  );
  return previous;
}

function restoreLists(queryClient: QueryClient, previous: ListSnapshot): void {
  for (const [key, data] of previous) queryClient.setQueryData(key, data);
}

function useStatusMutation(action: (id: string) => Promise<ProjectDTO>, nextStatus: ProjectDTO['status']) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => action(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.lists });
      const previous = patchLists(queryClient, (items) =>
        items.map((p) => (p.id === id ? { ...p, status: nextStatus } : p)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) restoreLists(queryClient, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists });
    },
  });
}

export function useArchiveProject() {
  return useStatusMutation((id) => projectsApi.archive(id), 'archived');
}

export function useRestoreProject() {
  return useStatusMutation((id) => projectsApi.restore(id), 'active');
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.lists });
      const previous = patchLists(queryClient, (items) => items.filter((p) => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) restoreLists(queryClient, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists });
    },
  });
}

export function useUndoDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.undoDelete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists });
    },
  });
}
