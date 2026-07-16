import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileScope } from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { filesApi, uploadFile } from '../api/files-api';

export function useFiles(scope: FileScope | null) {
  return useQuery({
    queryKey: scope
      ? queryKeys.files.list(scope.type, scope.id)
      : ['files', 'list', 'none'],
    queryFn: () => filesApi.list(scope as FileScope),
    enabled: Boolean(scope),
  });
}

function useInvalidate(scope: FileScope) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.files.list(scope.type, scope.id) });
    if (scope.type === 'task') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(scope.id) });
    }
  };
}

export function useUploadFile(scope: FileScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (file: File) => uploadFile(file, scope),
    onSuccess: invalidate,
  });
}

export function useDeleteFile(scope: FileScope) {
  const invalidate = useInvalidate(scope);
  return useMutation({
    mutationFn: (id: string) => filesApi.remove(id),
    onSuccess: invalidate,
  });
}

/** Opens a fresh presigned download URL in a new tab. */
export function useDownloadFile() {
  return useMutation({
    mutationFn: (id: string) => filesApi.download(id),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });
}
