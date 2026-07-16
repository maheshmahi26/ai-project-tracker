import { CheckSquare } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-states/empty-state';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  assignee: string;
}

const columns: Array<Column<TaskRow>> = [
  { key: 'title', header: 'Title', cell: (r) => r.title },
  { key: 'status', header: 'Status', cell: (r) => r.status },
  { key: 'assignee', header: 'Assignee', cell: (r) => r.assignee },
];

export default function TasksPage(): React.JSX.Element {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Board, table, and detail views arrive in TASK-11.
        </p>
      </div>

      <DataTable<TaskRow>
        columns={columns}
        data={[]}
        getRowId={(r) => r.id}
        emptyState={
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet"
            description="Tasks will show up here once the tasks feature is built."
          />
        }
      />
    </div>
  );
}
