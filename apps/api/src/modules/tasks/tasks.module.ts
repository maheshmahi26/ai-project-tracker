import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { SprintsModule } from '../sprints/sprints.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { MongoTasksRepository, TasksRepository } from './tasks.repository';
import { Task, TaskSchema } from './schemas/task.schema';

@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    forwardRef(() => SprintsModule),
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
  controllers: [TasksController],
  providers: [TasksService, { provide: TasksRepository, useClass: MongoTasksRepository }],
  exports: [TasksService, TasksRepository],
})
export class TasksModule {}
