import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@ai-projectos/shared';
import { AppException, type ErrorDetail } from '../errors/app-exception';
import { codeFromStatus, ErrorCode } from '../errors/error-codes';
import { getRequestId } from '../request/request-context';
import { captureException } from '../../observability/sentry';

/**
 * Single place that turns any thrown error into the standard error envelope:
 *   { error: { code, message, details?, requestId } }
 * See specs/04-api-design.md.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();
    const requestId = getRequestId(req);

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId}] ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      captureException(exception, { requestId, code });
    } else {
      this.logger.warn(`[${requestId}] ${code}: ${message}`);
    }

    const body: ApiError = {
      error: { code, message, ...(details ? { details } : {}), requestId },
    };
    res.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: exception.issues.map((i) => ({
          path: i.path.join('.') || undefined,
          issue: i.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        code: codeFromStatus(status),
        message: Array.isArray(message) ? message.join(', ') : message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
    };
  }
}
