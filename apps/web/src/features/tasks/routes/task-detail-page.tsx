import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskDTO,
  type TaskPriority,
  type TaskStatus,
} from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { useMembers } from '@/hooks/use-members';
import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { CommentThread } from '@/features/comments/components/comment-thread';
import { AttachmentsSection } from '@/features/files/components/attachments-section';
import { TaskDescription } from '../components/task-description';
import { TaskFormDialog } from '../components/task-form-dialog';
import { SubtasksSection } from '../components/subtasks-section';
import { AssigneePicker } from '../components/assignee-picker';
import { PriorityBadge } from '../components/task-badges';
import { STATUS_LABELS } from '../components/task-badges';
import { useAssignTask, useDeleteTask, useTask, useUpdateTask, useUndoDeleteTask } from '../hooks/use-tasks';

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function DetailsSidebar({ task }: { task: TaskDTO }): React.JSX.Element {
  const canUpdate = useCan('task:update');
  const update = useUpdateTask();
  const assign = useAssignTask();
  const { byId } = useMembers();
  const reporter = byId(task.reporterId);

  const fmt = (iso?: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <Card>
      <CardContent className="space-y-4 pt-6 text-sm">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          {canUpdate ? (
            <select
              className={`${selectClass} w-full`}
              value={task.status}
              onChange={(e) =>
                update.mutate({ id: task.id, input: { status: e.target.value as TaskStatus } })
              }
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <p>{STATUS_LABELS[task.status]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Priority</span>
          {canUpdate ? (
            <select
              className={`${selectClass} w-full`}
              value={task.priority}
              onChange={(e) =>
                update.mutate({ id: task.id, input: { priority: e.target.value as TaskPriority } })
              }
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          ) : (
            <PriorityBadge priority={task.priority} />
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Assignee</span>
          <div>
            <AssigneePicker
              value={task.assigneeId}
              disabled={!canUpdate || assign.isPending}
              onChange={(userId) => assign.mutate({ id: task.id, input: { assigneeId: userId } })}
            />
          </div>
        </div>

        <dl className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Story points</dt>
            <dd className="font-medium">{task.storyPoints ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Due date</dt>
            <dd className="font-medium">{fmt(task.dueDate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Reporter</dt>
            <dd className="truncate font-medium">{reporter?.name ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium">{fmt(task.createdAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function TaskDetailPage(): React.JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const canUpdate = useCan('task:update');
  const canDelete = useCan('task:delete');
  const del = useDeleteTask();
  const undo = useUndoDeleteTask();
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState('comments');

  const { data: task, isLoading, isError } = useTask(taskId);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="p-6">
        <EmptyState
          title="Task not found"
          description="It may have been deleted or you don't have access."
          action={
            <Button variant="outline" onClick={() => navigate('/tasks')}>
              Back to tasks
            </Button>
          }
        />
      </div>
    );
  }

  const handleDelete = (): void => {
    del.mutate(task.id, {
      onSuccess: () => {
        toast.success(`Deleted ${task.key}`, {
          action: { label: 'Undo', onClick: () => undo.mutate(task.id) },
        });
        navigate('/tasks');
      },
    });
  };

  return (
    <div className="space-y-6 p-6">
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{task.key}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TaskDescription task={task} />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="comments">Comments ({task.commentsCount})</TabsTrigger>
              <TabsTrigger value="subtasks">Subtasks</TabsTrigger>
              <TabsTrigger value="files">Files ({task.attachmentsCount})</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
              <CommentThread taskId={task.id} />
            </TabsContent>
            <TabsContent value="subtasks">
              <SubtasksSection parent={task} />
            </TabsContent>
            <TabsContent value="files">
              <AttachmentsSection scope={{ type: 'task', id: task.id }} />
            </TabsContent>
            <TabsContent value="activity">
              <ActivityFeed entityType="task" entityId={task.id} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <DetailsSidebar task={task} />
        </div>
      </div>

      <TaskFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        projectId={task.projectId}
        task={task}
      />
    </div>
  );
}
