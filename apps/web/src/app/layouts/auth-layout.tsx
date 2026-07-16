import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';

/** Layout for unauthenticated screens (login/register — logic in TASK-06). */
export function AuthLayout(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-lg font-semibold">AI ProjectOS</span>
      </div>
      <div className="w-full max-w-sm">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
