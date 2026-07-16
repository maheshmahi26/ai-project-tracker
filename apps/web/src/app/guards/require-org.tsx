import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { useActiveOrg } from '@/features/organizations/hooks/use-orgs';
import { useOrgStore } from '@/stores/org-store';

/**
 * Ensures the user has (and has selected) an organization before entering the
 * app shell. No orgs → onboarding. Keeps the persisted selection in sync with
 * the resolved active org.
 */
export function RequireOrg(): React.JSX.Element {
  const { activeOrg, orgs, isLoading, isError } = useActiveOrg();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const setActiveOrgId = useOrgStore((s) => s.setActiveOrgId);

  useEffect(() => {
    if (activeOrg && activeOrg.id !== activeOrgId) {
      setActiveOrgId(activeOrg.id);
    }
  }, [activeOrg, activeOrgId, setActiveOrgId]);

  if (isLoading) return <PageSkeleton />;
  // On error, let the app render; the error toast already fired. Onboarding is a
  // safe fallback only when we positively know there are zero orgs.
  if (!isError && orgs.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
