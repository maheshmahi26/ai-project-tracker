import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { Sprint, SprintSchema } from '../sprints/schemas/sprint.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { DashboardController } from './dashboard.controller';
import { ReportsController } from './reports.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardCache } from './dashboard.cache';
import { DashboardCacheListener } from './dashboard-cache.listener';

@Module({
  imports: [
    // Provides MembershipsRepository for TenantGuard + PermissionsGuard.
    OrganizationsModule,
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Sprint.name, schema: SprintSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
  ],
  controllers: [DashboardController, ReportsController],
  providers: [DashboardService, DashboardRepository, DashboardCache, DashboardCacheListener],
  exports: [DashboardService],
})
export class DashboardModule {}
