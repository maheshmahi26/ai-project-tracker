import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@ai-projectos/shared';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

function contextWithRole(role: Role | undefined, required: Permission[]): ExecutionContext {
  const handler = (): void => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  const req = { orgContext: role ? { orgId: 'o1', userId: 'u1', role } : undefined };
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext & { reflector: Reflector };
}

const guard = new PermissionsGuard(new Reflector());

describe('PermissionsGuard', () => {
  it('allows an admin to project:create', () => {
    const ctx = contextWithRole('admin', ['project:create']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks a tester from project:create', () => {
    const ctx = contextWithRole('tester', ['project:create']);
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('blocks a developer from project:delete but allows task:create', () => {
    const del = contextWithRole('developer', ['project:delete']);
    expect(() => guard.canActivate(del)).toThrow();
    const task = contextWithRole('developer', ['task:create']);
    expect(guard.canActivate(task)).toBe(true);
  });

  it('throws when org context is missing', () => {
    const ctx = contextWithRole(undefined, ['read']);
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('passes through when no permissions are required', () => {
    const ctx = contextWithRole('tester', []);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
