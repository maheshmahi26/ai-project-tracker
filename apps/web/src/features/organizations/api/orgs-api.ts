import type {
  CreateOrgInput,
  InviteMemberInput,
  MembershipDTO,
  OrganizationDTO,
} from '@ai-projectos/shared';
import { apiClient } from '@/lib/api-client';

export const orgsApi = {
  listMine: (): Promise<OrganizationDTO[]> => apiClient.get<OrganizationDTO[]>('/orgs'),

  create: (input: CreateOrgInput): Promise<OrganizationDTO> =>
    apiClient.post<OrganizationDTO>('/orgs', input),

  get: (id: string): Promise<OrganizationDTO> => apiClient.get<OrganizationDTO>(`/orgs/${id}`),

  listMembers: (id: string): Promise<MembershipDTO[]> =>
    apiClient.get<MembershipDTO[]>(`/orgs/${id}/members`),

  invite: (id: string, input: InviteMemberInput): Promise<MembershipDTO> =>
    apiClient.post<MembershipDTO>(`/orgs/${id}/members`, input),
};
