# TASK-20 — RAG ingestion pipeline (Qdrant)

- **Status:** ✅ done — API typecheck + lint + nest build green; **171 API tests pass (32 files)**, incl. a new 7-case documents ingestion integration suite + 7-case chunk/parse unit suite. Qdrant + embeddings + storage faked in tests (no container needed in CI); web typecheck green after the shared change.
- **Date:** 2026-07-18
- **Agent / chat:** RAG ingestion chat
- **Branch / PR:** task/TASK-20-rag-ingestion → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-18 (06-rag-memory Part A; 03-database-schema Documents/Embeddings; 01-tech-stack Qdrant).
- **Depends on:** TASK-16 (Gemini client `embed`), TASK-10 (StorageService + presign/confirm pattern), TASK-02/15 (Qdrant infra + migration bootstrap).

## What was implemented

The async **document → vectors** ingestion pipeline that makes user files queryable (retrieval/Q&A land in
TASK-21). Upload is presigned (never proxied), confirm enqueues a BullMQ job, and the worker parses → chunks →
embeds → upserts to Qdrant + stores chunk text in Mongo. Delete keeps the two stores in sync.

### 1. Qdrant client seam — `infra/qdrant/qdrant.client.ts` + `qdrant.module.ts`
- Abstract `QdrantClient` port: `ensureCollection()`, `upsert(points)`, `deleteByDocument(orgId, documentId)`,
  `search(params)`. `HttpQdrantClient` talks to Qdrant's REST API over `fetch` (no SDK dep — mirrors the
  migration runner). Collection name + vector dim + `Cosine` distance come from config so they always match the
  Gemini embedding output. Creates the collection on first use and adds keyword payload indexes
  (`orgId`/`projectId`/`documentId`) for fast filtered search. `QdrantModule` is `@Global`.
- Tests bind `FakeQdrantClient` (in-memory Map honouring the payload filters) so isolation assertions are real.

### 2. Documents module — `modules/documents/*`
- Mongo schemas: **`documents`** (`status: uploaded→processing→indexed|failed`, `chunkCount`, `error`,
  soft-delete) and **`embeddings`** (chunk `text` + `qdrantPointId` + `metadata.tokens`; vectors live only in
  Qdrant). Repos expose `updateStatus`, `deleteByDocument`, cursor `list`, etc.
- `DocumentsService`: `presign` (validate project → presigned PUT), `confirm` (persist `Document{uploaded}` +
  enqueue `index-document` job, `attempts:3` exponential backoff), `list` (cursor page), `get` (status poll),
  and `remove` (**delete-sync**: Qdrant points → Mongo chunks → soft-delete doc → best-effort object delete).
- `DocumentsController` (`/documents`): `presign`/`confirm` (`document:create`), `get`/`list` (`read`),
  `delete` (`document:delete`), all behind `TenantGuard`+`PermissionsGuard`.

### 3. Ingestion — `modules/documents/indexing/*`
- `parse.ts` — `pdf-parse` (PDF), `mammoth` (DOCX raw text), light markdown-strip (MD), utf-8 (TXT);
  normalizes whitespace.
