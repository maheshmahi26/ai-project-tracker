import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { MongoProjectsRepository, ProjectsRepository } from './projects.repository';
import { Project, ProjectSchema } from './schemas/project.schema';

@Module({
  imports: [
    // Provides MembershipsRepository for TenantGuard + PermissionsGuard.
    OrganizationsModule,
    MongooseModule.forFeature([{ name: Project.name, schema: ProjectSchema }]),
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    { provide: ProjectsRepository, useClass: MongoProjectsRepository },
  ],
  exports: [ProjectsService, ProjectsRepository],
})
export class ProjectsModule {}
