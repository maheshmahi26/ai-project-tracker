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
  assignTaskSchema,
  bulkDeleteTasksSchema,
  bulkUpdateTasksSchema,
  createSubtaskSchema,
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
  type AssignTaskInput,
  type BulkDeleteTasksInput,
  type BulkUpdateTasksInput,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type TaskDTO,
  type UpdateTaskInput,
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
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('tasks')
@UseGuards(TenantGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @Permissions('task:create')
  @ApiOperation({ summary: 'Create a task' })
  create(
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    return this.tasks.createTask(org.orgId, org.userId, body, meta(req));
  }

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List tasks (filter/sort/paginate/search)' })
  list(
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<TaskDTO>> {
    return this.tasks.listTasks(org.orgId, query);
  }

  @Post('bulk-update')
  @Permissions('task:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-update tasks' })
  bulkUpdate(
    @Body(new ZodValidationPipe(bulkUpdateTasksSchema)) body: BulkUpdateTasksInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ updated: number }> {
    return this.tasks.bulkUpdate(org.orgId, org.userId, body, meta(req));
  }

  @Post('bulk-delete')
  @Permissions('task:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk soft-delete tasks' })
  bulkDelete(
    @Body(new ZodValidationPipe(bulkDeleteTasksSchema)) body: BulkDeleteTasksInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ deleted: number }> {
    return this.tasks.bulkDelete(org.orgId, org.userId, body, meta(req));
  }

  @Get(':id')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a task by id' })
  get(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<TaskDTO> {
    return this.tasks.getTask(org.orgId, id);
  }

  @Patch(':id')
  @Permissions('task:update')
  @ApiOperation({ summary: 'Update a task' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    return this.tasks.updateTask(org.orgId, org.userId, id, body, meta(req));
  }

  @Delete(':id')
  @Permissions('task:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a task' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.tasks.deleteTask(org.orgId, org.userId, id, meta(req));
    return { success: true };
  }

  @Post(':id/undo-delete')
  @Permissions('task:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a soft-delete (within retention)' })
  undoDelete(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    return this.tasks.undoDelete(org.orgId, org.userId, id, meta(req));
  }

  @Post(':id/assign')
  @Permissions('task:assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or unassign) a task' })
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignTaskSchema)) body: AssignTaskInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    return this.tasks.assignTask(org.orgId, org.userId, id, body, meta(req));
  }

  @Post(':id/move')
  @Permissions('task:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a task (sprint / status / board order)' })
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveTaskSchema)) body: MoveTaskInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    return this.tasks.moveTask(org.orgId, org.userId, id, body, meta(req));
  }

  @Get(':id/subtasks')
  @Permissions('read')
  @ApiOperation({ summary: 'List subtasks of a task' })
  subtasks(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<PaginatedResult<TaskDTO>> {
    return this.tasks.listSubtasks(org.orgId, id);
  }

  @Post(':id/subtasks')
  @Permissions('task:create')
  @ApiOperation({ summary: 'Create a subtask under a task' })
  createSubtask(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createSubtaskSchema)) body: CreateSubtaskInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<TaskDTO> {
    // project + parent come from the path; service derives projectId from the parent.
    const input: CreateTaskInput = { ...body, parentId: id, projectId: id };
    return this.tasks.createTask(org.orgId, org.userId, input, meta(req));
  }
}

function meta(req: Request): RequestMeta {
  return {
    requestId: getRequestId(req),
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
