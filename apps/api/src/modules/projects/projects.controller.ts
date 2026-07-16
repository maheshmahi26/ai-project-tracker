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
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectDTO,
  type UpdateProjectInput,
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
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('projects')
@UseGuards(TenantGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Permissions('project:create')
  @ApiOperation({ summary: 'Create a project' })
  create(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    return this.projects.createProject(org.orgId, org.userId, body, meta(req));
  }

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List projects (filter/sort/paginate/search)' })
  list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema)) query: ListProjectsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<ProjectDTO>> {
    return this.projects.listProjects(org.orgId, query);
  }

  @Get(':id')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a project by id' })
  get(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<ProjectDTO> {
    return this.projects.getProject(org.orgId, id);
  }

  @Patch(':id')
  @Permissions('project:update')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    return this.projects.updateProject(org.orgId, org.userId, id, body, meta(req));
  }

  @Post(':id/archive')
  @Permissions('project:archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a project' })
  archive(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    return this.projects.archiveProject(org.orgId, org.userId, id, meta(req));
  }

  @Post(':id/restore')
  @Permissions('project:archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived project' })
  restore(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    return this.projects.restoreProject(org.orgId, org.userId, id, meta(req));
  }

  @Delete(':id')
  @Permissions('project:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a project' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.projects.deleteProject(org.orgId, org.userId, id, meta(req));
    return { success: true };
  }

  @Post(':id/undo-delete')
  @Permissions('project:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a soft-delete (within retention)' })
  undoDelete(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    return this.projects.undoDelete(org.orgId, org.userId, id, meta(req));
  }
}

function meta(req: Request): RequestMeta {
  return {
    requestId: getRequestId(req),
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
