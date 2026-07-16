import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule, RedisService } from '../redis/redis.module';

/**
 * BullMQ root configuration. Background jobs (email, embeddings, reports) are
 * registered per-feature with `BullModule.registerQueue(...)` and consumed by the
 * worker process (see worker.ts). Uses the shared Redis connection.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        connection: redis.client,
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
