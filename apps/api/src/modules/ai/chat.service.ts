import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  AiExecutionDTO,
  ChatMessageDTO,
  ChatSessionDTO,
  CreateChatSessionInput,
  ListChatMessagesQuery,
  ListChatSessionsQuery,
  UpdateChatSessionInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import { ChatSessionsRepository } from './repositories/chat-sessions.repository';
import { ChatMessagesRepository } from './repositories/chat-messages.repository';
import { AiExecutionsRepository } from './repositories/ai-executions.repository';
import { toAiExecutionDTO, toChatMessageDTO, toChatSessionDTO } from './ai.mapper';

/** Session/message reads + session lifecycle. The agent loop lives in AgentService. */
@Injectable()
export class ChatService {
  constructor(
    private readonly sessions: ChatSessionsRepository,
    private readonly messages: ChatMessagesRepository,
    private readonly executions: AiExecutionsRepository,
  ) {}

  async createSession(
    orgId: string,
    userId: string,
    input: CreateChatSessionInput,
  ): Promise<ChatSessionDTO> {
    const row = await this.sessions.create({
      orgId: new Types.ObjectId(orgId),
      userId: new Types.ObjectId(userId),
      title: input.title ?? 'New chat',
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : null,
    });
    return toChatSessionDTO(row);
  }

  async listSessions(
    orgId: string,
    userId: string,
    query: ListChatSessionsQuery,
  ): Promise<PaginatedResult<ChatSessionDTO>> {
    const rows = await this.sessions.list({
      orgId,
      userId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toChatSessionDTO), query.limit, (s) => s.id);
  }

  async getSessionOrThrow(orgId: string, userId: string, id: string): Promise<ChatSessionDTO> {
    const row = await this.sessions.findById(orgId, userId, id);
    if (!row) throw AppException.notFound('Chat session not found');
    return toChatSessionDTO(row);
  }

  async updateSession(
    orgId: string,
    userId: string,
    id: string,
    input: UpdateChatSessionInput,
  ): Promise<ChatSessionDTO> {
    const row = await this.sessions.update(orgId, userId, id, { title: input.title });
    if (!row) throw AppException.notFound('Chat session not found');
    return toChatSessionDTO(row);
  }

  async deleteSession(orgId: string, userId: string, id: string): Promise<void> {
    const ok = await this.sessions.softDelete(orgId, userId, id);
    if (!ok) throw AppException.notFound('Chat session not found');
  }

  async listMessages(
    orgId: string,
    userId: string,
    sessionId: string,
    query: ListChatMessagesQuery,
  ): Promise<PaginatedResult<ChatMessageDTO>> {
    // Ownership check: the session must belong to the caller.
    await this.getSessionOrThrow(orgId, userId, sessionId);
    const rows = await this.messages.list({
      orgId,
      sessionId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toChatMessageDTO), query.limit, (m) => m.id);
  }

  async getExecutionOrThrow(orgId: string, id: string): Promise<AiExecutionDTO> {
    const row = await this.executions.findById(orgId, id);
    if (!row) throw AppException.notFound('AI execution not found');
    return toAiExecutionDTO(row);
  }
}
