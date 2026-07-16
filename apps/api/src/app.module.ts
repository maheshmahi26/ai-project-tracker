import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule, RedisService } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { buildLoggerOptions } from './observability/logger';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot(buildLoggerOptions()),
    RedisModule,
    DatabaseModule,
    QueueModule,
    // Global rate limiting backed by Redis (100 req / 60s by default).
    // Stricter per-route limits (auth, ai) are layered on in later tasks.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis.client),
      }),
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: Logging is outermost, Transform is innermost (formats the
    // handler result), Timeout guards handler execution.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
