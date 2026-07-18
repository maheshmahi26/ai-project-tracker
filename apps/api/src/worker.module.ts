import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { AiInfraModule } from './infra/ai/ai-infra.module';
import { QdrantModule } from './infra/qdrant/qdrant.module';
import { EMAIL_QUEUE } from './modules/mail/mail.service';
import { MailProcessor } from './modules/mail/mail.processor';
import { StorageService } from './modules/files/storage/storage.service';
import { S3StorageService } from './modules/files/storage/s3-storage.service';
import { DOCUMENT_QUEUE } from './modules/documents/documents.constants';
import { DocumentProcessor } from './modules/documents/indexing/document.processor';
import { DocumentIndexer } from './modules/documents/indexing/document-indexer.service';
import {
  DocumentsRepository,
  MongoDocumentsRepository,
} from './modules/documents/documents.repository';
import {
  EmbeddingsRepository,
  MongoEmbeddingsRepository,
} from './modules/documents/embeddings.repository';
import { DocEntity, DocumentSchema } from './modules/documents/schemas/document.schema';
import { Embedding, EmbeddingSchema } from './modules/documents/schemas/embedding.schema';
import { buildLoggerOptions } from './observability/logger';

/**
 * The background worker's root module. It shares infra with the API but runs no
 * HTTP server. BullMQ processors consume queues here using the shared Redis
 * connection: `email` (transactional mail) and `index-document` (RAG ingestion).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot(buildLoggerOptions()),
    RedisModule,
    DatabaseModule,
    QueueModule,
    AiInfraModule,
    QdrantModule,
    MongooseModule.forFeature([
      { name: DocEntity.name, schema: DocumentSchema },
      { name: Embedding.name, schema: EmbeddingSchema },
    ]),
    BullModule.registerQueue({ name: EMAIL_QUEUE }, { name: DOCUMENT_QUEUE }),
  ],
  providers: [
    MailProcessor,
    DocumentProcessor,
    DocumentIndexer,
    { provide: StorageService, useClass: S3StorageService },
    { provide: DocumentsRepository, useClass: MongoDocumentsRepository },
    { provide: EmbeddingsRepository, useClass: MongoEmbeddingsRepository },
  ],
})
export class WorkerModule {}
