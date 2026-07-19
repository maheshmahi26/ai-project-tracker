import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  burndownQuerySchema,
  dashboardScopeQuerySchema,
  type BurndownDTO,
  type BurndownQuery,
  type DashboardOverviewDTO,
  type DashboardScopeQuery,
  type PriorityDistributionDTO,
  type ProjectProgressDTO,
  type TasksPerUserDTO,
  type UsersByRoleDTO,
  type VelocityPointDTO,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('dashboard')
@UseGuards(TenantGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Permissions('read')
  @ApiOperation({ summary: 'Counts across projects, tasks, sprints, and points (cached)' })
  overview(
    @Query(new ZodValidationPipe(dashboardScopeQuerySchema)) query: DashboardScopeQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<DashboardOverviewDTO> {
    return this.dashboard.overview(org.orgId, query);
  }

  @Get('velocity')
  @Permissions('read')
  @ApiOperation({ summary: 'Committed vs completed points per sprint' })
  velocity(
    @Query(new ZodValidationPipe(dashboardScopeQuerySchema)) query: DashboardScopeQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<VelocityPointDTO[]> {
    return this.dashboard.velocity(org.orgId, query);
  }

  @Get('burndown')
  @Permissions('read')
  @ApiOperation({ summary: 'Ideal vs remaining points over a sprint' })
  burndown(
    @Query(new ZodValidationPipe(burndownQuerySchema)) query: BurndownQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<BurndownDTO> {
    return this.dashboard.burndown(org.orgId, query.sprintId);
  }

  @Get('tasks-per-user')
  @Permissions('read')
  @ApiOperation({ summary: 'Task counts and points grouped by assignee' })
  tasksPerUser(
    @Query(new ZodValidationPipe(dashboardScopeQuerySchema)) query: DashboardScopeQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<TasksPerUserDTO[]> {
    return this.dashboard.tasksPerUser(org.orgId, query);
  }

  @Get('priority-distribution')
  @Permissions('read')
  @ApiOperation({ summary: 'Task counts by priority' })
  priorityDistribution(
    @Query(new ZodValidationPipe(dashboardScopeQuerySchema)) query: DashboardScopeQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PriorityDistributionDTO[]> {
    return this.dashboard.priorityDistribution(org.orgId, query);
  }

  @Get('project-progress')
  @Permissions('read')
  @ApiOperation({ summary: 'Completion percentage per project' })
  projectProgress(@CurrentOrg() org: OrgContext): Promise<ProjectProgressDTO[]> {
    return this.dashboard.projectProgress(org.orgId);
  }

  @Get('users-by-role')
  @Permissions('read')
  @ApiOperation({ summary: 'Active member counts grouped by role' })
  usersByRole(@CurrentOrg() org: OrgContext): Promise<UsersByRoleDTO> {
    return this.dashboard.usersByRole(org.orgId);
  }
}
