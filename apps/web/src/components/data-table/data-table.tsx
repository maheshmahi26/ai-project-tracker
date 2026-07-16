import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Array<Column<T>>;
  data: T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * Lightweight, accessible table shell. Feature tables (tasks, projects) compose
 * this with filters/sort/pagination; a virtualized variant arrives when needed.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  isLoading,
  emptyState,
  onRowClick,
}: DataTableProps<T>): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'h-10 px-4 text-left align-middle font-medium text-muted-foreground',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="border-b">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <Skeleton className="h-4 w-full max-w-[160px]" />
                  </td>
                ))}
              </tr>
            ))}

          {!isLoading &&
            data.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b transition-colors hover:bg-muted/50',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>

      {!isLoading && data.length === 0 && emptyState && (
        <div className="p-6">{emptyState}</div>
      )}
    </div>
  );
}
