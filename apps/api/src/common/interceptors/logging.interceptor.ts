import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getRequestId } from '../request/request-context';

/**
 * Logs one line per request with method, path, status, and duration, tagged with
 * the correlation id. Pino (nestjs-pino) handles structured request logging; this
 * adds a concise timing summary and is easy to unit-test.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = getRequestId(req);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.log(`[${requestId}] ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
        },
        error: () => {
          const ms = Date.now() - start;
          this.logger.warn(`[${requestId}] ${req.method} ${req.url} errored after ${ms}ms`);
        },
      }),
    );
  }
}
