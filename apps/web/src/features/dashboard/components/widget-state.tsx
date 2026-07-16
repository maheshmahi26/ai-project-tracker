import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Normalizes the loading / error / empty states shared by every chart widget so
 * the widgets themselves stay focused on data → chart mapping.
 */
export function WidgetState({
  isLoading,
  isError,
  isEmpty,
  emptyLabel = 'No data for this range yet.',
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyLabel?: string;
  children: ReactNode;
}): React.JSX.Element {
  if (isLoading) return <Skeleton className="h-[260px] w-full" />;
  if (isError) {
    return (
      <div className="flex h-[260px] items-center justify-center text-center text-sm text-destructive">
        Couldn&apos;t load this widget. Try refreshing.
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return <>{children}</>;
}
