# TASK-21 — RAG features + conversation memory

- **Status:** ✅ done — API typecheck + lint + nest build green; **186 API tests pass (34 files)**, incl. a new 6-case RAG service suite + 9-case RAG-tools/memory suite. Qdrant + Gemini + storage faked in CI (no containers). Web typecheck + lint + build green (new `features/documents` page).
- **Date:** 2026-07-18
- **Agent / chat:** RAG features + memory chat
- **Branch / PR:** task/TASK-21-rag-features-memory → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-18 (06-rag-memory Part A retrieval + Part B memory; 05-ai-agent tool catalogue).
- **Depends on:** TASK-20 (ingestion: Qdrant client, Documents/Embeddings repos, storage), TASK-19 (chat frontend), TASK-16/17/18 (agent + tool registry + reference resolver + generative pattern).

## What was implemented

The "wow" layer: the agent can now **answer from the user's own documents with citations**, **turn a PRD into
tasks** (propose → confirm → create), and **act on things "we discussed yesterday"** by resolving fuzzy temporal
references to concrete task ids — all org/user-scoped, all through the same audited services the UI uses.

### 1. Retrieval + grounded generation — `modules/documents/rag/rag.service.ts`
- `search(orgId, {query, projectId, limit})` — embed query (`GeminiClient.embed`) → `QdrantClient.search`
  (payload-filtered on `orgId`/`projectId`) → hydrate `EmbeddingsRepository.findByPointIds` → join document
  titles → **citations** `{documentId, documentTitle, chunkIndex, snippet, score}` in Qdrant score order.
- `answer(orgId, {question, ...})` — retrieve → assemble a char-budgeted, citation-marked context → JSON-mode
  Gemini answer (`RAG_ANSWER_SYSTEM_PROMPT`) → returns `{answer, citations}` where **citations are the
  deterministic retrieved chunks** (not model-invented). Empty retrieval short-circuits to an honest
  "couldn't find it" with **no** LLM call.
- `generateTasks(orgId, documentId, count)` — loads the document's own ordered chunks
  (`EmbeddingsRepository.listByDocument`, new), builds a doc-wide context, JSON-mode generation validated against
  `proposedTaskSchema`, returns `{documentId, documentTitle, tasks}`. Rejects docs not yet `indexed`.

### 2. REST endpoints
- `POST /search/semantic` (`SearchController`, `read`) → grounded chunks + citations.
- `POST /documents/:id/generate-tasks` (added to `DocumentsController`, `read`) → proposed tasks for review.
- Both behind `TenantGuard` + `PermissionsGuard`; `RagService` is exported from `DocumentsModule`.

### 3. RAG AI tools — `modules/ai/tools/rag-tools.ts`
- `searchKnowledge` (read) — semantic search with citations.
- `askDocuments` (read) — grounded Q&A with citations.
- `generateTasksFromDocument` (read) — propose tasks from a doc (resolved by id or title, with disambiguation).
- `applyGeneratedTasks` (`task:create`) — **confirm-gated** commit: first call reports intent, `confirm=true`
  creates each task via `TasksService.createTask` (audited `source:'ai'`), optionally attached to a sprint.

### 4. Conversation memory (specs/06 Part B)
- **Rolling summary:** `ChatSession.summary` field (schema + DTO + mapper). `MemoryService`:
  - `buildHistory(orgId, sessionId, budgetTokens)` — chronological turns packed newest-first within a ~4k-token
    (char-approximated) budget, then reversed. Replaces the old fixed 20-message window in `AgentService`.
  - `maybeSummarize(...)` — once a session exceeds 20 turns, folds all-but-the-last-12 into `session.summary`
    via JSON-mode Gemini (`MEMORY_SUMMARY_SYSTEM_PROMPT`). Best-effort (logged + swallowed; never blocks a turn).
  - The summary is injected into the system prompt (`buildSystemPrompt(principal, summary)`).
