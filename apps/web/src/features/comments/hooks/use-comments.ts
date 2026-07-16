import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCommentInput, UpdateCommentInput } from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { commentsApi } from '../api/comments-api';

export function useComments(taskId: string | undefined) {
  return useQuery({
    queryKey: taskId ? queryKeys.comments.list(taskId) : ['comments', 'list', 'none'],
    queryFn: () => commentsApi.list(taskId as string),
    enabled: Boolean(taskId),
    select: (page) => page.items,
  });
}

function useInvalidate(taskId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.comments.list(taskId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
  };
}

export function useCreateComment(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (input: CreateCommentInput) => commentsApi.create(taskId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateComment(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateCommentInput }) =>
      commentsApi.update(taskId, vars.id, vars.input),
    onSuccess: invalidate,
  });
}

export function useDeleteComment(taskId: string) {
  const invalidate = useInvalidate(taskId);
  return useMutation({
    mutationFn: (id: string) => commentsApi.remove(taskId, id),
    onSuccess: invalidate,
  });
}
