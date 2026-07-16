import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProjectProgressDTO } from '@ai-projectos/shared';
import { AXIS_TICK, ChartTooltip, chartColor } from './chart-kit';

export default function ProjectProgressChart({
  data,
}: {
  data: ProjectProgressDTO[];
}): React.JSX.Element {
  const rows = data.map((p) => ({ name: p.key, '% complete': p.percentComplete }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
      <BarChart
        layout="vertical"
        data={rows}
        margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
        barSize={18}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} content={<ChartTooltip />} />
        <Bar dataKey="% complete" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
