import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../../config/config.module';
import type { RedisService } from '../../infra/redis/redis.module';
import { DashboardCache } from './dashboard.cache';

/** Minimal in-memory stand-in for the ioredis methods DashboardCache uses. */
function fakeRedisService(): RedisService {
  const store = new Map<string, string>();
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
    incr: async (k: string) => {
      const next = Number(store.get(k) ?? '0') + 1;
      store.set(k, String(next));
      return next;
    },
    expire: async () => 1,
  };
  return { client } as unknown as RedisService;
}

const config = { get: () => 30 } as unknown as AppConfigService;

describe('DashboardCache', () => {
  it('computes once, then serves from cache for the same key', async () => {
    const cache = new DashboardCache(fakeRedisService(), config);
    let calls = 0;
    const compute = async (): Promise<{ n: number }> => ({ n: ++calls });

    const first = await cache.wrap('org1', 'overview', {}, compute);
    const second = await cache.wrap('org1', 'overview', {}, compute);

    expect(first).toEqual({ n: 1 });
    expect(second).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('recomputes after invalidateOrg bumps the version', async () => {
    const cache = new DashboardCache(fakeRedisService(), config);
    let calls = 0;
    const compute = async (): Promise<{ n: number }> => ({ n: ++calls });

    await cache.wrap('org1', 'overview', {}, compute);
    await cache.invalidateOrg('org1');
    const after = await cache.wrap('org1', 'overview', {}, compute);

    expect(after).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it('keys cache entries by params and by org', async () => {
    const cache = new DashboardCache(fakeRedisService(), config);
    let calls = 0;
    const compute = async (): Promise<{ n: number }> => ({ n: ++calls });

    await cache.wrap('org1', 'overview', {}, compute);
    await cache.wrap('org1', 'overview', { projectId: 'p1' }, compute);
    await cache.wrap('org2', 'overview', {}, compute);

    expect(calls).toBe(3);
  });

  it('falls back to computing when Redis throws', async () => {
    const broken = {
      client: {
        get: async () => {
          throw new Error('redis down');
        },
        set: async () => {
          throw new Error('redis down');
        },
        incr: async () => {
          throw new Error('redis down');
        },
        expire: async () => 1,
      },
    } as unknown as RedisService;
    const cache = new DashboardCache(broken, config);

    const result = await cache.wrap('org1', 'overview', {}, async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });
});
