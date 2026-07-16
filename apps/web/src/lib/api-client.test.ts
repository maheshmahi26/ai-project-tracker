import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiClientError } from './api-client';

function mockResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiClient', () => {
  it('unwraps the success envelope and returns data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(200, { data: { id: '1', name: 'Alpha' }, meta: { requestId: 'r1' } }),
      ),
    );

    const result = await apiClient.get<{ id: string; name: string }>('/projects/1');
    expect(result).toEqual({ id: '1', name: 'Alpha' });
  });

  it('maps an error envelope to ApiClientError with code, message and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(422, {
          error: {
            code: 'BUSINESS_RULE',
            message: 'Cannot do that',
            requestId: 'r2',
            details: [{ path: 'status', issue: 'invalid' }],
          },
        }),
      ),
    );

    await expect(apiClient.post('/tasks', {})).rejects.toMatchObject({
      status: 422,
      code: 'BUSINESS_RULE',
      message: 'Cannot do that',
      requestId: 'r2',
      details: [{ path: 'status', issue: 'invalid' }],
    });
  });

  it('falls back to a generic ApiClientError for non-envelope error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500, 'boom')));

    const error = await apiClient.get('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('INTERNAL');
    expect((error as ApiClientError).status).toBe(500);
  });

  it('flags auth errors via isAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'no', requestId: 'r3' } }),
      ),
    );

    const error = (await apiClient.get('/me').catch((e: unknown) => e)) as ApiClientError;
    expect(error.isAuthError).toBe(true);
  });

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(204)));
    const result = await apiClient.delete('/tasks/1');
    expect(result).toBeUndefined();
  });
});
