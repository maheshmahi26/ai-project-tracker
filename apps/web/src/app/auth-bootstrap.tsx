import { useEffect, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { refreshSession } from '@/features/auth/api/auth-api';
import '@/features/auth/configure-auth';

function BootSplash(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Sparkles className="size-6" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading your workspace…
      </div>
    </div>
  );
}

/**
 * Attempts a silent refresh on load (using the httpOnly refresh cookie) to
 * re-hydrate the in-memory access token + user. Renders a splash until the
 * session is resolved so route guards never flash the wrong screen.
 */
export function AuthBootstrap({ children }: { children: ReactNode }): React.JSX.Element {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      useAuthStore.getState().setStatus('loading');
      const result = await refreshSession();
      if (cancelled) return;
      if (result) {
        useAuthStore.getState().setSession(result.user, result.tokens.accessToken);
      } else {
        useAuthStore.getState().clear();
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'idle' || status === 'loading') return <BootSplash />;
  return <>{children}</>;
}
