import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  createChatSessionSchema,
  listChatMessagesQuerySchema,
  listChatSessionsQuerySchema,
  sendChatMessageSchema,
  updateChatSessionSchema,
  type AiExecutionDTO,
  type AiToolInfoDTO,
  type ChatMessageDTO,
  type ChatSessionDTO,
  type ChatSseEvent,
  type CreateChatSessionInput,
  type ListChatMessagesQuery,
  type ListChatSessionsQuery,
  type SendChatMessageInput,
  type UpdateChatSessionInput,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { Passthrough } from '../../common/decorators/passthrough.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import { getRequestId } from '../../common/request/request-context';
import { GeminiClient } from '../../infra/ai/gemini.client';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { AgentService } from './agent.service';
import { ToolRegistry } from './tools/tool-registry';

@ApiTags('ai')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('ai')
@UseGuards(TenantGuard, PermissionsGuard)
export class AiController {
  constructor(
    private readonly chat: ChatService,
    private readonly agent: AgentService,
    private readonly registry: ToolRegistry,
    private readonly gemini: GeminiClient,
  ) {}

  @Get('tools')
  @Permissions('read')
  @ApiOperation({ summary: 'Introspect the tools available to the caller (schemas + permissions)' })
  tools(@CurrentOrg() org: OrgContext): AiToolInfoDTO[] {
    return this.registry.toInfo(org.role);
  }

  @Get('executions/:id')
  @Permissions('read')
  @ApiOperation({ summary: 'Fetch a persisted agent run trace' })
  execution(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<AiExecutionDTO> {
    return this.chat.getExecutionOrThrow(org.orgId, id);
  }

  @Post('chat/sessions')
  @Permissions('read')
  @ApiOperation({ summary: 'Create a chat session' })
  createSession(
    @Body(new ZodValidationPipe(createChatSessionSchema)) body: CreateChatSessionInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<ChatSessionDTO> {
    return this.chat.createSession(org.orgId, org.userId, body);
  }

  @Get('chat/sessions')
  @Permissions('read')
  @ApiOperation({ summary: 'List my chat sessions (newest first)' })
  listSessions(
    @Query(new ZodValidationPipe(listChatSessionsQuerySchema)) query: ListChatSessionsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<ChatSessionDTO>> {
    return this.chat.listSessions(org.orgId, org.userId, query);
  }

  @Get('chat/sessions/:id')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a chat session' })
  getSession(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<ChatSessionDTO> {
    return this.chat.getSessionOrThrow(org.orgId, org.userId, id);
  }

  @Patch('chat/sessions/:id')
  @Permissions('read')
  @ApiOperation({ summary: 'Rename a chat session' })
  updateSession(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateChatSessionSchema)) body: UpdateChatSessionInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<ChatSessionDTO> {
    return this.chat.updateSession(org.orgId, org.userId, id, body);
  }

  @Delete('chat/sessions/:id')
  @Permissions('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chat session' })
  async deleteSession(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<void> {
    await this.chat.deleteSession(org.orgId, org.userId, id);
  }

  @Get('chat/sessions/:id/messages')
  @Permissions('read')
  @ApiOperation({ summary: 'List messages in a chat session' })
  listMessages(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listChatMessagesQuerySchema)) query: ListChatMessagesQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<ChatMessageDTO>> {
    return this.chat.listMessages(org.orgId, org.userId, id, query);
  }

  @Post('chat/sessions/:id/messages')
  @Permissions('read')
  @Passthrough()
  @ApiOperation({ summary: 'Send a message; streams the agent reply as Server-Sent Events' })
  async sendMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendChatMessageSchema)) body: SendChatMessageInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Validate before opening the SSE stream so failures return a JSON error.
    const session = await this.chat.getSessionOrThrow(org.orgId, org.userId, id);
    if (!this.gemini.isConfigured) {
      throw AppException.unavailable('AI is not configured on this server');
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable proxy buffering so tokens flush immediately (nginx).
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const emit = (event: ChatSseEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    try {
      await this.agent.streamReply({
        session,
        orgId: org.orgId,
        userId: org.userId,
        role: org.role,
        content: body.content,
        requestId: getRequestId(req),
        emit,
        signal: abort.signal,
      });
    } catch {
      emit({ type: 'error', code: 'AGENT_FAILED', message: 'Failed to generate a reply' });
    } finally {
      res.end();
    }
  }
}
