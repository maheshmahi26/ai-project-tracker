import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentDTO } from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import {
  documentsApi,
  uploadDocument,
  type DocumentListParams,
} from '../api/documents-api';

/** Documents list. Polls while any document is still ingesting so status badges live-update. */
export function useDocuments(params: DocumentListParams = {}) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.documents.list(orgId, params as unknown as Record<string, unknown>),
    queryFn: () => documentsApi.list(params),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const pending = items.some((d) => d.status === 'uploaded' || d.status === 'processing');
      return pending ? 3000 : false;
    },
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { file: File; title?: string; projectId?: string }) =>
      uploadDocument(vars.file, { title: vars.title, projectId: vars.projectId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists });
    },
  });
}

export function useSemanticSearch() {
  return useMutation({
    mutationFn: (vars: { query: string; projectId?: string; limit?: number }) =>
      documentsApi.semanticSearch(vars),
  });
}

export function useGenerateDocTasks() {
  return useMutation({
    mutationFn: (vars: { id: string; count?: number }) =>
      documentsApi.generateTasks(vars.id, vars.count),
  });
}

/** True when a document is still being ingested (upload confirmed, not yet indexed). */
export function isIngesting(doc: DocumentDTO): boolean {
  return doc.status === 'uploaded' || doc.status === 'processing';
}
