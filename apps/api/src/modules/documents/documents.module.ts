import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { FilesModule } from '../files/files.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository, MongoDocumentsRepository } from './documents.repository';
import { EmbeddingsRepository, MongoEmbeddingsRepository } from './embeddings.repository';
import { DocEntity, DocumentSchema } from './schemas/document.schema';
import { Embedding, EmbeddingSchema } from './schemas/embedding.schema';
import { DOCUMENT_QUEUE } from './documents.constants';

/**
 * API-side documents module: presign/confirm/list/get/delete + enqueue indexing.
 * The heavy indexer runs in the worker process (see WorkerModule); here we only
 * produce jobs and keep the vector store in sync on delete. `QdrantClient` comes
 * from the global QdrantModule; `StorageService` is re-exported by FilesModule.
 */
@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    FilesModule,
    MongooseModule.forFeature([
      { name: DocEntity.name, schema: DocumentSchema },
      { name: Embedding.name, schema: EmbeddingSchema },
    ]),
    BullModule.registerQueue({ name: DOCUMENT_QUEUE }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    { provide: DocumentsRepository, useClass: MongoDocumentsRepository },
    { provide: EmbeddingsRepository, useClass: MongoEmbeddingsRepository },
  ],
  exports: [DocumentsRepository, EmbeddingsRepository],
})
export class DocumentsModule {}
