import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import type { TaskDTO, TaskStatus } from '@ai-projectos/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { STATUS_LABELS, STATUS_ORDER } from './task-badges';
import { TaskCard } from './task-card';
import { computeOrder } from '../lib/board-order';
import { useTaskBoard, useMoveTask } from '../hooks/use-tasks';

const COLUMN_PREFIX = 'col:';

function SortableTaskCard({
  task,
  onOpen,
}: {
  task: TaskDTO;
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="cursor-grab active:cursor-grabbing"
      onClick={() => onOpen(task.id)}
      {...attributes}
      {...listeners}
    />
  );
}

function BoardColumn({
  status,
  tasks,
  onOpen,
  onQuickAdd,
}: {
  status: TaskStatus;
  tasks: TaskDTO[];
  onOpen: (id: string) => void;
  onQuickAdd: (status: TaskStatus) => void;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/40">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {STATUS_LABELS[status]}
          <span className="rounded bg-muted px-1.5 text-xs font-normal text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={`Add task to ${STATUS_LABELS[status]}`}
          onClick={() => onQuickAdd(status)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 rounded-b-lg p-2 transition-colors',
          isOver && 'bg-primary/5 ring-2 ring-inset ring-primary/30',
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({
  projectId,
  onOpenTask,
  onQuickAdd,
}: {
  projectId: string;
  onOpenTask: (id: string) => void;
  onQuickAdd: (status: TaskStatus) => void;
}): React.JSX.Element {
  const { data: tasks, isLoading, isError } = useTaskBoard(projectId);
  const move = useMoveTask(projectId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grouped = useMemo(() => {
    const acc: Record<TaskStatus, TaskDTO[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of tasks ?? []) acc[t.status].push(t);
    for (const status of STATUS_ORDER) acc[status].sort((a, b) => a.order - b.order);
    return acc;
  }, [tasks]);

  const taskById = useMemo(() => {
    const map = new Map<string, TaskDTO>();
    for (const t of tasks ?? []) map.set(t.id, t);
    return map;
  }, [tasks]);

  const containerOf = (id: string): TaskStatus | null => {
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length) as TaskStatus;
    return taskById.get(id)?.status ?? null;
  };

  const onDragStart = (event: DragStartEvent): void => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent): void => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const destStatus = containerOf(overIdStr);
    const activeTask = taskById.get(activeIdStr);
    if (!destStatus || !activeTask) return;

    const dest = grouped[destStatus].filter((t) => t.id !== activeIdStr);
    let index = dest.findIndex((t) => t.id === overIdStr);
    if (index === -1) index = dest.length; // dropped on empty column space

    const newOrder = computeOrder(dest, index);

    // No-op guard: same column, same slot.
    if (activeTask.status === destStatus && activeTask.order === newOrder) return;

    move.mutate({ id: activeIdStr, input: { status: destStatus, order: newOrder } });
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <EmptyState title="Couldn't load the board" description="Try again in a moment." />;
  }

  const activeTask = activeId ? taskById.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={grouped[status]}
            onOpen={onOpenTask}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
