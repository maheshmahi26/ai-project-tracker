import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Widget/app-level error boundary. Wrap risky subtrees (charts, editors) so a
 * single crash doesn't take down the whole page. Route-level errors are handled
 * by {@link RouteErrorBoundary} via React Router's `errorElement`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // TASK-15 will forward this to Sentry.
    console.error('ErrorBoundary caught an error', error, info);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultErrorFallback error={error} reset={this.reset} />;
  }
}

export function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">Something went wrong</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
