import { describe, it, expect } from 'vitest';
import type { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';

const schema = z.object({ name: z.string().min(1), count: z.coerce.number().int() });
const meta: ArgumentMetadata = { type: 'body' };

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed/coerced data on valid input', () => {
    const result = pipe.transform({ name: 'sprint', count: '3' }, meta);
    expect(result).toEqual({ name: 'sprint', count: 3 });
  });

  it('throws a VALIDATION_ERROR AppException with details on invalid input', () => {
    try {
      pipe.transform({ name: '', count: 'nope' }, meta);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      const appErr = err as AppException;
      expect(appErr.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(appErr.details && appErr.details.length).toBeGreaterThan(0);
    }
  });
});
