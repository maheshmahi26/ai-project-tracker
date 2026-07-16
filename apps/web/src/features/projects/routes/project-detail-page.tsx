import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from 'lucide-react';
import type { ProjectDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-states/empty-state';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';
import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { ProjectFormDialog } from '../components/project-form-dialog';
import { ProjectStatusBadge } from '../components/project-status-badge';
import { useArchiveProject, useProject, useRestoreProject } from '../hooks/use-projects';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'board', label: 'Board' },
  { id: 'sprints', label: 'Sprints' },
  { id: 'activity', label: 'Activity' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function OverviewTab({ project }: { project: ProjectDTO }): React.JSX.Element {
  const fmt = (iso?: string | null): string =>
    iso ? new Date(iso).toLocaleDateString() : '—';
  const rows: Array<[string, React.ReactNode]> = [
    ['Status', <ProjectStatusBadge key="s" status={project.status} />],
    ['Start date', fmt(project.startDate)],
    ['Target date', fmt(project.targetDate)],
    ['Tasks created', project.counters.taskSeq],
    ['Created', fmt(project.createdAt)],
    ['Last updated', fmt(project.updatedAt)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          {project.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{project.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }): React.JSX.Element {
  return (
    <EmptyState
      title={`${label} coming soon`}
      description="This tab will be built in a later milestone."
    />
  );
}

export default function ProjectDetailPage(): React.JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('overview');
  const [editOpen, setEditOpen] = useState(false);

  const canUpdate = useCan('project:update');
  const canArchive = useCan('project:archive');
  const archive = useArchiveProject();
  const restore = useRestoreProject();

  const { data: project, isLoading, isError } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="p-6">
        <EmptyState
          title="Project not found"
          description="It may have been deleted or you don't have access."
          action={
            <Button variant="outline" onClick={() => navigate('/projects')}>
              Back to projects
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 size-4 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{project.key}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canUpdate && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
          )}
          {canArchive &&
            (project.status === 'active' ? (
              <Button variant="outline" onClick={() => archive.mutate(project.id)}>
                <Archive />
                Archive
              </Button>
            ) : (
              <Button variant="outline" onClick={() => restore.mutate(project.id)}>
                <ArchiveRestore />
                Restore
              </Button>
            ))}
        </div>
      </div>

      <div className="border-b">
        <nav className="-mb-px flex gap-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && <OverviewTab project={project} />}
      {tab === 'board' && <PlaceholderTab label="Board" />}
      {tab === 'sprints' && <PlaceholderTab label="Sprints" />}
      {tab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed projectId={project.id} />
          </CardContent>
        </Card>
      )}

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
    </div>
  );
}
