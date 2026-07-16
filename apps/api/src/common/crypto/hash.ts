import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * SHA-256 hex digest. Used to hash high-entropy tokens (refresh + reset) at rest.
 * Passwords use Argon2id instead (see PasswordService) — never this.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** URL-safe random token with the given number of random bytes (default 32). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
