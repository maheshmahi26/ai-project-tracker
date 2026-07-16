import type { ProjectStatus } from '@ai-projectos/shared';
import { Badge } from '@/components/ui/badge';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }): React.JSX.Element {
  return (
    <Badge variant={status === 'active' ? 'secondary' : 'outline'}>
      {status === 'active' ? 'Active' : 'Archived'}
    </Badge>
  );
}
