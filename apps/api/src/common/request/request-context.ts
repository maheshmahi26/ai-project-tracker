import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Read the correlation id off a request (set by Pino's genReqId). */
export function getRequestId(req: unknown): string {
  const id = (req as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : 'unknown';
}

/**
 * Correlation id generator used by pino-http. Reuses an inbound `X-Request-Id`
 * when present (so ids propagate across services), otherwise mints a uuid, and
 * echoes it on the response. This single id flows into logs, error envelopes,
 * and (later) audit entries and OTel spans.
 */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const existing = (req as { id?: unknown }).id;
  const id =
    (typeof existing === 'string' && existing) ||
    (typeof incoming === 'string' && incoming.trim()) ||
    randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}
