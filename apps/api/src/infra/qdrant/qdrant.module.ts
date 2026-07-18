import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { HttpQdrantClient, QdrantClient } from './qdrant.client';

/**
 * Provides the Qdrant vector-store client app-wide. Global so both the API
 * (documents delete-sync, retrieval) and the worker (ingestion upsert) can inject
 * {@link QdrantClient} without re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [{ provide: QdrantClient, useClass: HttpQdrantClient }],
  exports: [QdrantClient],
})
export class QdrantModule {}
