import { describe, it, expect } from 'vitest';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { PaginatedResult } from '../pagination/pagination';

function mockContext(): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-xyz' }),
      getResponse: () => ({}),
    }),
    getHandler: () => function handler() {},
    getClass: () => class Dummy {},
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor(new Reflector());

  it('wraps a plain value in the success envelope with requestId', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(mockContext(), handlerReturning({ hello: 'world' })),
    );
    expect(result).toEqual({ data: { hello: 'world' }, meta: { requestId: 'req-xyz' } });
  });

  it('unwraps a PaginatedResult into data + meta.page', async () => {
    const paginated = new PaginatedResult([{ id: 1 }], { hasMore: true, nextCursor: 'abc' });
    const result = await firstValueFrom(
      interceptor.intercept(mockContext(), handlerReturning(paginated)),
    );
    expect(result).toEqual({
      data: [{ id: 1 }],
      meta: { requestId: 'req-xyz', page: { hasMore: true, nextCursor: 'abc' } },
    });
  });
});
