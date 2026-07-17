import type { Params } from 'nestjs-pino';
import type { TransportSingleOptions } from 'pino';
import { genRequestId } from '../common/request/request-context';

/**
 * Pino logger configuration (nestjs-pino). Structured JSON logs in production,
 * pretty-printed locally. Correlation id via {@link genRequestId}; sensitive
 * headers redacted. Ships to Better Stack in prod (configured in TASK-15).
 */
export function buildLoggerOptions(): Params {
  const isProd = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL ?? 'info';

  return {
    pinoHttp: {
      level,
      genReqId: genRequestId,
      autoLogging: true,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },
      customProps: (req) => ({ requestId: (req as { id?: string }).id }),
      transport: buildTransport(isProd),
    },
  };
}

/**
 * Log transport selection:
 *  - Better Stack (Logtail) when BETTER_STACK_SOURCE_TOKEN is set — structured
 *    JSON logs shipped for search/alerting (prod).
 *  - pino-pretty locally for human-readable output.
 *  - default stdout JSON otherwise (e.g. prod without Better Stack; the platform
 *    collects stdout).
 */
function buildTransport(isProd: boolean): TransportSingleOptions | undefined {
  const betterStackToken = process.env.BETTER_STACK_SOURCE_TOKEN;
  if (betterStackToken) {
    return {
      target: '@logtail/pino',
      options: {
        sourceToken: betterStackToken,
        ...(process.env.BETTER_STACK_INGEST_URL
          ? { options: { endpoint: process.env.BETTER_STACK_INGEST_URL } }
          : {}),
      },
    };
  }
  if (!isProd) {
    return {
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:standard' },
    };
  }
  return undefined;
}
