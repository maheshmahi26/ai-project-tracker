import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Blocks the app until a user who signed in with a temporary password sets a new
 * one. The `/change-password` route lives outside this gate so it stays reachable.
 */
export function RequirePasswordCurrent(): React.JSX.Element {
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword ?? false);

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
