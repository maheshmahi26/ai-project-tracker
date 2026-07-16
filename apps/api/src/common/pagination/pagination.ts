/**
 * Pagination helpers. Cursor-based is the default for feeds/lists (stable, scales);
 * offset-based is available for tables that need page numbers.
 * See specs/04-api-design.md ("Pagination, filtering, sorting").
 */

export interface PageMeta {
  nextCursor?: string | null;
  hasMore: boolean;
  total?: number;
}

/**
 * A paginated result returned by services/controllers. The TransformInterceptor
 * detects this shape and renders it as `{ data: items, meta: { page } }`.
 */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly page: PageMeta,
  ) {}

  static isPaginated(value: unknown): value is PaginatedResult<unknown> {
    return (
      value instanceof PaginatedResult ||
      (typeof value === 'object' &&
        value !== null &&
        Array.isArray((value as { items?: unknown }).items) &&
        typeof (value as { page?: unknown }).page === 'object')
    );
  }
}

/** Encode an opaque cursor from an arbitrary key (e.g. an ObjectId + sort value). */
export function encodeCursor(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

/** Decode an opaque cursor back to its key. Returns null if malformed. */
export function decodeCursor(cursor?: string): string | null {
  if (!cursor) return null;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Given `limit + 1` rows fetched from the store, split into the page window and
 * compute the next cursor. `keyOf` maps the last item to its cursor key.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  keyOf: (item: T) => string,
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return new PaginatedResult<T>(items, {
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(keyOf(last)) : null,
  });
}
