import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip, chartColor } from './chart-kit';

export default function CompletionChart({
  done,
  open,
}: {
  done: number;
  open: number;
}): React.JSX.Element {
  const rows = [
    { name: 'Completed', value: done },
    { name: 'Pending', value: open },
  ];

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
          <Cell fill={chartColor(1)} stroke="var(--color-background)" />
          <Cell fill={chartColor(0)} stroke="var(--color-background)" />
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
