import { describe, expect, it } from 'vitest';
import { NodeTimeoutError, withTimeout } from './timeout';

describe('withTimeout', () => {
  it('resolves a fast operation', async () => {
    const result = await withTimeout(async () => 'ok', 1000);
    expect(result).toBe('ok');
  });

  it('rejects with NodeTimeoutError when the budget is exceeded', async () => {
    await expect(
      withTimeout(() => new Promise((resolve) => setTimeout(resolve, 50)), 5),
    ).rejects.toBeInstanceOf(NodeTimeoutError);
  });

  it('aborts the operation signal on timeout', async () => {
    let aborted = false;
    await withTimeout(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve(undefined);
          });
        }),
      5,
    ).catch(() => undefined);
    expect(aborted).toBe(true);
  });

  it('propagates a parent abort', async () => {
    const parent = new AbortController();
    parent.abort();
    await expect(
      withTimeout(() => new Promise((resolve) => setTimeout(resolve, 100)), 1000, parent.signal),
    ).rejects.toThrow(/aborted/i);
  });
});
