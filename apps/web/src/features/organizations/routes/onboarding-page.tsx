import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Sparkles } from 'lucide-react';
import { createOrgSchema, type CreateOrgInput } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useOrgStore } from '@/stores/org-store';
import { useCreateOrg, useOrgs } from '../hooks/use-orgs';

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const userName = useAuthStore((s) => s.user?.name);
  const { data: orgs } = useOrgs();
  const setActiveOrgId = useOrgStore((s) => s.setActiveOrgId);
  const createOrg = useCreateOrg();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: '', timezone: 'UTC' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await createOrg.mutateAsync({
      name: values.name,
      slug: values.slug?.trim() ? values.slug : undefined,
      timezone: values.timezone,
    });
    navigate('/', { replace: true });
  });

  const selectExisting = (id: string): void => {
    setActiveOrgId(id);
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-lg font-semibold">AI ProjectOS</span>
      </div>

      <div className="w-full max-w-md space-y-4">
        {orgs && orgs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Continue to a workspace</CardTitle>
              <CardDescription>Pick an organization you already belong to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => selectExisting(org.id)}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{org.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{org.slug}</p>
                  </div>
                  {org.role && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {org.role}
                    </span>
                  )}
                  <Check className="size-4 opacity-0" />
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {userName ? `Welcome, ${userName.split(' ')[0]}!` : 'Create your organization'}
            </CardTitle>
            <CardDescription>
              An organization is your team&apos;s workspace for projects and tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="name">Organization name</Label>
                <Input
                  id="name"
                  placeholder="Acme Inc."
                  aria-invalid={Boolean(errors.name)}
                  {...register('name')}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">
                  URL slug <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="slug"
                  placeholder="acme"
                  aria-invalid={Boolean(errors.slug)}
                  {...register('slug')}
                />
                {errors.slug ? (
                  <p className="text-xs text-destructive">{errors.slug.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to generate one from the name.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={createOrg.isPending}>
                {createOrg.isPending ? 'Creating…' : 'Create organization'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
