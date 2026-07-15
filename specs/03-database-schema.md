# 03 — Database Schema (MongoDB)

15 collections. Multi-tenant: almost everything carries an `orgId` and is scoped by it. All collections include `createdAt`, `updatedAt`, and soft-delete fields (`deletedAt`, `isDeleted`) unless noted.

## Conventions

- `_id`: MongoDB ObjectId.
- **Soft delete:** `isDeleted: boolean`, `deletedAt: Date | null`. A partial index or query middleware hides deleted docs by default; "undo delete" flips them back within a retention window.
- **Tenancy:** `orgId` on tenant data; every query is org-scoped by a base filter.
- **Auditing:** writes emit events → `AuditLogs` + `ActivityLogs`.
- **Timestamps:** Mongoose `{ timestamps: true }`.

## Entity relationships

```
User ──< Membership >── Organization
                              │
                              ├──< Project ──< Sprint ──< Task ──< Subtask(Task.parentId)
                              │                   │         │
                              │                   │         ├──< Comment
                              │                   │         ├──< File
                              │                   │         └──  Label[] · Priority
                              │
                              ├──< Document ──< Embedding (chunks)
                              ├──< Notification
                              ├──< AuditLog · ActivityLog
                              └──< ChatSession ──< ChatMessage ──< AIExecution
```

---

## 1. Users
```
{
  _id, email (unique, lowercased), name, avatarUrl,
  passwordHash?,                     // null for pure OAuth users
  provider: 'local' | 'google',
  googleId?,
  emailVerifiedAt?, 
  refreshTokenHash?,                 // hashed, rotated
  defaultOrgId?,
  status: 'active' | 'invited' | 'disabled',
  createdAt, updatedAt
}
```
Indexes: `{ email: 1 } unique`, `{ googleId: 1 } sparse`.

## 2. Organizations
```
{
  _id, name, slug (unique), logoUrl,
  ownerId (User),
  plan: 'free' | 'pro',             // billing-ready, not billed in v1
  settings: { timezone, features:{...} },
  createdAt, updatedAt, isDeleted, deletedAt
}
```
Membership is embedded as its own collection for scale:

### 2b. Memberships
```
{ _id, orgId, userId, role: 'admin'|'manager'|'developer'|'viewer',
  invitedBy?, joinedAt, status: 'active'|'invited' }
```
Indexes: `{ orgId:1, userId:1 } unique`, `{ userId:1 }`.

## 3. Projects
```
{
  _id, orgId, key (e.g. "AUTH", unique per org), name, description,
  leadId (User), status: 'active'|'archived',
  color, startDate?, targetDate?,
  counters: { taskSeq },            // for human task keys AUTH-123
  createdAt, updatedAt, isDeleted, deletedAt
}
```
Indexes: `{ orgId:1, key:1 } unique`, `{ orgId:1, status:1 }`.

## 4. Sprints
```
{
  _id, orgId, projectId, name, goal,
  status: 'planned'|'active'|'completed',
  startDate, endDate,
  capacityPoints?, committedPoints?, completedPoints?,
  createdAt, updatedAt, isDeleted, deletedAt
}
```
Indexes: `{ orgId:1, projectId:1, status:1 }`.

## 5. Tasks
```
{
  _id, orgId, projectId, sprintId?,
  key: "AUTH-123",                  // human-readable, from project counter
  parentId?,                        // subtask → parent task
  title, description (rich text/JSON),
  status: 'backlog'|'todo'|'in_progress'|'in_review'|'done',
  priority: 'low'|'medium'|'high'|'urgent',
  assigneeId?, reporterId,
  labelIds: [Label], storyPoints?, dueDate?,
  order (float, for board ordering),
  attachmentsCount, commentsCount,
  createdAt, updatedAt, isDeleted, deletedAt
}
```
Indexes:
- `{ orgId:1, projectId:1, status:1, order:1 }` (board)
- `{ orgId:1, sprintId:1 }`, `{ orgId:1, assigneeId:1, status:1 }`
- `{ orgId:1, key:1 } unique`, `{ parentId:1 }`
- MongoDB **text index** on `title`, `description` for full-text search (see [API/Search](./04-api-design.md)).

## 6. Comments
```
{ _id, orgId, taskId, authorId, body (rich JSON),
  mentions: [User], editedAt?, createdAt, updatedAt, isDeleted, deletedAt }
```
Indexes: `{ orgId:1, taskId:1, createdAt:1 }`.

## 7. Labels
```
{ _id, orgId, projectId?, name, color }
```
Indexes: `{ orgId:1, name:1 }`.

## 8. Files
```
{
  _id, orgId, uploaderId,
  scope: { type: 'task'|'project'|'comment', id },
  fileName, mimeType, sizeBytes,
  storageKey,                       // R2/S3 object key
  url?,                             // signed on demand
  createdAt, updatedAt, isDeleted, deletedAt
}
```
Indexes: `{ orgId:1, 'scope.type':1, 'scope.id':1 }`.

