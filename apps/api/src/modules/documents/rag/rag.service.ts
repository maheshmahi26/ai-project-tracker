import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  GENERATIVE_SYSTEM_PROMPT,
  RAG_ANSWER_SYSTEM_PROMPT,
  groundedAnswerModelSchema,
  proposedTaskSchema,
  ragPrompts,
  type DocumentTaskPlan,
  type GroundedAnswer,
  type KnowledgeChunk,
  type KnowledgeSearchResult,
} from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import { GeminiClient } from '../../../infra/ai/gemini.client';
import { QdrantClient } from '../../../infra/qdrant/qdrant.client';
import { DocumentsRepository } from '../documents.repository';
import { EmbeddingsRepository } from '../embeddings.repository';

export interface SearchParams {
  query: string;
  projectId?: string | null;
  limit: number;
  signal?: AbortSignal;
}

export interface AnswerParams {
  question: string;
  projectId?: string | null;
  limit: number;
  signal?: AbortSignal;
}

const SNIPPET_MAX = 320;
const CONTEXT_CHAR_BUDGET = 8000;
const DOC_CONTEXT_CHAR_BUDGET = 12000;
const DOC_CHUNK_LIMIT = 40;

/**
 * Retrieval-Augmented Generation. Retrieval is deterministic (embed → Qdrant
 * filtered search → Mongo chunk join → citations); generation (grounded answers,
 * tasks-from-a-doc) layers Gemini on top of that grounded context. Every path is
 * org-scoped by the Qdrant payload filter, so tenants never see each other's docs.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly gemini: GeminiClient,
    private readonly qdrant: QdrantClient,
    private readonly embeddings: EmbeddingsRepository,
    private readonly documents: DocumentsRepository,
  ) {}

  /** Embed the query, run a filtered Qdrant search, and hydrate chunks + citations from Mongo. */
  async search(orgId: string, params: SearchParams): Promise<KnowledgeSearchResult> {
    const query = params.query.trim();
    const [vector] = await this.gemini.embed([query]);
    if (!vector) return { query, chunks: [] };

    const hits = await this.qdrant.search({
      vector,
      orgId,
      projectId: params.projectId ?? null,
      limit: params.limit,
    });
    if (hits.length === 0) return { query, chunks: [] };

    const rows = await this.embeddings.findByPointIds(
      orgId,
      hits.map((h) => h.id),
    );
    const byPoint = new Map(rows.map((r) => [r.qdrantPointId, r]));
    const titles = await this.titlesFor(
      orgId,
      rows.map((r) => r.documentId.toString()),
    );

    // Preserve Qdrant's score order; drop hits whose Mongo chunk was deleted.
    const chunks: KnowledgeChunk[] = [];
    for (const hit of hits) {
      const row = byPoint.get(hit.id);
      if (!row) continue;
      const documentId = row.documentId.toString();
      chunks.push({
        documentId,
        documentTitle: titles.get(documentId) ?? 'Untitled document',
        chunkIndex: row.chunkIndex,
        snippet: snippet(row.text),
        score: hit.score,
      });
    }
    return { query, chunks };
  }

  /** Grounded answer: retrieve context, ask Gemini (JSON mode), attach deterministic citations. */
  async answer(orgId: string, params: AnswerParams): Promise<GroundedAnswer> {
    const retrieved = await this.search(orgId, {
      query: params.question,
      projectId: params.projectId,
      limit: params.limit,
      signal: params.signal,
    });
    if (retrieved.chunks.length === 0) {
      return {
        answer: "I couldn't find anything about that in the uploaded documents.",
        citations: [],
      };
    }

    const context = assembleContext(retrieved.chunks);
    const res = await this.gemini.generateJson({
      systemInstruction: RAG_ANSWER_SYSTEM_PROMPT,
      prompt: ragPrompts.answerFromContext({ question: params.question, context }),
      signal: params.signal,
    });
    const parsed = groundedAnswerModelSchema.safeParse(res.json);
    const answer = parsed.success
      ? parsed.data.answer
      : readString(res.json, 'answer') ?? res.raw;
    return { answer, citations: retrieved.chunks };
  }

  /** Propose structured tasks grounded in one document's own indexed chunks. */
  async generateTasks(
    orgId: string,
    documentId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<DocumentTaskPlan> {
    const doc = await this.documents.findById(orgId, documentId);
    if (!doc) throw AppException.notFound('Document not found');
    if (doc.status !== 'indexed') {
      throw AppException.businessRule('Document is still indexing — try again once it is indexed.');
    }

    const rows = await this.embeddings.listByDocument(orgId, documentId, DOC_CHUNK_LIMIT);
    if (rows.length === 0) throw AppException.businessRule('Document has no indexed content.');

    const context = rows
      .map((r) => r.text)
      .join('\n\n')
      .slice(0, DOC_CONTEXT_CHAR_BUDGET);

    const res = await this.gemini.generateJson({
      systemInstruction: GENERATIVE_SYSTEM_PROMPT,
      prompt: ragPrompts.tasksFromContext({ count, context }),
      signal,
    });
    // Gemini may return either a bare array of tasks or an object that wraps them
    // (`{ tasks: [...] }`, sometimes `{ items }`/`{ data }`). Accept all shapes.
    const candidate = Array.isArray(res.json)
      ? res.json
      : ((res.json as Record<string, unknown> | null)?.tasks ??
        (res.json as Record<string, unknown> | null)?.items ??
        (res.json as Record<string, unknown> | null)?.data);
    const tasksArray = Array.isArray(candidate) ? candidate.slice(0, count) : candidate;
    const parsed = z.array(proposedTaskSchema).min(1).safeParse(tasksArray);
    if (!parsed.success) {
      throw AppException.businessRule(
        'The model returned tasks that did not match the expected schema.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), issue: i.message })),
      );
    }
    return { documentId, documentTitle: doc.title, tasks: parsed.data };
  }

  private async titlesFor(orgId: string, documentIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(documentIds)];
    const entries = await Promise.all(
      unique.map(async (id) => {
        const doc = await this.documents.findById(orgId, id);
        return [id, doc?.title ?? 'Untitled document'] as const;
      }),
    );
    return new Map(entries);
  }
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX)}…` : clean;
}

/** Number chunks with a citation marker the model can reference, capped to a char budget. */
function assembleContext(chunks: KnowledgeChunk[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const c of chunks) {
    const block = `[${c.documentTitle} #${c.chunkIndex}]\n${c.snippet}`;
    if (used + block.length > CONTEXT_CHAR_BUDGET) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === 'object' && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