- **Entity/temporal resolver:** `MemoryResolver` + injectable `Clock` (deterministic tests):
  - `resolveTimeframe(today|yesterday|this_week|last_week|recent)` → concrete UTC `[from,to)` window.
  - `recallTasks(orgId, sessionId, timeframe)` — scans this session's `ChatMessages` in the window
    (`ChatMessagesRepository.listBetween`, new), extracts referenced **task keys** (`AUTH-12` regex) and
    `/tasks/:id` deep links the agent emitted, and re-resolves them to live task records (dropping deleted /
    out-of-scope ids). Never trusts the model to "remember".
  - `recallTasks` tool (read) exposes this to the agent, which then feeds concrete keys into `addTasksToSprint`.

### 5. Frontend — `features/documents`
- `documents-page.tsx` (route `/documents`, nav "Knowledge"): semantic-search card, drag-drop uploader, and a
  live documents list.
- `DocumentUploader` — drag/drop or click → presign → PUT bytes → confirm (mirrors the files flow); infers MIME
  from extension for `.md`.
- `DocumentList` — status badges (`Queued/Indexing…/Indexed/Failed`), delete (RBAC-gated), and "Generate tasks"
  (opens a proposal dialog). The list **polls every 3s while any doc is still ingesting**.
- `SemanticSearch` — query box → grounded results rendered with citation badges (`documentTitle #chunkIndex`,
  score).

## Retrieval flow & citation format

```
question → embed (Gemini) → Qdrant search {orgId[,projectId]} filter
        → findByPointIds → join doc titles → citations[{documentId, documentTitle, chunkIndex, snippet, score}]
        → assembleContext (char-budgeted, "[Title #idx] snippet") → grounded JSON answer
        → { answer, citations }   (citations are deterministic, not model-generated)
```

## Memory layers & token-budget assembly

1. **Short-term:** recent turns, packed newest-first up to ~4k tokens (`CHARS_PER_TOKEN=4`), then reversed to
   chronological — so the newest context always survives truncation.
2. **Rolling summary:** older turns compacted into `session.summary` past 20 turns (keep last 12 verbatim),
   prepended to the system prompt.
3. **Entity references:** temporal recall resolves keys/ids the agent actually emitted, from `ChatMessages`
   within a concrete time window — deterministic and auditable.

## Guardrails / isolation
- Every retrieval path is Qdrant payload-filtered on `orgId` (+ optional `projectId`); tests assert org B cannot
  read org A documents.
- `recallTasks` is session- **and** org-scoped; tests assert no cross-session leakage.
- Destructive/creating tool (`applyGeneratedTasks`) is confirm-gated and RBAC-enforced (viewer blocked).

## Tests
- `modules/documents/rag/rag.integration.spec.ts` (6): search citations, grounded answer + citations,
  no-match honesty (no LLM call), generate-tasks schema validity, not-indexed rejection, cross-org isolation.
- `modules/ai/tools/rag-memory-tools.integration.spec.ts` (9): `searchKnowledge`/`askDocuments` citations,
  `generateTasksFromDocument`→`applyGeneratedTasks` propose→confirm→audited-create, viewer permission block,
  `recallTasks` resolver + tool (yesterday), session-scope isolation, rolling-summary write + short-session no-op.
- Full suite: **186 API tests (34 files)**; Gemini `generateJson`/`embed` and Qdrant faked in CI.

## Notes for the next agent (TASK-22 — hardening & polish)
- `RagService.answer` currently attaches *all* retrieved chunks as citations; a future pass could filter to the
  chunks the model actually used (the model schema already carries `hasAnswer`).
- `generateTasksFromDocument` resolves a document by id or title; there is no `listDocuments` tool yet — add one
  if the agent needs to browse.
- The documents "Generate tasks" dialog is preview-only (commit happens via the assistant's confirm flow); wiring
  a direct "Create all" button to `applyGeneratedTasks`/`createTask` is a small follow-up.
- `Clock` is injectable — bind a fixed instant in tests if you need stricter temporal assertions than "seed
  createdAt relative to now".
