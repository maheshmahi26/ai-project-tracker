import type { AiExecutionDTO, ChatMessageDTO, ChatSessionDTO } from '@ai-projectos/shared';
import type { ChatSessionLean } from './repositories/chat-sessions.repository';
import type { ChatMessageLean } from './repositories/chat-messages.repository';
import type { AiExecutionLean } from './repositories/ai-executions.repository';

export function toChatSessionDTO(row: ChatSessionLean): ChatSessionDTO {
  return {
    id: row._id.toString(),
    orgId: row.orgId.toString(),
    userId: row.userId.toString(),
    title: row.title,
    projectId: row.projectId ? row.projectId.toString() : null,
    summary: row.summary ?? '',
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    messageCount: row.messageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toChatMessageDTO(row: ChatMessageLean): ChatMessageDTO {
  return {
    id: row._id.toString(),
    orgId: row.orgId.toString(),
    sessionId: row.sessionId.toString(),
    userId: row.userId.toString(),
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls,
    toolResults: row.toolResults,
    tokens: row.tokens ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAiExecutionDTO(row: AiExecutionLean): AiExecutionDTO {
  return {
    id: row._id.toString(),
    orgId: row.orgId.toString(),
    userId: row.userId.toString(),
    sessionId: row.sessionId ? row.sessionId.toString() : null,
    messageId: row.messageId ? row.messageId.toString() : null,
    prompt: row.prompt,
    model: row.model,
    status: row.status,
    graphState: row.graphState,
    toolCalls: row.toolCalls,
    latencyMs: row.latencyMs,
    tokens: row.tokens,
    iterations: row.iterations,
    createdAt: row.createdAt.toISOString(),
  };
}
