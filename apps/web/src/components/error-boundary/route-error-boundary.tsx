import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Rendered by React Router as a route's `errorElement`. */
export function RouteErrorBoundary(): React.JSX.Element {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Unexpected error';
  let message = 'An unexpected error occurred while rendering this page.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message =
      error.status === 404
        ? "The page you're looking for doesn't exist."
        : (error.data?.message ?? message);
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button onClick={() => navigate('/')}>Go home</Button>
      </div>
    </div>
  );
}
