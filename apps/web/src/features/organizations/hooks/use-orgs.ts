import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMemberInput,
  CreateOrgInput,
  InviteMemberInput,
  OrganizationDTO,
} from '@ai-projectos/shared';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { useOrgStore } from '@/stores/org-store';
import { orgsApi } from '../api/orgs-api';

/** The caller's organizations. Only runs once authenticated. */
export function useOrgs() {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: queryKeys.orgs.list,
    queryFn: orgsApi.listMine,
    enabled: authed,
  });
}

/**
 * Resolve the active organization from the persisted selection, falling back to
 * the first org. Returns the org (with the caller's `role`) plus the raw list.
 */
export function useActiveOrg(): {
  activeOrg: OrganizationDTO | null;
  orgs: OrganizationDTO[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useOrgs();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const orgs = useMemo(() => data ?? [], [data]);
  const activeOrg = useMemo<OrganizationDTO | null>(() => {
    if (orgs.length === 0) return null;
    return orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;
  }, [orgs, activeOrgId]);

  return { activeOrg, orgs, isLoading, isError };
}

export function useCreateOrg() {
  const queryClient = useQueryClient();
  const setActiveOrgId = useOrgStore((s) => s.setActiveOrgId);
  return useMutation({
    mutationFn: (input: CreateOrgInput) => orgsApi.create(input),
    onSuccess: (org) => {
      setActiveOrgId(org.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs.all });
    },
  });
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.orgs.members(orgId) : ['orgs', 'members', 'none'],
    queryFn: () => orgsApi.listMembers(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useInviteMember(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteMemberInput) => orgsApi.invite(orgId as string, input),
    onSuccess: () => {
      if (orgId) void queryClient.invalidateQueries({ queryKey: queryKeys.orgs.members(orgId) });
    },
  });
}

export function useOrgMembersPage(orgId: string | undefined, page: number, pageSize: number) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.orgs.membersPage(orgId, page, pageSize)
      : ['orgs', 'members', 'page', 'none'],
    queryFn: () => orgsApi.listMembersPage(orgId as string, page, pageSize),
    enabled: Boolean(orgId),
    placeholderData: keepPreviousData,
  });
}

/** Invalidate every members query (list + paginated pages) for an org. */
function useInvalidateMembers(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.orgs.members(orgId) });
  };
}

export function useCreateUser(orgId: string | undefined) {
  const invalidate = useInvalidateMembers(orgId);
  return useMutation({
    mutationFn: (input: CreateMemberInput) => orgsApi.createUser(orgId as string, input),
    onSuccess: invalidate,
  });
}

export function useBlockMember(orgId: string | undefined) {
  const invalidate = useInvalidateMembers(orgId);
  return useMutation({
    mutationFn: (userId: string) => orgsApi.blockMember(orgId as string, userId),
    onSuccess: invalidate,
  });
}

export function useUnblockMember(orgId: string | undefined) {
  const invalidate = useInvalidateMembers(orgId);
  return useMutation({
    mutationFn: (userId: string) => orgsApi.unblockMember(orgId as string, userId),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(orgId: string | undefined) {
  const invalidate = useInvalidateMembers(orgId);
  return useMutation({
    mutationFn: (userId: string) => orgsApi.removeMember(orgId as string, userId),
    onSuccess: invalidate,
  });
}
