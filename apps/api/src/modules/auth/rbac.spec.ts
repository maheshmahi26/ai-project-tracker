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

  it('restricts viewers to read-only', () => {
    expect(can('viewer', 'read')).toBe(true);
    expect(can('viewer', 'task:create')).toBe(false);
    expect(can('viewer', 'project:create')).toBe(false);
    expect(can('viewer', 'manage:org')).toBe(false);
    expect(ROLE_PERMISSIONS.viewer).toEqual(['read']);
  });

  it('grants every role read access', () => {
    for (const role of ['admin', 'manager', 'developer', 'viewer'] as const) {
      expect(can(role, 'read')).toBe(true);
    }
  });
});
