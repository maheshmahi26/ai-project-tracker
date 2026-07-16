import type { TooltipProps } from 'recharts';

/** Categorical palette mapped to the design-system chart tokens (theme-aware). */
export const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0];
}

export const AXIS_TICK = { fill: 'var(--color-muted-foreground)', fontSize: 12 } as const;
export const AXIS_LINE = { stroke: 'var(--color-border)' } as const;

/** Card-styled tooltip so charts match light/dark theme instead of Recharts' default white box. */
export function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && label !== '' && (
        <p className="mb-1 font-medium text-foreground">{String(label)}</p>
      )}
      {payload.map((entry, i) => (
        <div key={`${entry.dataKey ?? i}`} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: (entry.color as string) ?? 'var(--color-chart-1)' }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
