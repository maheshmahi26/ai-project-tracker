import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Ban, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';
import {
  createMemberSchema,
  nonAdminRoleSchema,
  type CreateMemberInput,
  type MembershipDTO,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-states/empty-state';
import { useCan } from '@/hooks/use-can';
import { useAuthStore } from '@/stores/auth-store';
import {
  useActiveOrg,
  useBlockMember,
  useCreateUser,
  useOrgMembersPage,
  useRemoveMember,
  useUnblockMember,
} from '../hooks/use-orgs';

const PAGE_SIZE = 10;
const NON_ADMIN_ROLES = nonAdminRoleSchema.options;

function CreateUserForm({ orgId }: { orgId: string }): React.JSX.Element {
  const createUser = useCreateUser(orgId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateMemberInput>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: { email: '', name: '', password: '', role: 'developer' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await createUser.mutateAsync(values);
    toast.success(`Created ${values.email}`, {
      description: 'They must change this temporary password on first sign-in.',
    });
    reset();
  });

  return (
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-name">Name</Label>
          <Input
            id="new-name"
            placeholder="Jane Doe"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-email">Email</Label>
          <Input
            id="new-email"
            type="email"
            placeholder="teammate@company.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-password">Temporary password</Label>
          <Input
            id="new-password"
            type="text"
            autoComplete="off"
            placeholder="At least 8 characters"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-role">Role</Label>
          <select
            id="new-role"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            {...register('role')}
          >
            {NON_ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? 'Creating…' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}

type PendingAction =
  | { kind: 'block' | 'unblock' | 'delete'; member: MembershipDTO }
  | null;

function statusBadge(member: MembershipDTO): React.JSX.Element {
  if (member.user?.status === 'disabled') return <Badge variant="destructive">Blocked</Badge>;
  if (member.status === 'invited') return <Badge variant="outline">invited</Badge>;
  return <Badge variant="secondary">active</Badge>;
}

export function MembersSection(): React.JSX.Element | null {
  const { activeOrg } = useActiveOrg();
  const canManageUsers = useCan('manage:users');
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction>(null);

  const { data, isLoading } = useOrgMembersPage(activeOrg?.id, page, PAGE_SIZE);
  const block = useBlockMember(activeOrg?.id);
  const unblock = useUnblockMember(activeOrg?.id);
  const remove = useRemoveMember(activeOrg?.id);

  if (!activeOrg) return null;

  const members = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isMutating = block.isPending || unblock.isPending || remove.isPending;

  const canActOn = (member: MembershipDTO): boolean =>
    canManageUsers &&
    member.userId !== currentUserId &&
    member.userId !== activeOrg.ownerId;

  const columns: Array<Column<MembershipDTO>> = [
    {
      key: 'member',
      header: 'Member',
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.user?.name ?? m.user?.email ?? m.userId}</p>
          {m.user?.email && (
            <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) => <Badge variant="secondary">{m.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: statusBadge,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      cell: (m) =>
        canActOn(m) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Member actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {m.user?.status === 'disabled' ? (
                <DropdownMenuItem onSelect={() => setPending({ kind: 'unblock', member: m })}>
                  <ShieldCheck />
                  Unblock
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setPending({ kind: 'block', member: m })}>
                  <Ban />
                  Block
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setPending({ kind: 'delete', member: m })}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const confirmAction = (): void => {
    if (!pending) return;
    const { kind, member } = pending;
    const label = member.user?.name ?? member.user?.email ?? 'user';
    const opts = {
      onSuccess: () => {
        const msg =
          kind === 'block'
            ? `Blocked ${label}`
            : kind === 'unblock'
              ? `Unblocked ${label}`
              : `Removed ${label}`;
        toast.success(msg);
        setPending(null);
      },
    };
    if (kind === 'block') block.mutate(member.userId, opts);
    else if (kind === 'unblock') unblock.mutate(member.userId, opts);
    else remove.mutate(member.userId, opts);
  };

  const dialogCopy: Record<Exclude<PendingAction, null>['kind'], { title: string; body: string; cta: string }> = {
    block: {
      title: 'Block this user?',
      body: 'They will be signed out and unable to log in until unblocked.',
      cta: 'Block',
    },
    unblock: {
      title: 'Unblock this user?',
      body: 'They will be able to log in again.',
      cta: 'Unblock',
    },
    delete: {
      title: 'Remove this member?',
      body: 'They will lose access to this organization. This cannot be undone.',
      cta: 'Remove',
    },
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>People with access to {activeOrg.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DataTable
          columns={columns}
          data={members}
          getRowId={(m) => m.id}
          isLoading={isLoading}
          emptyState={<EmptyState title="No members yet" description="Create a user to get started." />}
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} member{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        {canManageUsers ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Create a user</p>
            <CreateUserForm orgId={activeOrg.id} />
          </div>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            You need the <span className="font-medium">manage:users</span> permission to manage
            members.
          </p>
        )}
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>{dialogCopy[pending.kind].title}</DialogTitle>
                <DialogDescription>{dialogCopy[pending.kind].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)} disabled={isMutating}>
                  Cancel
                </Button>
                <Button
                  variant={pending.kind === 'unblock' ? 'default' : 'destructive'}
                  onClick={confirmAction}
                  disabled={isMutating}
                >
                  {dialogCopy[pending.kind].cta}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
