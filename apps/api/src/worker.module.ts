import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { buildLoggerOptions } from './observability/logger';

/**
 * The background worker's root module. It shares infra with the API but runs no
 * HTTP server. BullMQ processors (email, embeddings, reports, notifications) are
 * registered here in later tasks; for now it boots and connects to Redis/Mongo.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot(buildLoggerOptions()),
    RedisModule,
    DatabaseModule,
    QueueModule,
  ],
})
export class WorkerModule {}
