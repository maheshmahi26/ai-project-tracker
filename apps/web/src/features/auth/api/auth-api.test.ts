import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshSession } from './auth-api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshSession', () => {
  it('dedupes concurrent refreshes into a single network call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          user: { id: 'u1', email: 'a@b.com', name: 'Ada', provider: 'local', status: 'active', createdAt: 'x' },
          tokens: { accessToken: 'new', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.tokens.accessToken).toBe('new');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('returns null when the refresh cookie is missing/invalid (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: {} })));
    const result = await refreshSession();
    expect(result).toBeNull();
  });

  it('returns null on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await refreshSession();
    expect(result).toBeNull();
  });
});
