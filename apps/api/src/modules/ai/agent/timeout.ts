/** Error thrown when a guarded operation exceeds its per-node time budget. */
export class NodeTimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation exceeded ${ms}ms budget`);
    this.name = 'NodeTimeoutError';
  }
}

/**
 * Runs `fn` with a per-node timeout. `fn` receives an `AbortSignal` that fires on
 * either the timeout or the parent signal, so the underlying request is actually
 * cancelled (not just abandoned). Rejects with {@link NodeTimeoutError} on timeout.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = (): void => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        const fail = (): void =>
          reject(parent?.aborted ? new Error('Run aborted') : new NodeTimeoutError(ms));
        if (controller.signal.aborted) fail();
        else controller.signal.addEventListener('abort', fail, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (parent) parent.removeEventListener('abort', onParentAbort);
  }
}
