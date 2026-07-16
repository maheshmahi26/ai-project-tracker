import { Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/config.module';

type ExpiresIn = JwtSignOptions['expiresIn'];

export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds (for the client to schedule refresh). */
  expiresIn: number;
}

/**
 * Signs/verifies access + refresh JWTs with separate secrets. Access tokens are
 * short-lived; refresh tokens rotate on every use. The raw refresh token's hash
 * is stored on the user (see AuthService) so reuse of a rotated token is detected.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issueTokens(userId: string, email: string): Promise<IssuedTokens> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL');
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email } satisfies AccessTokenPayload,
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: accessTtl as ExpiresIn },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti: randomUUID() } satisfies RefreshTokenPayload,
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL') as ExpiresIn,
      },
    );
    return { accessToken, refreshToken, expiresIn: parseDurationToSeconds(accessTtl) };
  }

  verifyAccess(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
    });
  }

  verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    return this.jwt.verifyAsync<RefreshTokenPayload>(token, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });
  }
}

/** Parses "15m" / "7d" / "3600" style durations to seconds. */
export function parseDurationToSeconds(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'ms':
      return Math.floor(value / 1000);
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86_400;
    case 'm':
      return value * 60;
    case 's':
    case undefined:
    default:
      return value;
  }
}
