import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccess } from '@ai-projectos/shared';
import { getRequestId } from '../request/request-context';
import { PaginatedResult } from '../pagination/pagination';
import { PASSTHROUGH_KEY } from '../decorators/passthrough.decorator';

/**
 * Wraps controller return values in the standard success envelope:
 *   { data, meta: { requestId, page? } }
 * Handlers decorated with `@Passthrough()` are left untouched (e.g. SSE streams).
 * See specs/04-api-design.md.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const passthrough = this.reflector.getAllAndOverride<boolean>(PASSTHROUGH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requestId = getRequestId(context.switchToHttp().getRequest());

    return next.handle().pipe(
      map((payload): unknown => {
        if (passthrough) return payload;

        if (PaginatedResult.isPaginated(payload)) {
          const result = payload as PaginatedResult<unknown>;
          return {
            data: result.items,
            meta: { requestId, page: result.page },
          } satisfies ApiSuccess<unknown[]>;
        }

        return { data: payload, meta: { requestId } } satisfies ApiSuccess<unknown>;
      }),
    );
  }
}
