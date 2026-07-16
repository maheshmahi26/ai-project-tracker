import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
  type NotificationDTO,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('notifications')
@UseGuards(TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List my notifications (newest first)' })
  list(
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<NotificationDTO>> {
    return this.notifications.list(org.orgId, org.userId, query);
  }

  @Post('read-all')
  @Permissions('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all my notifications read' })
  readAll(@CurrentOrg() org: OrgContext): Promise<{ updated: number }> {
    return this.notifications.markAllRead(org.orgId, org.userId);
  }

  @Post(':id/read')
  @Permissions('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification read' })
  async read(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<{ success: true }> {
    await this.notifications.markRead(org.orgId, org.userId, id);
    return { success: true };
  }
}
