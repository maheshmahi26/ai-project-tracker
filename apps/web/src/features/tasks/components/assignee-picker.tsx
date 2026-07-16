import { UserCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, useMembers } from '@/hooks/use-members';

export function AssigneeAvatar({
  assigneeId,
  size = 'sm',
}: {
  assigneeId?: string | null;
  size?: 'sm' | 'xs';
}): React.JSX.Element {
  const { byId } = useMembers();
  const member = byId(assigneeId);
  const dim = size === 'xs' ? 'size-5 text-[10px]' : 'size-6 text-xs';
  if (!member) {
    return <UserCircle2 className={size === 'xs' ? 'size-5' : 'size-6'} aria-label="Unassigned" />;
  }
  return (
    <Avatar className={dim} title={member.name}>
      <AvatarFallback className="text-[inherit]">{initials(member.name)}</AvatarFallback>
    </Avatar>
  );
}

export function AssigneePicker({
  value,
  onChange,
  disabled,
}: {
  value?: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { members, byId } = useMembers();
  const current = byId(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <AssigneeAvatar assigneeId={value} size="xs" />
          <span className="truncate">{current ? current.name : 'Unassigned'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <UserCircle2 />
          Unassigned
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.userId} onSelect={() => onChange(m.userId)}>
            <Avatar className="size-5 text-[10px]">
              <AvatarFallback className="text-[inherit]">{initials(m.name)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{m.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
