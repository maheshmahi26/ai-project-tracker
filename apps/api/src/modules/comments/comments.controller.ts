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
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createCommentSchema,
  listCommentsQuerySchema,
  updateCommentSchema,
  type CommentDTO,
  type CreateCommentInput,
  type ListCommentsQuery,
  type UpdateCommentInput,
} from '@ai-projectos/shared';
import { getRequestId } from '../../common/request/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('tasks/:taskId/comments')
@UseGuards(TenantGuard, PermissionsGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List a task’s comments' })
  list(
    @Param('taskId') taskId: string,
    @Query(new ZodValidationPipe(listCommentsQuerySchema)) query: ListCommentsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<CommentDTO>> {
    return this.comments.list(org.orgId, taskId, query);
  }

  @Post()
  @Permissions('task:update')
  @ApiOperation({ summary: 'Add a comment (with optional @mentions)' })
  create(
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<CommentDTO> {
    return this.comments.create(org.orgId, org.userId, taskId, body, meta(req));
  }

  @Patch(':id')
  @Permissions('task:update')
  @ApiOperation({ summary: 'Edit a comment (author only)' })
  update(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) body: UpdateCommentInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<CommentDTO> {
    return this.comments.update(org.orgId, org.userId, taskId, id, body, meta(req));
  }

  @Delete(':id')
  @Permissions('task:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment (author only)' })
  async remove(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.comments.remove(org.orgId, org.userId, taskId, id, meta(req));
    return { success: true };
  }
}

function meta(req: Request): RequestMeta {
  return {
    requestId: getRequestId(req),
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
