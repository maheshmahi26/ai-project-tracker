import type {
  AiExecutionStatus,
  ChatSseEvent,
  ChatToolCallDTO,
  ChatToolResultDTO,
} from '@ai-projectos/shared';

export type ToolCallStatus = 'running' | 'ok' | 'error';

/** A single tool invocation surfaced in the transcript, updated in place as its
 *  `tool_call` → `tool_result` events arrive. */
export interface StreamToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  data?: unknown;
  error?: { code: string; message: string } | null;
}

/** In-flight state for the assistant turn currently being streamed. `token`
 *  events append to `content`; tool events maintain the ordered `toolCalls`. */
export interface StreamingTurn {
  content: string;
  toolCalls: StreamToolCall[];
  status: 'streaming' | 'done' | 'error';
  error?: { code: string; message: string };
  messageId?: string;
  executionId?: string;
  finalStatus?: AiExecutionStatus;
}

export function initialTurn(): StreamingTurn {
  return { content: '', toolCalls: [], status: 'streaming' };
}

/**
 * Joins a persisted message's `toolCalls` with their matching `toolResults`
 * (by `callId`) into the same {@link StreamToolCall} shape the live stream uses,
 * so a reloaded conversation renders identical tool cards.
 */
export function mergeToolCalls(
  calls: ChatToolCallDTO[] = [],
  results: ChatToolResultDTO[] = [],
): StreamToolCall[] {
  const byId = new Map(results.map((r) => [r.callId, r]));
  return calls.map((c) => {
    const r = byId.get(c.callId);
    return {
      callId: c.callId,
      name: c.name,
      args: c.args,
      status: r ? (r.ok ? 'ok' : 'error') : 'ok',
      data: r?.data,
      error: r?.error ?? null,
    };
  });
}

/**
 * Pure reducer folding a single SSE event into the streaming turn. Kept free of
 * React/side-effects so it can be unit-tested and reused by the send hook.
 */
export function streamReducer(state: StreamingTurn, event: ChatSseEvent): StreamingTurn {
  switch (event.type) {
    case 'token':
      return { ...state, content: state.content + event.delta };

    case 'tool_call':
      // Ignore duplicate call ids (idempotent under retries).
      if (state.toolCalls.some((c) => c.callId === event.callId)) return state;
      return {
        ...state,
        toolCalls: [
          ...state.toolCalls,
          { callId: event.callId, name: event.name, args: event.args, status: 'running' },
        ],
      };

    case 'tool_result':
      return {
        ...state,
        toolCalls: state.toolCalls.map((c) =>
          c.callId === event.callId
            ? { ...c, status: event.ok ? 'ok' : 'error', data: event.data, error: event.error ?? null }
            : c,
        ),
      };

    case 'done':
      return {
        ...state,
        status: 'done',
        messageId: event.messageId,
        executionId: event.executionId,
        finalStatus: event.status,
      };

    case 'error':
      return {
        ...state,
        status: 'error',
        error: { code: event.code, message: event.message },
      };

    default:
      return state;
  }
}
