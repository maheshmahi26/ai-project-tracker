import type { ApiError, ApiMeta, ApiSuccess } from '@ai-projectos/shared';

/** Base path — Vite proxies `/api` to the NestJS backend in dev. */
const API_BASE = '/api/v1';

/** Normalized error thrown by the client for any non-2xx response. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: Array<{ path?: string; issue: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** True for the auth failures the UI should react to (redirect to login). */
  get isAuthError(): boolean {
    return this.status === 401 || this.code === 'UNAUTHENTICATED';
  }
}

type TokenProvider = () => string | null;
type OrgIdProvider = () => string | null;
type RefreshHandler = () => Promise<boolean>;

let getToken: TokenProvider = () => null;
let getOrgId: OrgIdProvider = () => null;
let refreshHandler: RefreshHandler | null = null;

export function configureApiAuth(opts: {
  getToken?: TokenProvider;
  getOrgId?: OrgIdProvider;
  onRefresh?: RefreshHandler;
}): void {
  if (opts.getToken) getToken = opts.getToken;
  if (opts.getOrgId) getOrgId = opts.getOrgId;
  if (opts.onRefresh !== undefined) refreshHandler = opts.onRefresh;
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface InternalOptions extends RequestOptions {
  method: string;
  body?: unknown;
  retry?: boolean;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toClientError(status: number, body: unknown): ApiClientError {
  const envelope = body as Partial<ApiError> | undefined;
  if (envelope && typeof envelope === 'object' && 'error' in envelope && envelope.error) {
    const e = envelope.error;
    return new ApiClientError(status, e.code, e.message, e.requestId, e.details);
  }
  return new ApiClientError(status, 'INTERNAL', `Request failed (HTTP ${status})`);
}

async function request<T>(path: string, options: InternalOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrgId();
  if (orgId && !('x-org-id' in headers)) headers['x-org-id'] = orgId;

  let serializedBody: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(options.body);
  }

  const res = await fetch(buildUrl(path, options.params), {
    method: options.method,
    headers,
    body: serializedBody,
    signal: options.signal,
    credentials: 'include',
  });

  // Transparent refresh-on-401 + single retry (refresh handler stubbed until TASK-06).
  if (res.status === 401 && refreshHandler && !options.retry) {
    const refreshed = await refreshHandler();
    if (refreshed) return request<T>(path, { ...options, retry: true });
  }

  const body = await parseBody(res);
  if (!res.ok) throw toClientError(res.status, body);

  return (body as ApiSuccess<T> | undefined)?.data as T;
}

/** Like {@link request} but also returns the response meta (e.g. pagination). */
async function requestWithMeta<T>(
  path: string,
  options: InternalOptions,
): Promise<{ data: T; meta: ApiMeta }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrgId();
  if (orgId && !('x-org-id' in headers)) headers['x-org-id'] = orgId;

  const res = await fetch(buildUrl(path, options.params), {
    method: options.method,
    headers,
    signal: options.signal,
    credentials: 'include',
  });

  const body = await parseBody(res);
  if (!res.ok) throw toClientError(res.status, body);

  const envelope = body as ApiSuccess<T>;
  return { data: envelope.data, meta: envelope.meta };
}

/**
 * Opens a POST request whose response is a `text/event-stream` (SSE) and yields
 * decoded `{ event, data }` frames as they arrive. Auth + org headers are injected
 * exactly like {@link request}. On a 401 the caller should re-auth and retry — we do
 * a single transparent refresh before surfacing the failure.
 *
 * `EventSource` is intentionally not used: it cannot send an `Authorization` header,
 * and our access token lives in memory (never a cookie the browser would attach).
 */
async function* postSse(
  path: string,
  body: unknown,
  opts?: RequestOptions & { retry?: boolean },
): AsyncGenerator<{ event: string; data: string }> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    ...opts?.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrgId();
  if (orgId && !('x-org-id' in headers)) headers['x-org-id'] = orgId;

  const res = await fetch(buildUrl(path, opts?.params), {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
    signal: opts?.signal,
    credentials: 'include',
  });

  if (res.status === 401 && refreshHandler && !opts?.retry) {
    const refreshed = await refreshHandler();
    if (refreshed) {
      yield* postSse(path, body, { ...opts, retry: true });
      return;
    }
  }

  if (!res.ok || !res.body) {
    throw toClientError(res.status, await parseBody(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
        if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Raw GET returning a Blob (e.g. CSV export). Skips envelope unwrapping. */
async function getBlob(path: string, opts?: RequestOptions): Promise<Blob> {
  const headers: Record<string, string> = { ...opts?.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrgId();
  if (orgId && !('x-org-id' in headers)) headers['x-org-id'] = orgId;

  const res = await fetch(buildUrl(path, opts?.params), {
    method: 'GET',
    headers,
    signal: opts?.signal,
    credentials: 'include',
  });

  if (!res.ok) throw toClientError(res.status, await parseBody(res));
  return res.blob();
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { ...opts, method: 'GET' }),
  getBlob,
  postSse,
  getWithMeta: <T>(path: string, opts?: RequestOptions): Promise<{ data: T; meta: ApiMeta }> =>
    requestWithMeta<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: RequestOptions): Promise<T> =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
