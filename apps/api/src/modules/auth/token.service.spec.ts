import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { TokenService, parseDurationToSeconds } from './token.service';

const values: Partial<Env> = {
  JWT_ACCESS_SECRET: 'access-secret-access-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret',
  JWT_REFRESH_TTL: '7d',
};

const fakeConfig = {
  get: (key: keyof Env) => values[key],
} as unknown as AppConfigService;

function makeService(): TokenService {
  return new TokenService(new JwtService({}), fakeConfig);
}

describe('parseDurationToSeconds', () => {
  it('parses common duration strings', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('7d')).toBe(604_800);
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('45')).toBe(45);
  });
});

describe('TokenService', () => {
  it('issues an access token that verifies with the right claims', async () => {
    const tokens = await makeService().issueTokens('user-1', 'a@b.com');
    const payload = await makeService().verifyAccess(tokens.accessToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(tokens.expiresIn).toBe(900);
  });

  it('issues a refresh token with a unique jti each time', async () => {
    const svc = makeService();
    const a = await svc.issueTokens('user-1', 'a@b.com');
    const b = await svc.issueTokens('user-1', 'a@b.com');
    expect(a.refreshToken).not.toBe(b.refreshToken);
    const pa = await svc.verifyRefresh(a.refreshToken);
    const pb = await svc.verifyRefresh(b.refreshToken);
    expect(pa.jti).not.toBe(pb.jti);
    expect(pa.sub).toBe('user-1');
  });

  it('rejects an access token verified with the refresh secret', async () => {
    const svc = makeService();
    const { accessToken } = await svc.issueTokens('user-1', 'a@b.com');
    await expect(svc.verifyRefresh(accessToken)).rejects.toThrow();
  });
});
