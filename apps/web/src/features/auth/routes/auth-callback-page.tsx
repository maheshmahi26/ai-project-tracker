import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Landing page after Google OAuth. The backend has already set the refresh
 * cookie and redirected here; AuthBootstrap performs the silent refresh on load,
 * so this page just reacts to the resolved session and routes onward.
 */
export default function AuthCallbackPage(): React.JSX.Element {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true });
    } else if (status === 'unauthenticated') {
      toast.error('Sign-in failed. Please try again.');
      navigate('/login', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Completing sign-in…
    </div>
  );
}
