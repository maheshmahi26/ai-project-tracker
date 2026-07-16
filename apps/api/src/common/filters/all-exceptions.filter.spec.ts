import { describe, it, expect } from 'vitest';
import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from '../errors/app-exception';

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
}

function mockHost(requestId = 'req-123'): { host: ArgumentsHost; res: MockRes } {
  const res: MockRes = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ id: requestId }),
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('renders an AppException with its code, message, details and requestId', () => {
    const { host, res } = mockHost();
    filter.catch(
      AppException.businessRule('Cannot do that', [{ path: 'status', issue: 'invalid' }]),
      host,
    );

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: {
        code: 'BUSINESS_RULE',
        message: 'Cannot do that',
        details: [{ path: 'status', issue: 'invalid' }],
        requestId: 'req-123',
      },
    });
  });

  it('maps a ZodError to VALIDATION_ERROR with per-field details', () => {
    const { host, res } = mockHost();
    const parsed = z.object({ name: z.string() }).safeParse({ name: 123 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    filter.catch(parsed.error, host);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('maps a built-in HttpException to the matching code', () => {
    const { host, res } = mockHost();
    filter.catch(new NotFoundException('nope'), host);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('maps an unknown error to INTERNAL 500 without leaking details', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('kaboom'), host);

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('Internal server error');
  });
});
