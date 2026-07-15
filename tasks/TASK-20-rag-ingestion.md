# TASK-20 — RAG ingestion pipeline (Qdrant)

- **Layer:** AI (build last)
- **Depends on:** TASK-16
- **Parallel with:** TASK-17/18/19 (backend-independent)
- **Size:** L

## Specs to read first
- [06 RAG & Memory → Part A](../specs/06-rag-memory.md)
- [03 Database Schema → Documents, Embeddings](../specs/03-database-schema.md)
- [01 Tech Stack → Qdrant](../specs/01-tech-stack.md)

## Scope — in
- **Documents** module: presigned upload (reuse StorageService), confirm → enqueue `index-document` BullMQ job; status tracking (`uploaded→processing→indexed→failed`) + retries/backoff.
- **Qdrant client + collection bootstrap** (name, vector size matching Gemini embeddings, cosine distance); created on boot if missing.
- **Indexing worker**: fetch object → parse (`pdf-parse`/`mammoth`/`remark`/plain for PDF/DOCX/MD/TXT) → **chunk** (recursive splitter ~500–800 tokens, ~15% overlap) → **embed** (Gemini, batched, rate-limited) → **upsert to Qdrant** (payload `{orgId,projectId,documentId,chunkIndex}`) → store Mongo `Embeddings` (text + `qdrantPointId` + metadata).
- Delete document → delete its Qdrant points + Mongo chunks (keep in sync).
- Tenant isolation via Qdrant payload filters.

## Scope — out
- Retrieval/Q&A/PRD→tasks features + memory (TASK-21). Document UI is minimal here (upload + status), rich UI in TASK-21.

## Deliverables
- Reliable async ingestion producing tenant-isolated vectors in Qdrant.

## Definition of Done
- [ ] Upload a PDF/DOCX/MD/TXT → job runs → `Document.status='indexed'`, chunkCount>0, Qdrant points present.
- [ ] Failure sets `failed` + error; job retries with backoff.
- [ ] Delete removes Qdrant points + Mongo chunks.
- [ ] Payload filters enforce org/project isolation.
- [ ] Tests (parse→chunk→mock-embed→store; delete-sync) pass; Qdrant faked in unit, container in integration.

## History requirement
Create `../history/TASK-20.md`: document Qdrant collection config (vector size/distance), chunking params, parser choices, job name/retries, and the sync-on-delete rule. Add CHANGELOG row.
