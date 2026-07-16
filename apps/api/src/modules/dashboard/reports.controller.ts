import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  exportTasksQuerySchema,
  weeklyReportQuerySchema,
  type ExportTasksQuery,
  type WeeklyReportDTO,
  type WeeklyReportQuery,
} from '@ai-projectos/shared';
import { Passthrough } from '../../common/decorators/passthrough.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@ApiTags('reports')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('reports')
@UseGuards(TenantGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('weekly')
  @Permissions('read')
  @ApiOperation({ summary: 'Aggregated weekly summary (no AI)' })
  weekly(
    @Query(new ZodValidationPipe(weeklyReportQuerySchema)) query: WeeklyReportQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<WeeklyReportDTO> {
    return this.dashboard.weeklyReport(org.orgId, query);
  }

  @Get('tasks.csv')
  @Permissions('export')
  @Passthrough()
  @ApiOperation({ summary: 'Export tasks as CSV (requires export permission)' })
  async exportTasks(
    @Query(new ZodValidationPipe(exportTasksQuerySchema)) query: ExportTasksQuery,
    @CurrentOrg() org: OrgContext,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.dashboard.exportTasksCsv(org.orgId, query);
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="tasks.csv"')
      .send(csv);
  }
}
