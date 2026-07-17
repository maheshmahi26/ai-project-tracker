import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { passwordSchema } from '@ai-projectos/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useChangePassword } from '../hooks/use-auth';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

export default function ChangePasswordPage(): React.JSX.Element {
  const navigate = useNavigate();
  const change = useChangePassword();
  const mustChange = useAuthStore((s) => s.user?.mustChangePassword ?? false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await change.mutateAsync({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    toast.success('Password updated.');
    navigate('/', { replace: true });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <CardDescription>
            {mustChange
              ? 'You are using a temporary password. Choose a new one to continue.'
              : 'Update the password for your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.currentPassword)}
                {...register('currentPassword', { required: 'Enter your current password' })}
              />
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                {...register('newPassword', {
                  validate: (value) => {
                    const parsed = passwordSchema.safeParse(value);
                    return parsed.success || (parsed.error.issues[0]?.message ?? 'Invalid password');
                  },
                })}
              />
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm)}
                {...register('confirm', {
                  validate: (value) =>
                    value === getValues('newPassword') || 'Passwords do not match',
                })}
              />
              {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={change.isPending}>
              {change.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
