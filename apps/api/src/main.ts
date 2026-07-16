import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.module';
import { initSentry } from './observability/sentry';
import { initOtel } from './observability/otel';

async function bootstrap(): Promise<void> {
  // Observability must be initialized before the app is created.
  initSentry();
  initOtel();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Route Nest's logs through Pino (structured + correlation id).
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);

  // Security headers. CSP disabled so Swagger UI renders; tighten in TASK-15.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  // Versioned API prefix; health probes stay at the root for load balancers.
  app.setGlobalPrefix(`${config.get('API_PREFIX')}/v1`, {
    exclude: ['health', 'health/ready'],
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI ProjectOS API')
    .setDescription('AI-native project management SaaS — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('PORT');
  await app.listen(port);

  app
    .get(Logger)
    .log(
      `API on http://localhost:${port}/${config.get('API_PREFIX')}/v1 · docs at /api/docs`,
      'Bootstrap',
    );
}

void bootstrap();
