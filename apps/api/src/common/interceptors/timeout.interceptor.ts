import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AppException } from '../errors/app-exception';
import { PASSTHROUGH_KEY } from '../decorators/passthrough.decorator';

/** Default request timeout (ms). Streaming routes opt out via @Passthrough(). */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fails requests that exceed {@link DEFAULT_TIMEOUT_MS} with a 503, preventing
 * hung handlers from holding connections. Streaming/passthrough endpoints skip it.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(PASSTHROUGH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      timeout(DEFAULT_TIMEOUT_MS),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(() => AppException.unavailable('Request timed out'));
        }
        return throwError(() => err);
      }),
    );
  }
}
