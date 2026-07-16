import { can, type Permission, type Role } from '@ai-projectos/shared';
import { useActiveOrg } from '@/features/organizations/hooks/use-orgs';

/** The caller's role in the active organization (undefined until resolved). */
export function useActiveRole(): Role | undefined {
  const { activeOrg } = useActiveOrg();
  return activeOrg?.role;
}

/**
 * RBAC gate for UI. Returns false while the role is unknown so controls default
 * to *hidden/disabled* rather than flashing then disappearing. The server still
 * enforces permissions — this only shapes the UI.
 */
export function useCan(permission: Permission): boolean {
  const role = useActiveRole();
  return role ? can(role, permission) : false;
}
