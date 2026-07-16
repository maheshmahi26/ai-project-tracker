import { FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-states/empty-state';

export default function ProjectsPage(): React.JSX.Element {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Organize work into projects. CRUD lands in TASK-08.
          </p>
        </div>
        <Button disabled>
          <Plus />
          New project
        </Button>
      </div>

      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create your first project to start planning sprints and tasks."
        action={
          <Button variant="outline" disabled>
            <Plus />
            Create project
          </Button>
        }
      />
    </div>
  );
}
