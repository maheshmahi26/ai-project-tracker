import { Controller, Get } from '@nestjs/common';
import { APP_NAME, type HealthStatus } from '@ai-projectos/shared';
import { AppConfigService } from './config/config.module';

@Controller()
export class AppController {
  constructor(private readonly config: AppConfigService) {}

  @Get('ping')
  ping(): { name: string; env: string; message: string } {
    return {
      name: APP_NAME,
      env: this.config.get('NODE_ENV'),
      message: 'pong',
    };
  }

  @Get('health')
  health(): HealthStatus {
    // Liveness only. Readiness (mongo/redis/qdrant checks) is added in TASK-03.
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
