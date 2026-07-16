import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMarkAllRead, useMarkRead, useNotifications } from '../hooks/use-notifications';

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationCenter(): React.JSX.Element {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = data?.items ?? [];
  const unread = data?.page?.total ?? 0;

  const onItemClick = (n: NotificationDTO): void => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.entity?.type === 'task') {
      setOpen(false);
      navigate(`/tasks/${n.entity.id}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(n)}
                    className={cn(
                      'flex w-full gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50',
                      !n.readAt && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-primary',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body && (
                        <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                      )}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {relativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
