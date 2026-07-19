import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, can } from '@ai-projectos/shared';

describe('RBAC permission matrix', () => {
  it('grants admins every permission', () => {
    expect(can('admin', 'manage:org')).toBe(true);
    expect(can('admin', 'manage:users')).toBe(true);
    expect(can('admin', 'project:create')).toBe(true);
    expect(can('admin', 'task:delete')).toBe(true);
  });

  it('lets managers manage work but not users/org', () => {
    expect(can('manager', 'project:create')).toBe(true);
    expect(can('manager', 'sprint:manage')).toBe(true);
    expect(can('manager', 'export')).toBe(true);
    expect(can('manager', 'manage:users')).toBe(false);
    expect(can('manager', 'manage:org')).toBe(false);
  });

  it('lets developers work on tasks but not projects', () => {
    expect(can('developer', 'task:create')).toBe(true);
    expect(can('developer', 'task:update')).toBe(true);
    expect(can('developer', 'task:assign')).toBe(true);
    expect(can('developer', 'project:create')).toBe(false);
    expect(can('developer', 'manage:users')).toBe(false);
  });

  it('gives testers the same task reach as developers but no project/user admin', () => {
    expect(can('tester', 'task:create')).toBe(true);
    expect(can('tester', 'task:update')).toBe(true);
    expect(can('tester', 'task:assign')).toBe(true);
    expect(can('tester', 'project:create')).toBe(false);
    expect(can('tester', 'manage:users')).toBe(false);
    expect(ROLE_PERMISSIONS.tester).toEqual(ROLE_PERMISSIONS.developer);
  });

  it('grants every role read access', () => {
    for (const role of ['admin', 'manager', 'developer', 'tester'] as const) {
      expect(can(role, 'read')).toBe(true);
    }
  });
});
