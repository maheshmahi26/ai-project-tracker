import { useCallback, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ChatMessageDTO, ChatSessionDTO } from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { ApiClientError } from '@/lib/api-client';
import { aiChatApi } from '../api/ai-chat-api';
import { initialTurn, streamReducer, type StreamingTurn } from '../lib/chat-stream';

export function useChatSessions() {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.aiChat.sessions(orgId),
    queryFn: () => aiChatApi.listSessions({ limit: 50 }).then((p) => p.items),
    enabled: !!orgId,
  });
}

export function useChatTools() {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.aiChat.tools(orgId),
    queryFn: () => aiChatApi.listTools(),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Loads a session's messages newest-first (paged), flattened + reversed to
 * chronological order for rendering. `fetchNextPage` loads *earlier* history.
 */
export function useChatMessages(sessionId: string | undefined) {
  const orgId = useOrgStore((s) => s.activeOrgId);
  const query = useInfiniteQuery({
    queryKey: queryKeys.aiChat.messages(orgId, sessionId ?? 'none'),
    enabled: !!orgId && !!sessionId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      aiChatApi.listMessages(sessionId as string, { limit: 100, cursor: pageParam }),
    getNextPageParam: (last) => (last.page?.hasMore ? (last.page?.nextCursor ?? undefined) : undefined),
  });

  const messages: ChatMessageDTO[] = query.data
    ? query.data.pages.flatMap((p) => p.items).reverse()
    : [];

  return { ...query, messages };
}

export function useCreateSession() {
  const qc = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useMutation({
    mutationFn: (input: { title?: string; projectId?: string } = {}) =>
      aiChatApi.createSession(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.aiChat.sessions(orgId) });
    },
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      aiChatApi.renameSession(id, { title }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.aiChat.sessions(orgId) });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useMutation({
    mutationFn: (id: string) => aiChatApi.deleteSession(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<ChatSessionDTO[]>(queryKeys.aiChat.sessions(orgId), (prev) =>
        prev ? prev.filter((s) => s.id !== id) : prev,
      );
    },
  });
}

export interface SendChatState {
  /** The user turn shown optimistically while the reply streams. */
  pendingUser: string | null;
  /** Live assistant turn being streamed, or null when idle. */
  turn: StreamingTurn | null;
  isStreaming: boolean;
}

/**
 * Drives a single streaming turn for a session: pushes the user message
 * optimistically, folds SSE events through {@link streamReducer}, then refetches
 * persisted messages/sessions when the stream completes.
 */
export function useSendMessage(sessionId: string | undefined) {
  const qc = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  const [state, setState] = useState<SendChatState>({
    pendingUser: null,
    turn: null,
    isStreaming: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (content: string): Promise<void> => {
      if (!sessionId || state.isStreaming) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ pendingUser: content, turn: initialTurn(), isStreaming: true });

      try {
        await aiChatApi.streamMessage(
          sessionId,
          content,
          (event) => setState((s) => (s.turn ? { ...s, turn: streamReducer(s.turn, event) } : s)),
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          const message =
            err instanceof ApiClientError ? err.message : 'The assistant is unavailable right now.';
          setState((s) =>
            s.turn
              ? { ...s, turn: { ...s.turn, status: 'error', error: { code: 'STREAM_FAILED', message } } }
              : s,
          );
        }
      } finally {
        await qc.invalidateQueries({ queryKey: queryKeys.aiChat.messages(orgId, sessionId) });
        void qc.invalidateQueries({ queryKey: queryKeys.aiChat.sessions(orgId) });
        // Also refresh boards/lists — an AI write may have changed tasks/projects.
        void qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
        void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
        setState({ pendingUser: null, turn: null, isStreaming: false });
        abortRef.current = null;
      }
    },
    [sessionId, state.isStreaming, qc, orgId],
  );

  return { ...state, send, stop };
}
