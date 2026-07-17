import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Content } from '@google/genai';
import type {
  ChatSessionDTO,
  ChatToolCallDTO,
  ChatToolResultDTO,
  Role,
} from '@ai-projectos/shared';
import { AuditService } from '../audit/audit.service';
import { GeminiClient } from '../../infra/ai/gemini.client';
import { AgentRunner } from './agent/agent-runner.service';
import { buildSystemPrompt } from './agent/system-prompt';
import type { AgentEmit, RecordedToolCall } from './agent/agent.types';
import { ChatSessionsRepository } from './repositories/chat-sessions.repository';
import { ChatMessagesRepository, type ChatMessageLean } from './repositories/chat-messages.repository';
import { AiExecutionsRepository } from './repositories/ai-executions.repository';

const HISTORY_LIMIT = 20;

export interface StreamReplyParams {
  session: ChatSessionDTO;
  orgId: string;
  userId: string;
  role: Role;
  content: string;
  requestId: string;
  emit: AgentEmit;
  signal?: AbortSignal;
}

/**
 * Orchestrates a single chat turn: seed memory → run the LangGraph agent (which
 * streams tokens + tool events) → persist the assistant message + full
 * {@link AiExecution} trace + an audit row (`source: 'ai'`) → emit `done`.
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly runner: AgentRunner,
    private readonly gemini: GeminiClient,
    private readonly sessions: ChatSessionsRepository,
    private readonly messages: ChatMessagesRepository,
    private readonly executions: AiExecutionsRepository,
    private readonly audit: AuditService,
  ) {}

  async streamReply(params: StreamReplyParams): Promise<void> {
    const { orgId, userId, session, content, requestId } = params;
    const principal = { userId, orgId, role: params.role };

    // 1. Load prior turns BEFORE persisting the new user message (no duplication).
    const priorRows = await this.messages.recentForContext(orgId, session.id, HISTORY_LIMIT);
    const history = toHistoryContents(priorRows);

    // 2. Persist the user turn.
    await this.messages.create({
      orgId: new Types.ObjectId(orgId),
      sessionId: new Types.ObjectId(session.id),
      userId: new Types.ObjectId(userId),
      role: 'user',
      content,
    });

    // 3. Run the agent (streams token/tool events through `emit`).
    const started = Date.now();
    const result = await this.runner.run({
      ctx: { principal, requestId, sessionId: session.id, signal: params.signal },
      systemInstruction: buildSystemPrompt(principal),
      history,
      userMessage: content,
      emit: params.emit,
      signal: params.signal,
    });
    const latencyMs = Date.now() - started;

    // 4. Persist the assistant turn (with tool cards) + execution trace.
    const toolCalls: ChatToolCallDTO[] = result.toolCalls.map((tc) => ({
      callId: tc.callId,
      name: tc.name,
      args: tc.args,
    }));
    const toolResults: ChatToolResultDTO[] = result.toolCalls.map((tc) => ({
      callId: tc.callId,
      ok: tc.ok,
      data: tc.data,
      error: tc.error ?? null,
    }));

    const assistant = await this.messages.create({
      orgId: new Types.ObjectId(orgId),
      sessionId: new Types.ObjectId(session.id),
      userId: new Types.ObjectId(userId),
      role: 'assistant',
      content: result.text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      toolResults: toolResults.length ? toolResults : undefined,
      tokens: result.tokens,
    });

    const execution = await this.executions.create({
      orgId: new Types.ObjectId(orgId),
      userId: new Types.ObjectId(userId),
      sessionId: new Types.ObjectId(session.id),
      messageId: assistant._id,
      prompt: content,
      model: this.gemini.model,
      status: result.status,
      graphState: result.graphState,
      toolCalls: result.toolCalls.map(toExecutionToolCall),
      latencyMs,
      iterations: result.iterations,
      tokens: result.tokens,
    });

    // 5. Bump session counters + title, then audit the AI action.
    await this.sessions.touch(session.id, 2);
    if (session.messageCount === 0 && session.title === 'New chat') {
      await this.sessions.update(orgId, userId, session.id, { title: deriveTitle(content) });
    }

    await this.audit.record({
      action: 'ai.chat.respond',
      actorId: userId,
      actorType: 'ai',
      orgId,
      entity: { type: 'chat_session', id: session.id },
      source: 'ai',
      requestId,
      after: {
        status: result.status,
        tools: result.toolCalls.map((tc) => tc.name),
        executionId: execution._id.toString(),
      },
    });

    params.emit({
      type: 'done',
      messageId: assistant._id.toString(),
      executionId: execution._id.toString(),
      status: result.status,
    });
  }
}

function toExecutionToolCall(tc: RecordedToolCall) {
  return {
    name: tc.name,
    args: tc.args,
    ok: tc.ok,
    ms: tc.ms,
    error: tc.error ? tc.error.message : null,
  };
}

/** Text-only reconstruction of prior turns. Tool-call plumbing is not replayed. */
function toHistoryContents(rows: ChatMessageLean[]): Content[] {
  const contents: Content[] = [];
  for (const row of rows) {
    if (!row.content) continue;
    if (row.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: row.content }] });
    } else if (row.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: row.content }] });
    }
  }
  return contents;
}

function deriveTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'New chat';
}
