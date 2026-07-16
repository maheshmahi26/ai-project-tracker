import type { Params } from 'nestjs-pino';
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
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
      customProps: (req) => ({ requestId: (req as { id?: string }).id }),
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:standard' },
          },
    },
  };
}
