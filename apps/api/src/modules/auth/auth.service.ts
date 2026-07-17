import { Injectable } from '@nestjs/common';
import type { AuthResult, PublicUser } from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { generateToken, hashToken, safeEqualHex } from '../../common/crypto/hash';
import { AppConfigService } from '../../config/config.module';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersRepository, type UserLean } from '../users/users.repository';
import { toPublicUser } from '../users/user.mapper';
import type { AuthenticatedUser } from './auth.types';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface RequestMeta {
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async register(
    input: { email: string; password: string; name: string },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw AppException.conflict('An account with this email already exists');

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      provider: 'local',
      status: 'active',
    });

    const result = await this.issueAndPersist(user);
    await this.audit.record({
      action: 'auth.register',
      actorId: result.user.id,
      source: 'ui',
      ...meta,
    });
    return result;
  }

  /** Used by LocalStrategy — verifies credentials, returns the principal. */
  async validateLocalUser(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.users.findByEmailWithSecrets(email);
    const ok = user ? await this.passwords.verify(user.passwordHash, password) : false;
    if (!user || !ok) throw AppException.unauthenticated('Invalid email or password');
    if (user.status === 'disabled') throw AppException.forbidden('This account is disabled');
    return { userId: user._id.toString(), email: user.email };
  }

  async login(principal: AuthenticatedUser, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw AppException.unauthenticated('Invalid email or password');
    const result = await this.issueAndPersist(user);
    await this.audit.record({
      action: 'auth.login',
      actorId: user._id.toString(),
      source: 'ui',
      ...meta,
    });
    return result;
  }

  async refresh(presentedToken: string | undefined, meta: RequestMeta): Promise<AuthResult> {
    if (!presentedToken) throw AppException.unauthenticated('Missing refresh token');

    let userId: string;
    try {
      const payload = await this.tokens.verifyRefresh(presentedToken);
      userId = payload.sub;
    } catch {
      throw AppException.unauthenticated('Invalid or expired refresh token');
    }

    const user = await this.users.findByIdWithSecrets(userId);
    if (!user || !user.refreshTokenHash) {
      throw AppException.unauthenticated('Session no longer valid');
    }

    const presentedHash = hashToken(presentedToken);
    if (!safeEqualHex(presentedHash, user.refreshTokenHash)) {
      // A valid-but-rotated token was replayed → likely theft. Kill the session.
      await this.users.updateById(userId, { $set: { refreshTokenHash: null } });
      await this.audit.record({
        action: 'auth.refresh.reuse_detected',
        actorId: userId,
        source: 'ui',
        ...meta,
      });
      throw AppException.unauthenticated('Refresh token reuse detected — please sign in again');
    }

    const result = await this.issueAndPersist(user);
    await this.audit.record({
      action: 'auth.refresh',
      actorId: userId,
      source: 'ui',
      ...meta,
    });
    return result;
  }

  async logout(userId: string, meta: RequestMeta): Promise<void> {
    await this.users.updateById(userId, { $set: { refreshTokenHash: null } });
    await this.audit.record({ action: 'auth.logout', actorId: userId, source: 'ui', ...meta });
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.users.findByEmail(email);
    // Always return success to avoid account enumeration.
    if (!user) return;

    const rawToken = `${user._id.toString()}.${generateToken()}`;
    const expiresAt = new Date(Date.now() + this.config.get('RESET_TOKEN_TTL_MIN') * 60_000);
    await this.users.updateById(user._id.toString(), {
      $set: { resetTokenHash: hashToken(rawToken), resetTokenExpiresAt: expiresAt },
    });
    await this.mail.sendPasswordReset(user.email, rawToken);
    await this.audit.record({
      action: 'auth.forgot_password',
      actorId: user._id.toString(),
      source: 'ui',
      ...meta,
    });
  }

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const user = await this.users.findByIdWithSecrets(userId);
    if (!user) throw AppException.unauthenticated('Session no longer valid');

    const ok = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!ok) throw AppException.unauthenticated('Current password is incorrect');

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.users.updateById(userId, {
      $set: { passwordHash, mustChangePassword: false },
    });

    // Re-fetch so the issued session reflects the cleared flag.
    const updated = await this.users.findById(userId);
    if (!updated) throw AppException.unauthenticated('Session no longer valid');

    const result = await this.issueAndPersist(updated);
    await this.audit.record({
      action: 'auth.change_password',
      actorId: userId,
      source: 'ui',
      ...meta,
    });
    return result;
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const userId = token.split('.')[0] ?? '';
    const user = await this.users.findByIdWithSecrets(userId);
    const valid =
      user &&
      user.resetTokenHash &&
      user.resetTokenExpiresAt &&
      user.resetTokenExpiresAt.getTime() > Date.now() &&
      safeEqualHex(hashToken(token), user.resetTokenHash);
    if (!user || !valid) {
      throw AppException.validation('Invalid or expired reset token', [
        { path: 'token', issue: 'invalid' },
      ]);
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.updateById(userId, {
      $set: { passwordHash, provider: 'local' },
      // Single-use token + invalidate all existing sessions.
      $unset: { resetTokenHash: '', resetTokenExpiresAt: '', refreshTokenHash: '' },
    });
    await this.audit.record({
      action: 'auth.reset_password',
      actorId: userId,
      source: 'ui',
      ...meta,
    });
  }

  async loginWithGoogleProfile(profile: GoogleProfile, meta: RequestMeta): Promise<AuthResult> {
    let user = await this.users.findByGoogleId(profile.googleId);
    if (!user) {
      const byEmail = await this.users.findByEmail(profile.email);
      if (byEmail) {
        user = await this.users.updateById(byEmail._id.toString(), {
          $set: {
            googleId: profile.googleId,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl ?? null,
          },
        });
      } else {
        user = await this.users.create({
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl ?? null,
          provider: 'google',
          googleId: profile.googleId,
          emailVerifiedAt: new Date(),
          status: 'active',
        });
      }
    }
    if (!user) throw AppException.unauthenticated('Google sign-in failed');

    const result = await this.issueAndPersist(user);
    await this.audit.record({
      action: 'auth.google',
      actorId: user._id.toString(),
      source: 'ui',
      ...meta,
    });
    return result;
  }

  getPublicUser(user: UserLean): PublicUser {
    return toPublicUser(user);
  }

  /** Issues a fresh token pair and stores the new refresh-token hash (rotation). */
  private async issueAndPersist(user: UserLean): Promise<AuthResult> {
    const id = user._id.toString();
    const tokens = await this.tokens.issueTokens(id, user.email);
    await this.users.updateById(id, {
      $set: { refreshTokenHash: hashToken(tokens.refreshToken) },
    });
    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: 'Bearer',
        expiresIn: tokens.expiresIn,
      },
    };
  }
}
