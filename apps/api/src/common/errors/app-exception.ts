import { HttpException } from '@nestjs/common';
import { ERROR_STATUS, ErrorCode } from './error-codes';

export interface ErrorDetail {
  path?: string;
  issue: string;
}

/**
 * Application-level exception carrying a stable {@link ErrorCode} and optional
 * structured details. Thrown by services/use cases; rendered into the standard
 * error envelope by {@link AllExceptionsFilter}.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message, ERROR_STATUS[code]);
    this.code = code;
    this.details = details;
  }

  static notFound(message = 'Resource not found', details?: ErrorDetail[]): AppException {
    return new AppException(ErrorCode.NOT_FOUND, message, details);
  }

  static validation(message = 'Validation failed', details?: ErrorDetail[]): AppException {
    return new AppException(ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message = 'Authentication required'): AppException {
    return new AppException(ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have permission to do that'): AppException {
    return new AppException(ErrorCode.PERMISSION_DENIED, message);
  }

  static conflict(message = 'Conflict', details?: ErrorDetail[]): AppException {
    return new AppException(ErrorCode.CONFLICT, message, details);
  }

  static businessRule(message: string, details?: ErrorDetail[]): AppException {
    return new AppException(ErrorCode.BUSINESS_RULE, message, details);
  }

  static unavailable(message = 'Service unavailable', details?: ErrorDetail[]): AppException {
    return new AppException(ErrorCode.SERVICE_UNAVAILABLE, message, details);
  }
}
