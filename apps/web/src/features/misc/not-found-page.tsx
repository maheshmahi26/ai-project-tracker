import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold text-muted-foreground/40">404</p>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  );
}
