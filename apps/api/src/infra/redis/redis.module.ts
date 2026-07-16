import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigModule, AppConfigService } from '../../config/config.module';

/**
 * Shared Redis connection (ioredis). Used for caching, rate limiting, and as the
 * BullMQ backing store. `maxRetriesPerRequest: null` is required by BullMQ, which
 * duplicates this connection for its workers.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.get('REDIS_URL'), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  async ping(): Promise<boolean> {
    const pong = await this.client.ping();
    return pong === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
