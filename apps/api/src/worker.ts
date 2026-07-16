import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';
import { initSentry } from './observability/sentry';

/**
 * Background worker entrypoint. Runs as a separate process (own Railway service in
 * prod) so heavy jobs never block API request latency. No HTTP server.
 */
async function bootstrap(): Promise<void> {
  initSentry();

  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.get(Logger).log('Background worker started', 'Worker');
}

void bootstrap();
