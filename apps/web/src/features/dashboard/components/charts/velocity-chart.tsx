import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { VelocityPointDTO } from '@ai-projectos/shared';
import { AXIS_LINE, AXIS_TICK, ChartTooltip, chartColor } from './chart-kit';

export default function VelocityChart({ data }: { data: VelocityPointDTO[] }): React.JSX.Element {
  const rows = data.map((s) => ({
    name: s.name,
    Committed: s.committedPoints,
    Completed: s.completedPoints,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Committed" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Completed" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
