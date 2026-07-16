import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { MongoLabelsRepository, LabelsRepository } from './labels.repository';
import { Label, LabelSchema } from './schemas/label.schema';

@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    TasksModule,
    MongooseModule.forFeature([{ name: Label.name, schema: LabelSchema }]),
  ],
  controllers: [LabelsController],
  providers: [LabelsService, { provide: LabelsRepository, useClass: MongoLabelsRepository }],
  exports: [LabelsService],
})
export class LabelsModule {}
