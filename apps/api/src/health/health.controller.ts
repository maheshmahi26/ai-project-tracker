import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthStatus } from '@ai-projectos/shared';
import { HealthService, type ReadinessReport } from './health.service';
import { AppException } from '../common/errors/app-exception';
import { Passthrough } from '../common/decorators/passthrough.decorator';

/**
 * Health probes. Mounted OUTSIDE the /api/v1 prefix (see main.ts exclude) so
 * platform load balancers/uptime checks can hit /health and /health/ready.
 * Responses are passthrough (not wrapped in the success envelope) to match what
 * infra tooling expects.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Passthrough()
  liveness(): HealthStatus {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @Passthrough()
  async readiness(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== 'ok') {
      throw AppException.unavailable(
        'One or more dependencies are unavailable',
        Object.entries(report.checks)
          .filter(([, state]) => state !== 'up')
          .map(([dep]) => ({ path: dep, issue: 'down' })),
      );
    }
    return report;
  }
}
