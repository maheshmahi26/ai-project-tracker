import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppConfigModule, AppConfigService } from './config/config.module';
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
import { AuditModule } from './modules/audit/audit.module';
import { ActivityModule } from './modules/activity/activity.module';
import { EventsModule } from './modules/events/events.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { LabelsModule } from './modules/labels/labels.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MailModule } from './modules/mail/mail.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot(buildLoggerOptions()),
    EventEmitterModule.forRoot({ wildcard: true }),
    RedisModule,
    DatabaseModule,
    QueueModule,
    // Global rate limiting backed by Redis (100 req / 60s by default, tunable via
    // RATE_LIMIT_TTL_MS / RATE_LIMIT_MAX). Stricter per-route limits layer on top.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule, AppConfigModule],
      inject: [RedisService, AppConfigService],
      useFactory: (redis: RedisService, config: AppConfigService) => ({
        throttlers: [{ ttl: config.get('RATE_LIMIT_TTL_MS'), limit: config.get('RATE_LIMIT_MAX') }],
        storage: new ThrottlerStorageRedisService(redis.client),
      }),
    }),
    HealthModule,
    AuditModule,
    ActivityModule,
    EventsModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    SprintsModule,
    TasksModule,
    MailModule,
    NotificationsModule,
    CommentsModule,
    LabelsModule,
    FilesModule,
    TimelineModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: Logging is outermost, Transform is innermost (formats the
    // handler result), Timeout guards handler execution.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Rate limiting first, then authentication (JWT) for all routes except @Public.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