## 9. Notifications
```
{ _id, orgId, userId, type, title, body, entity:{type,id},
  readAt?, createdAt }
```
Indexes: `{ userId:1, readAt:1, createdAt:-1 }`.

## 10. AuditLogs  (compliance: who changed what)
```
{ _id, orgId, actorId, actorType: 'user'|'ai',
  action: 'task.create'|'project.archive'|...,
  entity:{type,id}, before?, after?,   // diff snapshot
  source: 'ui'|'ai', requestId, aiExecutionId?,
  ip?, userAgent?, createdAt }
```
Indexes: `{ orgId:1, createdAt:-1 }`, `{ 'entity.type':1,'entity.id':1 }`.

## 11. ActivityLogs  (human-friendly timeline)
```
{ _id, orgId, actorId, verb, object:{type,id,label},
  projectId?, createdAt }
```
Indexes: `{ orgId:1, projectId:1, createdAt:-1 }`.

> **Audit vs Activity:** AuditLogs are immutable, detailed, compliance-grade (with diffs). ActivityLogs are denormalized, presentation-friendly feed items. Both are written from the same domain events.

## 12. ChatSessions
```
{ _id, orgId, userId, title, projectId?,
  lastMessageAt, messageCount, createdAt, updatedAt, isDeleted }
```
Indexes: `{ orgId:1, userId:1, lastMessageAt:-1 }`.

## 13. ChatMessages
```
{
  _id, orgId, sessionId, userId,
  role: 'user'|'assistant'|'tool'|'system',
  content,                          // text / markdown
  toolCalls?: [{ name, args, callId }],
  toolResults?: [{ callId, ok, data?, error? }],
  tokens?: { in, out },
  createdAt
}
```
Indexes: `{ orgId:1, sessionId:1, createdAt:1 }`.

## 14. Documents (RAG source files)
```
{
  _id, orgId, uploaderId, projectId?,
  title, sourceType: 'pdf'|'docx'|'md'|'txt',
  storageKey, sizeBytes,
  status: 'uploaded'|'processing'|'indexed'|'failed',
  chunkCount, error?, createdAt, updatedAt, isDeleted
}
```
Indexes: `{ orgId:1, status:1 }`.

## 15. Embeddings (RAG chunk metadata — vectors live in Qdrant)
```
{
  _id, orgId, documentId, projectId?,
  chunkIndex, text,
  qdrantPointId,                    // reference to the vector stored in Qdrant
  metadata: { page?, heading?, tokens },
  createdAt
}
```
> The actual float vector is **not** stored in MongoDB. It lives in a **Qdrant collection** (one per environment) as a point whose `id` = `qdrantPointId` and whose payload carries `{ orgId, projectId, documentId, chunkIndex }` for filtered ANN search. MongoDB keeps the human-readable chunk text + metadata so we can render citations after Qdrant returns matching point ids.

Indexes:
- `{ orgId:1, documentId:1, chunkIndex:1 }`, `{ qdrantPointId:1 }`.
- **Qdrant** (external): vector index (cosine) with payload filters on `orgId`/`projectId` for tenant isolation.

## 16. AIExecutions (observability for every agent run)
```
{
  _id, orgId, userId, sessionId?, messageId?,
  prompt, model: 'gemini-2.5-flash',
  graphState,                        // LangGraph node trace (summarized)
  toolCalls: [{ name, args, ok, ms, error? }],
  status: 'success'|'partial'|'failed',
  latencyMs, tokens:{in,out}, cost?,
  createdAt
}
```
Indexes: `{ orgId:1, createdAt:-1 }`, `{ userId:1, createdAt:-1 }`.

---

## Cross-cutting DB decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Memberships as a collection (not embedded array) | Orgs can have many members; avoids unbounded array growth | Extra lookup; mitigated by index + cache |
| Subtasks via `parentId` on Tasks (not separate collection) | Same shape/behaviour as tasks, one board engine | Recursive depth limited to 1 by rule |
| Embeddings metadata in Mongo, vectors in Qdrant | Qdrant does fast filtered ANN; Mongo keeps text for citations | Must keep the two in sync (delete doc → delete Qdrant points) |
| Soft delete everywhere + retention window | Enables "undo delete" & audit; safer than hard delete | Storage + must filter `isDeleted` everywhere (query middleware) |
| Human task keys via per-project counter | UX ("AUTH-123") | Counter increment needs atomic `$inc` / findOneAndUpdate |
| Self-hosted Mongo + Qdrant (no Atlas) | Fully free & local-first; no cloud lock-in | Run/operate two datastores yourself |

## Transactions

Multi-document invariants (e.g. move task between sprints + update sprint point totals, or create task + bump project counter) use **MongoDB multi-document transactions**, which require a **replica set**. Locally we run MongoDB as a **single-node replica set** in Docker so transactions work in dev exactly as in prod. Single-doc updates stay atomic without transactions.
