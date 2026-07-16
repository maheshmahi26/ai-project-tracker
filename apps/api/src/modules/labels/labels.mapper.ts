import type { LabelDTO } from '@ai-projectos/shared';
import type { LabelLean } from './labels.repository';

export function toLabelDTO(label: LabelLean): LabelDTO {
  return {
    id: label._id.toString(),
    orgId: label.orgId.toString(),
    projectId: label.projectId ? label.projectId.toString() : null,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}
