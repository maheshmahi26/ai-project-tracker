import { toast } from 'sonner';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { ProjectDTO } from '@ai-projectos/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCan } from '@/hooks/use-can';
import {
  useArchiveProject,
  useDeleteProject,
  useRestoreProject,
  useUndoDeleteProject,
} from '../hooks/use-projects';

interface ProjectRowActionsProps {
  project: ProjectDTO;
  onEdit: (project: ProjectDTO) => void;
}

export function ProjectRowActions({
  project,
  onEdit,
}: ProjectRowActionsProps): React.JSX.Element | null {
  const canUpdate = useCan('project:update');
  const canArchive = useCan('project:archive');
  const canDelete = useCan('project:delete');

  const archive = useArchiveProject();
  const restore = useRestoreProject();
  const remove = useDeleteProject();
  const undo = useUndoDeleteProject();

  if (!canUpdate && !canArchive && !canDelete) return null;

  const handleDelete = (): void => {
    remove.mutate(project.id, {
      onSuccess: () => {
        toast('Project deleted', {
          description: project.name,
          action: {
            label: 'Undo',
            onClick: () => {
              undo.mutate(project.id, {
                onSuccess: () => toast.success('Project restored'),
              });
            },
          },
        });
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Project actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {canUpdate && (
          <DropdownMenuItem onSelect={() => onEdit(project)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
        )}
        {canArchive &&
          (project.status === 'active' ? (
            <DropdownMenuItem onSelect={() => archive.mutate(project.id)}>
              <Archive />
              Archive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => restore.mutate(project.id)}>
              <ArchiveRestore />
              Restore
            </DropdownMenuItem>
          ))}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={handleDelete}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
