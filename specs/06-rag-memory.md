# 06 — RAG & Conversation Memory

## Part A — RAG (Retrieval-Augmented Generation)

Users upload requirement docs, PRDs, and meeting notes. The system makes them queryable so the agent can answer questions and generate work items grounded in the user's own documents.

**Supported inputs:** PDF, Word (`.docx`), Markdown, plain text.

### Ingestion pipeline (async via BullMQ)

```
Upload (presigned → R2/S3)
   │  POST /documents  (confirm)
   ▼
Document { status: 'uploaded' }  ──► enqueue "index-document" job
   ▼  (BullMQ worker)
1. Fetch object from storage
2. Parse → raw text        (pdf-parse / mammoth / remark / plain)
3. Chunk                   (recursive splitter, ~500–800 tokens, ~15% overlap)
4. Embed each chunk        (Gemini embeddings, batched, rate-limited)
5. Store Embeddings docs   (text + vector + metadata{page,heading})
6. Document.status = 'indexed', chunkCount = N
   (on error → status:'failed', error message; job retried w/ backoff)
```

Why async: parsing + embedding is slow and rate-limited; doing it in a worker keeps the API responsive and lets us retry on transient Gemini errors. The UI polls `GET /documents/:id` (or gets a notification) for status.

### Storage & retrieval

- Chunks + vectors live in the **Embeddings** collection with an **Atlas Vector Search** index (cosine similarity), filtered by `orgId` (and optionally `projectId`) so tenants never see each other's data.
- **Retrieval** (`searchKnowledge` tool / `POST /search/semantic`):
```
query → embed query → Atlas $vectorSearch (topK, filter orgId/projectId)
      → optional re-rank / dedupe → assemble context (with citations: docId, page)
      → feed to Gemini with a grounded prompt
      → answer + source references shown in chat
```

### RAG-powered features

- **Q&A over docs:** "What are the auth requirements in the PRD?" → grounded answer + citations.
- **Generate tasks from a PRD:** `POST /documents/:id/generate-tasks` → agent retrieves relevant chunks, proposes structured tasks (title/description/priority/acceptance criteria) → user reviews → commit via `createTask`.
- **Generate a sprint from documents:** retrieve → propose sprint (goal + task list + point estimates) → confirm → `generateSprint`/`createSprint`.

### Design decisions & trade-offs

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Atlas Vector Search (not Pinecone/Qdrant) | One datastore for v1, org-filtered | Dedicated vector DB scales/features better later |
| Async embedding via BullMQ | Responsiveness + retry on rate limits | Eventual consistency (indexing delay) |
| Chunk overlap ~15% | Preserve context across boundaries | More vectors → slightly higher storage/cost |
| Citations always returned | Trust + verifiability | Extra metadata plumbing |
| Propose→confirm for generation | Human-in-the-loop safety | One extra click, but prevents junk data |

---

## Part B — Conversation Memory

Goal: the agent understands prior context, e.g. *"Move all tasks we discussed yesterday to Sprint 4."*

### Layers of memory

1. **Short-term (working memory):** the recent messages of the current `ChatSession`, passed into the prompt within a token budget.
2. **Rolling summary:** when a session grows long, a background step summarizes older turns into a compact `session.summary`, so we keep salient facts without blowing the context window.
3. **Entity references:** when the agent acts on entities, we persist references (task keys, project ids, timestamps) alongside messages/executions. "The tasks we discussed yesterday" is resolved by querying `ChatMessages`/`AIExecutions` for that user+session within the referenced timeframe — not by hoping the model remembers.

```
"Move all tasks we discussed yesterday to Sprint 4"
   │
   ▼
memory resolver:
   - find ChatMessages/AIExecutions for user, role in ('assistant','tool'),
     createdAt within yesterday, that referenced task entities
   - collect distinct taskIds
   ▼
agent calls addTasksToSprint({ taskIds:[...], sprintName:"Sprint 4" })
   ▼
each task moved via the SAME service → audited → confirmed in chat
```

### Storage

- `ChatSessions` / `ChatMessages` persist full history (see [DB spec](./03-database-schema.md)).
- `AIExecutions` link messages → tool calls → affected entities, which is what makes temporal/entity recall ("yesterday", "those tasks") reliable and auditable.

### Guardrails

- Memory retrieval is **org- and user-scoped** — no cross-tenant/user leakage.
- Token-budgeted context assembly (recent turns + summary + retrieved entities) to control Gemini cost/limits.
- Ambiguous references → the agent asks a clarifying question rather than guessing (especially before destructive ops).

## Interview questions this prepares you for

- How do you keep RAG multi-tenant safe?
- Chunking strategy trade-offs (size vs. overlap vs. retrieval quality)?
- Why async ingestion, and how do you handle embedding rate limits/retries?
- How is "long-term memory" different from just stuffing history into the prompt?
- How do you resolve fuzzy references like "the tasks from yesterday" deterministically?
