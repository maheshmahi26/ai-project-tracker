import { useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatSessionDTO } from '@ai-projectos/shared';

interface SessionSidebarProps {
  sessions: ChatSessionDTO[];
  activeId?: string;
  isLoading: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (session: ChatSessionDTO) => void;
  onDelete: (session: ChatSessionDTO) => void;
}

export function SessionSidebar({
  sessions,
  activeId,
  isLoading,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: SessionSidebarProps): React.JSX.Element {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="p-3">
        <Button onClick={onNew} className="w-full justify-start gap-2">
          <Plus className="size-4" />
          New chat
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Chat history">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((session) => (
              <li key={session.id}>
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md pr-1 text-sm transition-colors',
                    session.id === activeId
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left focus-visible:outline-none"
                    title={session.title}
                  >
                    {session.title || 'Untitled chat'}
                  </button>

                  <DropdownMenu
                    open={menuFor === session.id}
                    onOpenChange={(o) => setMenuFor(o ? session.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Chat options"
                        className={cn(
                          'size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
                          menuFor === session.id && 'opacity-100',
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => onRename(session)}>
                        <Pencil className="size-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDelete(session)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
