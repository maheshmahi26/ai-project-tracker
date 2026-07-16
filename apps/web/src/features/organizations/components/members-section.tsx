import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ROLES, inviteMemberSchema, type InviteMemberInput } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/use-can';
import { useActiveOrg, useInviteMember, useOrgMembers } from '../hooks/use-orgs';

function InviteForm({ orgId }: { orgId: string }): React.JSX.Element {
  const invite = useInviteMember(orgId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'developer' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await invite.mutateAsync(values);
    toast.success(`Invited ${values.email}`);
    reset();
  });

  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
      <div className="flex-1 space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="teammate@company.com"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-36"
          {...register('role')}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={invite.isPending}>
        {invite.isPending ? 'Inviting…' : 'Invite'}
      </Button>
    </form>
  );
}

export function MembersSection(): React.JSX.Element | null {
  const { activeOrg } = useActiveOrg();
  const { data: members, isLoading } = useOrgMembers(activeOrg?.id);
  const canManageUsers = useCan('manage:users');

  if (!activeOrg) return null;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>People with access to {activeOrg.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {(members ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.user?.name ?? m.user?.email ?? m.userId}</p>
                  {m.user?.email && (
                    <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{m.role}</Badge>
                  {m.status === 'invited' && <Badge variant="outline">invited</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canManageUsers ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Invite a member</p>
            <InviteForm orgId={activeOrg.id} />
          </div>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            You need the <span className="font-medium">manage:users</span> permission to invite
            members.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
