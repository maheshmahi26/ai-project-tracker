import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AssignTaskInput,
  BulkUpdateTasksInput,
  CreateSubtaskInput,
  CreateTaskInput,
  MoveTaskInput,
  UpdateTaskInput,
} from '@ai-projectos/shared';

type BulkTaskPatch = BulkUpdateTasksInput['patch'];
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { tasksApi, type TaskListParams, type TasksPage } from '../api/tasks-api';

// ── Table (infinite scroll) ──────────────────────────────────────────────────

export function useInfiniteTasks(params: TaskListParams) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.list(orgId, params as unknown as Record<string, unknown>),
    queryFn: ({ pageParam }) => tasksApi.list({ ...params, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page?.nextCursor ?? undefined,
  });
}

// ── Board (single project, grouped client-side) ──────────────────────────────

export function useTaskBoard(projectId: string | undefined) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: projectId ? queryKeys.tasks.board(orgId, projectId) : ['tasks', 'board', 'none'],
    queryFn: () => tasksApi.list({ projectId, parentId: 'none', sort: 'order', limit: 100 }),
    enabled: Boolean(projectId),
    select: (page) => page.items,
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.tasks.detail(id) : ['tasks', 'detail', 'none'],
    queryFn: () => tasksApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useSubtasks(parentId: string | undefined) {
  return useQuery({
    queryKey: parentId ? queryKeys.tasks.subtasks(parentId) : ['tasks', 'subtasks', 'none'],
    queryFn: () => tasksApi.listSubtasks(parentId as string),
    enabled: Boolean(parentId),
    select: (page) => page.items,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function invalidateTaskViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.boards });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: () => invalidateTaskViews(queryClient),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateTaskInput }) =>
      tasksApi.update(vars.id, vars.input),
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      invalidateTaskViews(queryClient);
    },
  });
}

export function useAssignTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: AssignTaskInput }) =>
      tasksApi.assign(vars.id, vars.input),
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      invalidateTaskViews(queryClient);
    },
  });
}

/**
 * Optimistic board move. The board query caches a `TasksPage`; we patch the moved
 * task's status/order immediately and roll back if the server rejects it.
 */
export function useMoveTask(projectId: string) {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  const boardKey = queryKeys.tasks.board(orgId, projectId);

  return useMutation({
    mutationFn: (vars: { id: string; input: MoveTaskInput }) => tasksApi.move(vars.id, vars.input),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<TasksPage>(boardKey);
      queryClient.setQueryData<TasksPage>(boardKey, (old) => {
        if (!old) return old;
        const items = old.items.map((t) =>
          t.id === vars.id
            ? {
                ...t,
                status: vars.input.status ?? t.status,
                order: vars.input.order ?? t.order,
              }
            : t,
        );
        items.sort((a, b) => a.order - b.order);
        return { ...old, items };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: boardKey });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => invalidateTaskViews(queryClient),
  });
}

export function useUndoDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.undoDelete(id),
    onSuccess: () => invalidateTaskViews(queryClient),
  });
}

export function useBulkUpdateTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { ids: string[]; patch: BulkTaskPatch }) => tasksApi.bulkUpdate(vars),
    onSuccess: () => invalidateTaskViews(queryClient),
  });
}

export function useBulkDeleteTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => tasksApi.bulkDelete({ ids }),
    onSuccess: () => invalidateTaskViews(queryClient),
  });
}

export function useCreateSubtask(parentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubtaskInput) => tasksApi.createSubtask(parentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(parentId) });
      invalidateTaskViews(queryClient);
    },
  });
}
