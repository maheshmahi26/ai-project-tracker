import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listAuditQuerySchema,
  type AuditLogDTO,
  type ListAuditQuery,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

@ApiTags('audit')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('audit-logs')
@UseGuards(TenantGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  // `export` is held by admin + manager — the compliance-viewing roles.
  @Permissions('export')
  @ApiOperation({ summary: 'Audit log (admin/manager): who changed what, with diffs' })
  list(
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<AuditLogDTO>> {
    return this.audit.list(org.orgId, query);
  }
}
