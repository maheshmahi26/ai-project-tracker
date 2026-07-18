import {
  QdrantClient,
  type QdrantPoint,
  type QdrantSearchHit,
  type QdrantSearchParams,
} from '../infra/qdrant/qdrant.client';

/**
 * In-memory Qdrant stand-in for tests. Stores points in a Map and honours the
 * org/project/document payload filters so tenant-isolation assertions are real.
 * `search` returns points ordered by insertion (deterministic; vector math is
 * irrelevant for the ingestion tests).
 */
export class FakeQdrantClient extends QdrantClient {
  readonly points = new Map<string, QdrantPoint>();
  ensureCalls = 0;

  async ensureCollection(): Promise<void> {
    this.ensureCalls++;
  }

  async upsert(points: QdrantPoint[]): Promise<void> {
    for (const p of points) this.points.set(p.id, p);
  }

  async deleteByDocument(orgId: string, documentId: string): Promise<void> {
    for (const [id, p] of this.points) {
      if (p.payload.orgId === orgId && p.payload.documentId === documentId) {
        this.points.delete(id);
      }
    }
  }

  async search(params: QdrantSearchParams): Promise<QdrantSearchHit[]> {
    const hits: QdrantSearchHit[] = [];
    for (const p of this.points.values()) {
      if (p.payload.orgId !== params.orgId) continue;
      if (params.projectId && p.payload.projectId !== params.projectId) continue;
      if (params.documentId && p.payload.documentId !== params.documentId) continue;
      hits.push({ id: p.id, score: 1, payload: p.payload });
    }
    return hits.slice(0, params.limit);
  }

  /** Test helper: count points for a given document. */
  countForDocument(orgId: string, documentId: string): number {
    let n = 0;
    for (const p of this.points.values()) {
      if (p.payload.orgId === orgId && p.payload.documentId === documentId) n++;
    }
    return n;
  }

  reset(): void {
    this.points.clear();
    this.ensureCalls = 0;
  }
}
