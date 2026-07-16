import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

/** Keeps signed-in users out of the auth screens (login/register/etc.). */
export function RedirectIfAuthed(): React.JSX.Element {
  const status = useAuthStore((s) => s.status);
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