- `chunk.ts` — recursive character splitter (separators `\n\n → \n → ". " → " " → ""`), packs pieces up to
  `RAG_CHUNK_TOKENS` (~4 chars/token approximation) with `RAG_CHUNK_OVERLAP_TOKENS` carried across boundaries
  (the spec's ~15% overlap). Pure + unit-tested.
- `document-indexer.service.ts` — the pipeline heart, run by the processor and directly by tests:
  `processing` → fetch object → parse → chunk → **embed in batches of `RAG_EMBED_BATCH`** → `ensureCollection`
  → per batch `upsert(Qdrant)` + `insertMany(Mongo)` → `indexed` + `chunkCount`. **Idempotent** — clears any
  prior Qdrant points + Mongo chunks for the doc first, so retries never duplicate. On error: mark `failed` +
  error and **rethrow** so BullMQ retries with backoff; empty/no-text fails **terminally** (no throw, no retry).
- `document.processor.ts` — `@Processor('index-document')` `WorkerHost` delegating to the indexer.

### 4. Wiring
- `StorageService` gained **`getObject(key): Buffer`** (S3 `GetObjectCommand` → byte array); the fake scripts
  bytes per key.
- `AppModule` imports `QdrantModule` + `DocumentsModule`. **`WorkerModule`** registers the `index-document`
  queue + `DocumentProcessor`/`DocumentIndexer` + storage/qdrant/gemini/repos so ingestion runs off the API
  request path.
- Migration runner now bootstraps the collection from `QDRANT_COLLECTION` + `GEMINI_EMBED_DIM` (was hardcoded).
- New config: `QDRANT_COLLECTION`, `RAG_CHUNK_TOKENS` (700), `RAG_CHUNK_OVERLAP_TOKENS` (100), `RAG_EMBED_BATCH`
  (32); new permissions `document:create` / `document:delete` (admin/manager/developer; viewer read-only).

## Key parameters (for the interview / next agent)
- **Qdrant collection:** name `QDRANT_COLLECTION` (default `ai_projectos_chunks`), vector size =
  `GEMINI_EMBED_DIM` (768), distance **Cosine**, payload `{orgId, projectId, documentId, chunkIndex}` with
  keyword indexes on the first three.
- **Chunking:** ~700 tokens, ~100 token (≈15%) overlap, recursive char splitter, tokens ≈ chars/4.
- **Job:** queue `index-document`, `attempts:3`, exponential backoff `delay:5000`, `removeOnComplete`.
- **Delete-sync rule:** `remove()` and every (re)index first delete the doc's Qdrant points **and** Mongo
  `embeddings`, guaranteeing the two stores never diverge.

## Testing & mocking strategy
- **Unit** (`indexing/chunk.spec.ts` 5, `indexing/parse.spec.ts` 2): empty→none, short→1 chunk, long→many within
  budget, overlap carried across boundaries, `approxTokens`; txt passthrough + markdown-strip.
- **Integration** (`documents.integration.spec.ts` 7, real Mongo RS, faked Qdrant/embeddings/storage): index →
  `indexed` with chunks in **both** Mongo + Qdrant; **idempotent** re-index (no duplicates); fetch/parse error →
  `failed` + rethrow; empty doc → `failed` terminally; **delete removes Qdrant points + Mongo chunks + object**;
  **org payload-filter isolation** (owner search hits, other org gets none); list newest-first.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo qdrant minio
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api typecheck   # green
pnpm --filter @ai-projectos/api lint         # green
pnpm --filter @ai-projectos/api exec vitest run --no-file-parallelism   # 171 tests, 32 files
pnpm --filter @ai-projectos/api build        # nest build green
# End-to-end: run the API + `pnpm --filter @ai-projectos/api worker:dev`, POST /documents/presign → PUT bytes →
# POST /documents → poll GET /documents/:id until status=indexed.
```

## Definition of Done checklist
- [x] Upload a PDF/DOCX/MD/TXT → job runs → `Document.status='indexed'`, chunkCount>0, Qdrant points present.
- [x] Failure sets `failed` + error; job retries with backoff (indexer rethrows; producer sets `attempts:3`).
- [x] Delete removes Qdrant points + Mongo chunks (+ object).
- [x] Payload filters enforce org/project isolation (verified via `search` with a foreign orgId → 0 hits).
- [x] Tests (parse→chunk→mock-embed→store; delete-sync; isolation) pass; Qdrant faked in unit/integration.

## Known gaps / follow-ups
- **Retrieval / Q&A / PRD→tasks + `searchKnowledge` tool** → TASK-21 (the `QdrantClient.search` + `Embeddings`
  join back to citations are already in place for it to use).
- **Document UI** (upload + status list) is minimal/none here — rich UI + citations in TASK-21.
- **pdf-parse** pulls a legacy pdf.js; fine for server parsing but consider `unpdf` if bundle/maintenance
  matters. Page/heading metadata is stored as `tokens` only for now (page numbers need per-page parsing).
- **Live Qdrant/Gemini** not exercised in CI (faked); a nightly smoke against a Qdrant container would add
  confidence, like the RS-backed Mongo tests.

## Notes for the next agent (TASK-21)
- Retrieval: embed the query via `GeminiClient.embed([q])`, call `QdrantClient.search({vector, orgId, projectId,
  limit})`, then `EmbeddingsRepository.findByPointIds(orgId, hitIds)` to get chunk `text` for grounded context +
  citations (`documentId`, `chunkIndex`). Everything is org-scoped by payload filter already.
- A `searchKnowledge` AI tool should live in `modules/ai/tools/*` and register via the `AI_TOOLS` factory
  (`ai.module.ts` **and** `test/integration-module.ts`), reusing this module's repos.
