import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { EMAIL_QUEUE } from './modules/mail/mail.service';
import { MailProcessor } from './modules/mail/mail.processor';
import { buildLoggerOptions } from './observability/logger';

/**
 * The background worker's root module. It shares infra with the API but runs no
 * HTTP server. BullMQ processors (email now; embeddings, reports, notifications
 * later) consume queues here using the shared Redis connection.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot(buildLoggerOptions()),
    RedisModule,
    DatabaseModule,
    QueueModule,
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  providers: [MailProcessor],
})
export class WorkerModule {}
