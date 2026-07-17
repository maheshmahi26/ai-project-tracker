import type { Content } from '@google/genai';
import type { AiExecutionStatus, ChatSseEvent } from '@ai-projectos/shared';
import type { ToolContext } from '../tools/ai-tool';

/** Sink for streamed SSE events emitted while the graph runs. */
export type AgentEmit = (event: ChatSseEvent) => void;

/** One executed tool call, captured for persistence + observability. */
export interface RecordedToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  data?: unknown;
  error?: { code: string; message: string } | null;
}

export interface AgentRunParams {
  ctx: ToolContext;
  systemInstruction: string;
  /** Prior conversation turns (oldest→newest), already in Gemini shape. */
  history: Content[];
  /** The new user message text. */
  userMessage: string;
  emit: AgentEmit;
  /** Hard-stop signal for the whole run (client disconnect / run timeout). */
  signal?: AbortSignal;
}

export interface AgentRunResult {
  text: string;
  status: AiExecutionStatus;
  toolCalls: RecordedToolCall[];
  tokens: { in: number; out: number };
  iterations: number;
  /** Human-readable node path, e.g. `ingest→reason→act→reason→respond`. */
  graphState: string;
}
