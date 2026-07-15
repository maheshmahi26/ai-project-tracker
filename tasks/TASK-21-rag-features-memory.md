# TASK-21 — RAG features + conversation memory

- **Layer:** AI (build last)
- **Depends on:** TASK-19, TASK-20
- **Parallel with:** —
- **Size:** L

## Specs to read first
- [06 RAG & Memory → Part A retrieval + Part B memory](../specs/06-rag-memory.md)
- [05 AI Agent](../specs/05-ai-agent.md)

## Scope — in
- **Retrieval**: `searchKnowledge` tool + `POST /search/semantic` — embed query → Qdrant filtered search → map to Mongo chunks → grounded context **with citations** (docId, page).
- **RAG features**:
  - Q&A over documents (grounded answer + citations rendered in chat).
  - `POST /documents/:id/generate-tasks` (PRD → proposed structured tasks → confirm → `createTask`).
  - Generate sprint from documents (retrieve → propose → confirm).
- **Conversation memory**:
  - short-term (recent turns within token budget) + **rolling summary** of long sessions.
  - **entity-reference resolver**: resolve "the tasks we discussed yesterday" by querying ChatMessages/AIExecutions (user+session, timeframe, referenced entities) → concrete ids.
  - org/user-scoped; ambiguous refs → agent asks a clarifying question.
- Frontend: `features/documents` (drag-drop upload, indexing status, semantic search UI); chat surfaces citations.

## Scope — out
- No new infra; reuse TASK-20 ingestion + TASK-16 agent.

## Deliverables
- Grounded, document-aware, memory-capable agent — the "wow" features.

## Definition of Done
- [ ] Ask a question about an uploaded PRD → grounded answer with citations.
- [ ] "Generate tasks from this doc" → proposed tasks → confirm → tasks created (audited).
- [ ] "Move the tasks we discussed yesterday to Sprint 4" resolves correct tasks and moves them via tools.
- [ ] Cross-tenant/user leakage impossible (tests assert isolation).
- [ ] Tests (retrieval mapping+citations, memory resolver with seeded clock, generation propose→commit) pass.

## History requirement
Create `../history/TASK-21.md`: document retrieval flow, citation format, memory layers + resolver logic, and token-budget assembly. Add CHANGELOG row.
