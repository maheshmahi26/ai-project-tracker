import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { passwordSchema } from '@ai-projectos/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useResetPassword } from '../hooks/use-auth';

interface FormValues {
  password: string;
  confirm: string;
}

export default function ResetPasswordPage(): React.JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await reset.mutateAsync({ token, password: values.password });
    toast.success('Password updated — please sign in.');
    navigate('/login', { replace: true });
  });

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Invalid reset link</CardTitle>
          <CardDescription>This link is missing or malformed. Request a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Set a new password</CardTitle>
        <CardDescription>Choose a strong password for your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password', {
                validate: (value) => {
                  const parsed = passwordSchema.safeParse(value);
                  return parsed.success || (parsed.error.issues[0]?.message ?? 'Invalid password');
                },
              })}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              {...register('confirm', {
                validate: (value) => value === getValues('password') || 'Passwords do not match',
              })}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
