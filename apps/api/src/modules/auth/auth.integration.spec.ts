import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

describe('Auth flows (integration)', () => {
  let ctx: TestContext | null;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.connection.dropDatabase();
      await ctx.module.close();
    }
  });

  beforeEach(async () => {
    if (ctx) {
      await ctx.connection.dropDatabase();
      ctx.mail.sent.length = 0;
    }
  });

  it('registers a user and returns tokens without leaking secrets', async (t) => {
    if (!ctx) return t.skip();
    const result = await ctx.auth.register(
      { email: 'Alice@Example.com', password: 'password123', name: 'Alice' },
      meta,
    );
    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.provider).toBe('local');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(result.tokens.tokenType).toBe('Bearer');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHash');
  });

  it('rejects duplicate registration', async (t) => {
    if (!ctx) return t.skip();
    await ctx.auth.register({ email: 'dup@example.com', password: 'password123', name: 'Dup' }, meta);
    await expect(
      ctx.auth.register({ email: 'dup@example.com', password: 'password123', name: 'Dup' }, meta),
    ).rejects.toThrow();
  });

  it('logs in with correct credentials and rejects wrong ones', async (t) => {
    if (!ctx) return t.skip();
    await ctx.auth.register({ email: 'bob@example.com', password: 'password123', name: 'Bob' }, meta);

    const principal = await ctx.auth.validateLocalUser('bob@example.com', 'password123');
    const result = await ctx.auth.login(principal, meta);
    expect(result.tokens.accessToken).toBeTruthy();

    await expect(ctx.auth.validateLocalUser('bob@example.com', 'wrong')).rejects.toThrow();
    await expect(ctx.auth.validateLocalUser('nobody@example.com', 'password123')).rejects.toThrow();
  });

  it('rotates the refresh token and detects reuse', async (t) => {
    if (!ctx) return t.skip();
    const reg = await ctx.auth.register(
      { email: 'carol@example.com', password: 'password123', name: 'Carol' },
      meta,
    );

    const rotated = await ctx.auth.refresh(reg.tokens.refreshToken, meta);
    expect(rotated.tokens.refreshToken).not.toBe(reg.tokens.refreshToken);

    // Replaying the original (now-rotated) token is reuse → session killed.
    await expect(ctx.auth.refresh(reg.tokens.refreshToken, meta)).rejects.toThrow();

    // The reuse response invalidates the current session too.
    await expect(ctx.auth.refresh(rotated.tokens.refreshToken, meta)).rejects.toThrow();
  });

  it('logout invalidates the refresh token', async (t) => {
    if (!ctx) return t.skip();
    const reg = await ctx.auth.register(
      { email: 'dave@example.com', password: 'password123', name: 'Dave' },
      meta,
    );
    await ctx.auth.logout(reg.user.id, meta);
    await expect(ctx.auth.refresh(reg.tokens.refreshToken, meta)).rejects.toThrow();
  });

  it('issues a single-use, working password reset token', async (t) => {
    if (!ctx) return t.skip();
    await ctx.auth.register(
      { email: 'erin@example.com', password: 'oldpassword', name: 'Erin' },
      meta,
    );

    await ctx.auth.forgotPassword('erin@example.com', meta);
    expect(ctx.mail.sent).toHaveLength(1);
    const token = ctx.mail.sent[0]!.token;

    await ctx.auth.resetPassword(token, 'newpassword', meta);

    await expect(ctx.auth.validateLocalUser('erin@example.com', 'oldpassword')).rejects.toThrow();
    const principal = await ctx.auth.validateLocalUser('erin@example.com', 'newpassword');
    expect(principal.email).toBe('erin@example.com');

    // Token is single-use.
    await expect(ctx.auth.resetPassword(token, 'another', meta)).rejects.toThrow();
  });

  it('does not reveal whether an email exists on forgot-password', async (t) => {
    if (!ctx) return t.skip();
    await expect(ctx.auth.forgotPassword('ghost@example.com', meta)).resolves.toBeUndefined();
    expect(ctx.mail.sent).toHaveLength(0);
  });

  it('provisions a user from a Google profile and reuses it on repeat login', async (t) => {
    if (!ctx) return t.skip();
    const profile = { googleId: 'g-123', email: 'gina@example.com', name: 'Gina' };
    const first = await ctx.auth.loginWithGoogleProfile(profile, meta);
    expect(first.user.provider).toBe('google');

    const second = await ctx.auth.loginWithGoogleProfile(profile, meta);
    expect(second.user.id).toBe(first.user.id);
  });
});
