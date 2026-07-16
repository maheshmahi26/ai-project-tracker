import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Gate for authenticated areas. If there's no session, redirect to /login and
 * remember where the user was headed so we can return them after sign-in.
 */
export function RequireAuth(): React.JSX.Element {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
