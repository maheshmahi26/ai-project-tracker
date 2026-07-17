/** A clickable reference to an entity a tool created or touched. */
export interface DeepLink {
  label: string;
  to: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Build a single link from an entity-summary-shaped object (task/project/comment). */
function linkFromEntity(obj: Record<string, unknown>): DeepLink | null {
  const to = str(obj.url);
  if (!to) return null;
  const label = str(obj.key) ?? str(obj.title) ?? str(obj.name) ?? 'Open';
  return { label, to };
}

/**
 * Extracts navigable deep links from an arbitrary tool result. Tool summaries
 * expose a `url` (e.g. `/tasks/:id`) plus a human label (`key`/`title`/`name`),
 * so the chat can render "AUTH-124"-style chips that jump to the record. Handles
 * single summaries, `{ items: [...] }` list results, and raw arrays. Deduped and
 * capped so a large search result doesn't flood the bubble.
 */
export function extractDeepLinks(data: unknown, max = 8): DeepLink[] {
  const out: DeepLink[] = [];
  const seen = new Set<string>();

  const push = (link: DeepLink | null): void => {
    if (!link || seen.has(link.to)) return;
    seen.add(link.to);
    out.push(link);
  };

  const visit = (value: unknown, depth: number): void => {
    if (out.length >= max || depth > 2) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    push(linkFromEntity(value));
    if (Array.isArray(value.items)) visit(value.items, depth + 1);
  };

  visit(data, 0);
  return out.slice(0, max);
}
