import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listActivityQuerySchema,
  type ActivityLogDTO,
  type ListActivityQuery,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { ActivityService } from '../activity/activity.service';

@ApiTags('activity')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('activity')
@UseGuards(TenantGuard, PermissionsGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'Activity timeline (filter by project / entity)' })
  list(
    @Query(new ZodValidationPipe(listActivityQuerySchema)) query: ListActivityQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<ActivityLogDTO>> {
    return this.activity.list(org.orgId, query);
  }
}
