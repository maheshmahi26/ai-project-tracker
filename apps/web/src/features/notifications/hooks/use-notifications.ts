import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useOrgStore } from '@/stores/org-store';
import { notificationsApi, type NotificationsPage } from '../api/notifications-api';

/**
 * Backs the notification center. `meta.total` is the unread count (the backend
 * returns it on every list call), so the unread badge stays in sync without a
 * second request. Polls every 30s for near-real-time updates.
 */
export function useNotifications() {
  const orgId = useOrgStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: queryKeys.notifications.list(orgId),
    queryFn: () => notificationsApi.list({ limit: 20 }),
    refetchInterval: 30_000,
    enabled: Boolean(orgId),
  });
}

export function useUnreadCount(): number {
  const query = useNotifications();
  return query.data?.page?.total ?? 0;
}

function usePatch() {
  const queryClient = useQueryClient();
  const orgId = useOrgStore((s) => s.activeOrgId);
  const key = queryKeys.notifications.list(orgId);
  return {
    key,
    patch: (updater: (page: NotificationsPage) => NotificationsPage) => {
      const previous = queryClient.getQueryData<NotificationsPage>(key);
      if (previous) queryClient.setQueryData<NotificationsPage>(key, updater(previous));
      return previous;
    },
    restore: (previous: NotificationsPage | undefined) => {
      if (previous) queryClient.setQueryData(key, previous);
    },
    invalidate: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists }),
  };
}

export function useMarkRead() {
  const { patch, restore, invalidate } = usePatch();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: (id) =>
      patch((page) => ({
        ...page,
        items: page.items.map((n) =>
          n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
        ),
        page: page.page
          ? { ...page.page, total: Math.max(0, (page.page.total ?? 0) - 1) }
          : page.page,
      })),
    onError: (_e, _id, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useMarkAllRead() {
  const { patch, restore, invalidate } = usePatch();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: () =>
      patch((page) => ({
        ...page,
        items: page.items.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
        page: page.page ? { ...page.page, total: 0 } : page.page,
      })),
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}
