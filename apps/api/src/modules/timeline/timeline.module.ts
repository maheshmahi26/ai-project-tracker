import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ActivityController } from './activity.controller';
import { AuditController } from './audit.controller';

/**
 * Read endpoints for the activity timeline + audit log. The write side lives in
 * the (global) Activity/Audit modules, fed by the domain event bus. This module
 * only imports OrganizationsModule so TenantGuard/PermissionsGuard can resolve
 * membership + role.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [ActivityController, AuditController],
})
export class TimelineModule {}
