import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.module';
import { AppConfigService } from '../../config/config.module';

/**
 * Read-model cache for dashboards.
 *
 * Invalidation uses a per-org **version counter** rather than key scanning:
 * every cache key embeds the org's current version, and a write simply `INCR`s
 * that counter so all previous keys become unreachable (and expire via TTL).
 * This gives O(1) invalidation with no `KEYS`/`SCAN` on the hot path.
 *
 * Redis is treated as best-effort: any Redis error falls back to computing the
 * value directly, so a cache outage degrades performance but never correctness.
 */
@Injectable()
export class DashboardCache {
  private readonly logger = new Logger(DashboardCache.name);
  private readonly ttlSec: number;

  constructor(
    private readonly redis: RedisService,
    config: AppConfigService,
  ) {
    this.ttlSec = config.get('DASHBOARD_CACHE_TTL_SEC');
  }

  private versionKey(orgId: string): string {
    return `dash:ver:${orgId}`;
  }

  private async currentVersion(orgId: string): Promise<string> {
    const v = await this.redis.client.get(this.versionKey(orgId));
    return v ?? '0';
  }

  private cacheKey(orgId: string, version: string, name: string, params: unknown): string {
    return `dash:${orgId}:v${version}:${name}:${stableStringify(params)}`;
  }

  /** Returns the cached value for (org, name, params) or computes + stores it. */
  async wrap<T>(orgId: string, name: string, params: unknown, compute: () => Promise<T>): Promise<T> {
    let key: string | null = null;
    try {
      const version = await this.currentVersion(orgId);
      key = this.cacheKey(orgId, version, name, params);
      const hit = await this.redis.client.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`cache read failed (${name}): ${(err as Error).message}`);
    }

    const value = await compute();

    if (key) {
      try {
        await this.redis.client.set(key, JSON.stringify(value), 'EX', this.ttlSec);
      } catch (err) {
        this.logger.warn(`cache write failed (${name}): ${(err as Error).message}`);
      }
    }
    return value;
  }

  /** Bumps the org's version so every existing dashboard cache entry is bypassed. */
  async invalidateOrg(orgId: string): Promise<void> {
    try {
      await this.redis.client.incr(this.versionKey(orgId));
      // Keep the counter from living forever if the org goes idle.
      await this.redis.client.expire(this.versionKey(orgId), 60 * 60 * 24 * 7);
    } catch (err) {
      this.logger.warn(`cache invalidate failed: ${(err as Error).message}`);
    }
  }
}

/** Deterministic JSON (sorted keys) so equivalent params share a cache key. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
