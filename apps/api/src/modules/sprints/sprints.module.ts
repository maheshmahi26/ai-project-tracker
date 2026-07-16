import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';
import { MongoSprintsRepository, SprintsRepository } from './sprints.repository';
import { Sprint, SprintSchema } from './schemas/sprint.schema';

@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    forwardRef(() => TasksModule),
    MongooseModule.forFeature([{ name: Sprint.name, schema: SprintSchema }]),
  ],
  controllers: [SprintsController],
  providers: [SprintsService, { provide: SprintsRepository, useClass: MongoSprintsRepository }],
  exports: [SprintsService, SprintsRepository],
})
export class SprintsModule {}
