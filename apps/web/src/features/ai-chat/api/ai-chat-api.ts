import type {
  AiToolInfoDTO,
  ApiMeta,
  ChatMessageDTO,
  ChatSessionDTO,
  ChatSseEvent,
  CreateChatSessionInput,
  UpdateChatSessionInput,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export interface SessionsPage {
  items: ChatSessionDTO[];
  page?: ApiMeta['page'];
}

export interface MessagesPage {
  items: ChatMessageDTO[];
  page?: ApiMeta['page'];
}

export const aiChatApi = {
  listSessions: (params: { limit?: number; cursor?: string } = {}): Promise<SessionsPage> =>
    apiClient
      .getWithMeta<ChatSessionDTO[]>('/ai/chat/sessions', {
        params: { limit: params.limit ?? 30, cursor: params.cursor },
      })
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  getSession: (id: string): Promise<ChatSessionDTO> =>
    apiClient.get<ChatSessionDTO>(`/ai/chat/sessions/${id}`),

  createSession: (body: CreateChatSessionInput = {}): Promise<ChatSessionDTO> =>
    apiClient.post<ChatSessionDTO>('/ai/chat/sessions', body),

  renameSession: (id: string, body: UpdateChatSessionInput): Promise<ChatSessionDTO> =>
    apiClient.patch<ChatSessionDTO>(`/ai/chat/sessions/${id}`, body),

  deleteSession: (id: string): Promise<void> =>
    apiClient.delete<void>(`/ai/chat/sessions/${id}`),

  listMessages: (id: string, params: { limit?: number; cursor?: string } = {}): Promise<MessagesPage> =>
    apiClient
      .getWithMeta<ChatMessageDTO[]>(`/ai/chat/sessions/${id}/messages`, {
        params: { limit: params.limit ?? 100, cursor: params.cursor },
      })
      .then(({ data, meta }) => ({ items: data, page: meta.page })),

  listTools: (): Promise<AiToolInfoDTO[]> => apiClient.get<AiToolInfoDTO[]>('/ai/tools'),

  /**
   * Sends a user message and streams the agent reply. Each decoded SSE frame is
   * parsed into a {@link ChatSseEvent} and handed to `onEvent`. Resolves when the
   * stream ends (`done`/`error`) or the caller aborts via `signal`.
   */
  async streamMessage(
    sessionId: string,
    content: string,
    onEvent: (event: ChatSseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const frames = apiClient.postSse(
      `/ai/chat/sessions/${sessionId}/messages`,
      { content },
      { signal },
    );
    for await (const frame of frames) {
      let parsed: ChatSseEvent;
      try {
        parsed = JSON.parse(frame.data) as ChatSseEvent;
      } catch {
        continue;
      }
      onEvent(parsed);
      if (parsed.type === 'done' || parsed.type === 'error') return;
    }
  },
};
