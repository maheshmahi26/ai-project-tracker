import { Suspense, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/error-boundary/error-boundary';

interface ChartFrameProps {
  title: string;
  /** Chart content — keep the heavy chart lib (Recharts) inside a lazy child. */
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a (lazily-loaded) chart in a card with its own Suspense fallback and
 * error boundary, so a broken/slow chart never crashes the dashboard.
 * Recharts-based charts are added in TASK-13.
 */
export function ChartFrame({ title, children, className }: ChartFrameProps): React.JSX.Element {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>{children}</Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
