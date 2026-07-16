import type { ProjectDTO } from '@ai-projectos/shared';
import type { ProjectLean } from './projects.repository';

export function toProjectDTO(project: ProjectLean): ProjectDTO {
  return {
    id: project._id.toString(),
    orgId: project.orgId.toString(),
    key: project.key,
    name: project.name,
    description: project.description ?? null,
    leadId: project.leadId ? project.leadId.toString() : null,
    status: project.status,
    color: project.color,
    startDate: project.startDate ? project.startDate.toISOString() : null,
    targetDate: project.targetDate ? project.targetDate.toISOString() : null,
    counters: { taskSeq: project.counters?.taskSeq ?? 0 },
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Derive a candidate project key from a name:
 *  - multi-word → initials (e.g. "Auth Service" → "AS")
 *  - single word → first up-to-4 letters (e.g. "Authentication" → "AUTH")
 * Always uppercase, starts with a letter, length 2–10. Callers ensure uniqueness.
 */
export function deriveKeyBase(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let base: string;
  if (words.length === 0) {
    base = 'PRJ';
  } else if (words.length === 1) {
    base = words[0]!.slice(0, 4);
  } else {
    base = words.map((w) => w[0]).join('').slice(0, 4);
  }

  base = base.replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]/.test(base)) base = `P${base}`;
  if (base.length < 2) base = `${base}PRJ`.slice(0, 3);
  return base.slice(0, 10);
}
