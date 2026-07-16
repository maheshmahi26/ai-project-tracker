import { Suspense, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/error-boundary/error-boundary';

interface ChartFrameProps {
  title: string;
  /** Optional header control (e.g. a sprint selector) rendered on the right. */
  action?: ReactNode;
  /** Chart content — keep the heavy chart lib (Recharts) inside a lazy child. */
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a (lazily-loaded) chart in a card with its own Suspense fallback and
 * error boundary, so a broken/slow chart never crashes the dashboard.
 */
export function ChartFrame({
  title,
  action,
  children,
  className,
}: ChartFrameProps): React.JSX.Element {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>{children}</Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
