import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandPalette } from '@/components/command-palette';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { useUiStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { OrgSwitcher } from '@/features/organizations/components/org-switcher';

function initials(name: string | undefined): string {
  if (!name) return 'U';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar(): React.JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        {!collapsed && <span className="truncate font-semibold">AI ProjectOS</span>}
      </div>

      <div className="border-b p-2">
        <OrgSwitcher collapsed={collapsed} />
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground',
                  collapsed && 'justify-center px-0',
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );

          return collapsed ? (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar(): React.JSX.Element {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  const handleSignOut = (): void => {
    logout.mutate(undefined, {
      onSettled: () => navigate('/login', { replace: true }),
    });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <PanelLeft />
      </Button>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-4" />
        <span>Search…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-xs sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <Avatar>
                <AvatarFallback>{initials(user?.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate font-medium">{user?.name ?? 'My account'}</span>
              {user?.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <User />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Authenticated app shell: sidebar + top bar + routed content. */
export function AppShell(): React.JSX.Element {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
