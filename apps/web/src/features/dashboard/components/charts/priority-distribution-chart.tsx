import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { PriorityDistributionDTO } from '@ai-projectos/shared';
import { ChartTooltip, chartColor } from './chart-kit';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export default function PriorityDistributionChart({
  data,
}: {
  data: PriorityDistributionDTO[];
}): React.JSX.Element {
  const rows = data
    .filter((d) => d.count > 0)
    .map((d) => ({ name: PRIORITY_LABELS[d.priority] ?? d.priority, value: d.count }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {rows.map((row, i) => (
            <Cell key={row.name} fill={chartColor(i)} stroke="var(--color-background)" />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
