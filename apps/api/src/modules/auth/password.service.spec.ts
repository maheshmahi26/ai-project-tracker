import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await service.hash('s3cret-password');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, 's3cret-password')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('s3cret-password');
    expect(await service.verify(hash, 'wrong-password')).toBe(false);
  });

  it('returns false for a missing hash', async () => {
    expect(await service.verify(null, 'anything')).toBe(false);
    expect(await service.verify(undefined, 'anything')).toBe(false);
  });
});
