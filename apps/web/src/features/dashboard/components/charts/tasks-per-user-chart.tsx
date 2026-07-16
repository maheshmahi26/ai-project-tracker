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
import { AXIS_TICK, ChartTooltip, chartColor } from './chart-kit';

export interface TasksPerUserRow {
  name: string;
  Done: number;
  Open: number;
}

export default function TasksPerUserChart({
  data,
}: {
  data: TasksPerUserRow[];
}): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        barSize={18}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Done" stackId="t" fill={chartColor(1)} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Open" stackId="t" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
