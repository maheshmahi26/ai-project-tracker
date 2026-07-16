/**
 * Fractional ordering for Kanban reordering: a task's `order` is a float so it
 * can always be placed between two neighbors without renumbering the column.
 * `dest` is the destination column's tasks WITHOUT the dragged task, and
 * `index` is the slot the dragged task should occupy.
 */
export function computeOrder(dest: Array<{ order: number }>, index: number): number {
  const prev = dest[index - 1];
  const next = dest[index];
  if (prev && next) return (prev.order + next.order) / 2;
  if (prev) return prev.order + 1;
  if (next) return next.order - 1;
  return 0;
}
