import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const config = app.get(AppConfigService);
  const prefix = config.get('API_PREFIX');

  // Versioned prefix, e.g. /api/v1. Full versioning + Swagger land in TASK-03.
  app.setGlobalPrefix(`${prefix}/v1`);
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();

  const port = config.get('PORT');
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}/${prefix}/v1`, 'Bootstrap');
}

void bootstrap();
