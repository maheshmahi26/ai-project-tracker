import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/config.module';

/** A single vector to upsert. `id` doubles as the Mongo `Embeddings.qdrantPointId`. */
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: QdrantPayload;
}

/** Tenant-isolation payload stored alongside each vector for filtered search. */
export interface QdrantPayload {
  orgId: string;
  projectId?: string | null;
  documentId: string;
  chunkIndex: number;
}

export interface QdrantSearchHit {
  id: string;
  score: number;
  payload: QdrantPayload;
}

export interface QdrantSearchParams {
  vector: number[];
  orgId: string;
  projectId?: string | null;
  documentId?: string | null;
  limit: number;
}

/**
 * Vector-store port (hexagonal boundary). The app depends only on this contract;
 * the concrete adapter talks to Qdrant over HTTP. Tests bind an in-memory fake so
 * CI needs no Qdrant container. Retrieval (`search`) is used by TASK-21; ingestion
 * (`ensureCollection`/`upsert`/`deleteByDocument`) by TASK-20.
 */
export abstract class QdrantClient {
  abstract ensureCollection(): Promise<void>;
  abstract upsert(points: QdrantPoint[]): Promise<void>;
  /** Removes every vector belonging to a document (delete-sync with Mongo). */
  abstract deleteByDocument(orgId: string, documentId: string): Promise<void>;
  abstract search(params: QdrantSearchParams): Promise<QdrantSearchHit[]>;
}

/**
 * HTTP adapter for Qdrant (no SDK dependency — the REST API is small and stable).
 * Collection name + vector dim + distance come from config so they always match
 * the Gemini embedding output and the migration bootstrap.
 */
@Injectable()
export class HttpQdrantClient extends QdrantClient {
  private readonly logger = new Logger(HttpQdrantClient.name);
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly collection: string;
  private readonly dim: number;
  private readonly distance = 'Cosine';

  constructor(config: AppConfigService) {
    super();
    this.baseUrl = config.get('QDRANT_URL').replace(/\/$/, '');
    this.apiKey = config.get('QDRANT_API_KEY');
    this.collection = config.get('QDRANT_COLLECTION');
    this.dim = config.get('GEMINI_EMBED_DIM');
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  private async req(path: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Qdrant ${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
    }
    return res.status === 204 ? undefined : res.json();
  }

  async ensureCollection(): Promise<void> {
    const url = `${this.baseUrl}/collections/${this.collection}`;
    const existing = await fetch(url, { headers: this.headers() });
    if (existing.ok) return;
    await this.req(`/collections/${this.collection}`, {
      method: 'PUT',
      body: JSON.stringify({ vectors: { size: this.dim, distance: this.distance } }),
    });
    // Payload indexes make org/project filters fast at scale.
    for (const field of ['orgId', 'projectId', 'documentId']) {
      await this.req(`/collections/${this.collection}/index`, {
        method: 'PUT',
        body: JSON.stringify({ field_name: field, field_schema: 'keyword' }),
      }).catch(() => undefined);
    }
    this.logger.log(`Created Qdrant collection '${this.collection}' (dim=${this.dim}).`);
  }

  async upsert(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.req(`/collections/${this.collection}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({
        points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
      }),
    });
  }

  async deleteByDocument(orgId: string, documentId: string): Promise<void> {
    await this.req(`/collections/${this.collection}/points/delete?wait=true`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'orgId', match: { value: orgId } },
            { key: 'documentId', match: { value: documentId } },
          ],
        },
      }),
    });
  }

  async search(params: QdrantSearchParams): Promise<QdrantSearchHit[]> {
    const must: unknown[] = [{ key: 'orgId', match: { value: params.orgId } }];
    if (params.projectId) must.push({ key: 'projectId', match: { value: params.projectId } });
    if (params.documentId) must.push({ key: 'documentId', match: { value: params.documentId } });

    const body = (await this.req(`/collections/${this.collection}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: params.vector,
        limit: params.limit,
        with_payload: true,
        filter: { must },
      }),
    })) as { result?: Array<{ id: string; score: number; payload: QdrantPayload }> };

    return (body.result ?? []).map((r) => ({ id: r.id, score: r.score, payload: r.payload }));
  }
}
