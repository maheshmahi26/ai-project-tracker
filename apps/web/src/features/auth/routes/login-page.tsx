import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Presentational login screen. Real auth flow (validation, tokens) is TASK-06. */
export default function LoginPage(): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your AI ProjectOS workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => e.preventDefault()}
          aria-describedby="login-hint"
        >
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" type="email" placeholder="you@company.com" autoComplete="email" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input id="password" type="password" autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full" disabled>
            Sign in
          </Button>
          <p id="login-hint" className="text-center text-xs text-muted-foreground">
            Authentication is implemented in TASK-06.
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Back to app
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
