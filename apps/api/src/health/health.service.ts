import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { RedisService } from '../infra/redis/redis.module';
import { AppConfigService } from '../config/config.module';

export type CheckState = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'down';
  checks: Record<'mongo' | 'redis' | 'qdrant', CheckState>;
}

/** Pings each external dependency for the readiness probe. */
@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const [mongo, redis, qdrant] = await Promise.all([
      this.checkMongo(),
      this.checkRedis(),
      this.checkQdrant(),
    ]);

    const checks = { mongo, redis, qdrant };
    const allUp = Object.values(checks).every((s) => s === 'up');
    return { status: allUp ? 'ok' : 'down', checks };
  }

  private async checkMongo(): Promise<CheckState> {
    try {
      if (this.mongo.readyState !== 1 || !this.mongo.db) return 'down';
      await this.mongo.db.admin().ping();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<CheckState> {
    try {
      return (await this.redis.ping()) ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private async checkQdrant(): Promise<CheckState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${this.config.get('QDRANT_URL')}/readyz`, {
        signal: controller.signal,
      });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
