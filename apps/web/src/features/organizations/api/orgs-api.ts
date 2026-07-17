import type {
  CreateMemberInput,
  CreateOrgInput,
  InviteMemberInput,
  MembershipDTO,
  OrganizationDTO,
  PaginatedMembers,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export const orgsApi = {
  listMine: (): Promise<OrganizationDTO[]> => apiClient.get<OrganizationDTO[]>('/orgs'),

  create: (input: CreateOrgInput): Promise<OrganizationDTO> =>
    apiClient.post<OrganizationDTO>('/orgs', input),

  get: (id: string): Promise<OrganizationDTO> => apiClient.get<OrganizationDTO>(`/orgs/${id}`),

  listMembers: (id: string): Promise<MembershipDTO[]> =>
    apiClient.get<MembershipDTO[]>(`/orgs/${id}/members`),

  listMembersPage: (id: string, page: number, pageSize: number): Promise<PaginatedMembers> =>
    apiClient.get<PaginatedMembers>(`/orgs/${id}/members/page?page=${page}&pageSize=${pageSize}`),

  invite: (id: string, input: InviteMemberInput): Promise<MembershipDTO> =>
    apiClient.post<MembershipDTO>(`/orgs/${id}/members`, input),

  createUser: (id: string, input: CreateMemberInput): Promise<MembershipDTO> =>
    apiClient.post<MembershipDTO>(`/orgs/${id}/users`, input),

  blockMember: (id: string, userId: string): Promise<MembershipDTO> =>
    apiClient.post<MembershipDTO>(`/orgs/${id}/members/${userId}/block`, {}),

  unblockMember: (id: string, userId: string): Promise<MembershipDTO> =>
    apiClient.post<MembershipDTO>(`/orgs/${id}/members/${userId}/unblock`, {}),

  removeMember: (id: string, userId: string): Promise<{ success: true }> =>
    apiClient.delete<{ success: true }>(`/orgs/${id}/members/${userId}`),
};
