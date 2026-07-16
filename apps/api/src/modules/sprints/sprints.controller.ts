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
  createSprintSchema,
  listSprintsQuerySchema,
  updateSprintSchema,
  type CreateSprintInput,
  type ListSprintsQuery,
  type SprintDTO,
  type UpdateSprintInput,
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
import { SprintsService } from './sprints.service';

@ApiTags('sprints')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller()
@UseGuards(TenantGuard, PermissionsGuard)
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Post('projects/:projectId/sprints')
  @Permissions('sprint:manage')
  @ApiOperation({ summary: 'Create a sprint in a project' })
  create(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(createSprintSchema)) body: CreateSprintInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<SprintDTO> {
    return this.sprints.createSprint(org.orgId, org.userId, projectId, body, meta(req));
  }

  @Get('projects/:projectId/sprints')
  @Permissions('read')
  @ApiOperation({ summary: 'List sprints in a project' })
  list(
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(listSprintsQuerySchema)) query: ListSprintsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<SprintDTO>> {
    return this.sprints.listSprints(org.orgId, projectId, query);
  }

  @Get('sprints/:id')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a sprint by id' })
  get(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<SprintDTO> {
    return this.sprints.getSprint(org.orgId, id);
  }

  @Patch('sprints/:id')
  @Permissions('sprint:manage')
  @ApiOperation({ summary: 'Update a sprint' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSprintSchema)) body: UpdateSprintInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<SprintDTO> {
    return this.sprints.updateSprint(org.orgId, org.userId, id, body, meta(req));
  }

  @Post('sprints/:id/start')
  @Permissions('sprint:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  start(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<SprintDTO> {
    return this.sprints.startSprint(org.orgId, org.userId, id, meta(req));
  }

  @Post('sprints/:id/complete')
  @Permissions('sprint:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint (finalizes point totals)' })
  complete(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<SprintDTO> {
    return this.sprints.completeSprint(org.orgId, org.userId, id, meta(req));
  }

  @Delete('sprints/:id')
  @Permissions('sprint:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a sprint (detaches its tasks)' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.sprints.deleteSprint(org.orgId, org.userId, id, meta(req));
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
