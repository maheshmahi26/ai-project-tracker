import { useMemo } from 'react';
import type { MembershipDTO, PublicUser } from '@ai-projectos/shared';
import { useOrgStore } from '@/stores/org-store';
import { useOrgMembers } from '@/features/organizations/hooks/use-orgs';

export interface MemberOption {
  userId: string;
  name: string;
  email: string;
}

/** Active-org members plus a `userId → member` lookup for assignee/mention UIs. */
export function useMembers(): {
  members: MemberOption[];
  byId: (userId: string | null | undefined) => MemberOption | undefined;
  isLoading: boolean;
} {
  const orgId = useOrgStore((s) => s.activeOrgId);
  const { data, isLoading } = useOrgMembers(orgId ?? undefined);

  const members = useMemo<MemberOption[]>(() => {
    return (data ?? [])
      .filter((m: MembershipDTO) => m.status === 'active')
      .map((m: MembershipDTO) => {
        const user: PublicUser | undefined = m.user;
        return {
          userId: m.userId,
          name: user?.name ?? user?.email ?? 'Unknown user',
          email: user?.email ?? '',
        };
      });
  }, [data]);

  const map = useMemo(() => {
    const acc = new Map<string, MemberOption>();
    for (const m of members) acc.set(m.userId, m);
    return acc;
  }, [members]);

  return {
    members,
    byId: (userId) => (userId ? map.get(userId) : undefined),
    isLoading,
  };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
