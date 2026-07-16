import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MongoFilesRepository, FilesRepository } from './files.repository';
import { StorageService } from './storage/storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { FileAsset, FileSchema } from './schemas/file.schema';

@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    TasksModule,
    MongooseModule.forFeature([{ name: FileAsset.name, schema: FileSchema }]),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FilesRepository, useClass: MongoFilesRepository },
    { provide: StorageService, useClass: S3StorageService },
  ],
  exports: [FilesService, StorageService],
})
export class FilesModule {}
