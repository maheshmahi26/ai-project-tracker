import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrgStore } from '@/stores/org-store';
import { useActiveOrg } from '../hooks/use-orgs';

export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }): React.JSX.Element {
  const navigate = useNavigate();
  const { activeOrg, orgs, isLoading } = useActiveOrg();
  const setActiveOrgId = useOrgStore((s) => s.setActiveOrgId);

  if (isLoading && !activeOrg) {
    return <Skeleton className={cn('h-9', collapsed ? 'w-9' : 'w-full')} />;
  }
  if (!activeOrg) return <div />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'w-9 justify-center' : 'w-full',
          )}
          aria-label="Switch organization"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Building2 className="size-3.5" />
          </div>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">{activeOrg.name}</span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => setActiveOrgId(org.id)}>
            <Building2 />
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {org.id === activeOrg.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/onboarding')}>
          <Plus />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
