import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';
import { AppException } from '../errors/app-exception';

/**
 * Validates/parses a value against a Zod schema and returns the typed result.
 * On failure, throws a VALIDATION_ERROR AppException with per-field details.
 *
 * Usage (per-argument):
 *   @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskDto
 *
 * Shared Zod schemas live in `packages/shared`. See specs/04-api-design.md.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw AppException.validation('Validation failed', this.toDetails(result.error));
  }

  private toDetails(error: ZodError): Array<{ path?: string; issue: string }> {
    return error.issues.map((issue) => ({
      path: issue.path.join('.') || undefined,
      issue: issue.message,
    }));
  }
}
