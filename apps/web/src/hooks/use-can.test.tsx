import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { OrganizationDTO, Role } from '@ai-projectos/shared';
import { useCan } from './use-can';

const mockActiveOrg = vi.fn<() => { activeOrg: OrganizationDTO | null }>();

vi.mock('@/features/organizations/hooks/use-orgs', () => ({
  useActiveOrg: () => mockActiveOrg(),
}));

function orgWithRole(role: Role): OrganizationDTO {
  return {
    id: 'o1',
    name: 'Acme',
    slug: 'acme',
    ownerId: 'u1',
    plan: 'free',
    settings: { timezone: 'UTC', features: {} },
    role,
    createdAt: 'x',
  };
}

describe('useCan', () => {
  it('grants an admin manage:users', () => {
    mockActiveOrg.mockReturnValue({ activeOrg: orgWithRole('admin') });
    const { result } = renderHook(() => useCan('manage:users'));
    expect(result.current).toBe(true);
  });

  it('denies a viewer write permissions', () => {
    mockActiveOrg.mockReturnValue({ activeOrg: orgWithRole('viewer') });
    const { result } = renderHook(() => useCan('task:create'));
    expect(result.current).toBe(false);
  });

  it('denies when no active org/role is resolved yet', () => {
    mockActiveOrg.mockReturnValue({ activeOrg: null });
    const { result } = renderHook(() => useCan('read'));
    expect(result.current).toBe(false);
  });
});
