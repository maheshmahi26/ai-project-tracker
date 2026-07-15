# 04 — API Design

## Principles

- **REST + JSON**, resource-oriented, plural nouns.
- **Versioned** under `/api/v1` (URI versioning — simplest for clients & Swagger).
- **Consistent envelopes** for success and error (one shape everywhere).
- **Zod schemas** define request/response contracts and are shared with the frontend and AI tools via `packages/shared`.
- **OpenAPI/Swagger** auto-generated at `/api/docs`.
- **Idempotency** for unsafe retries via optional `Idempotency-Key` header on create endpoints.

## Response envelopes

Success:
```json
{ "data": { }, "meta": { "requestId": "..." } }
```
Paginated:
```json
{ "data": [ ], "meta": { "requestId":"...", "page": { "nextCursor":"...", "hasMore": true, "total": 128 } } }
```
Error (from `AllExceptionsFilter`):
```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task AUTH-123 was not found",
    "details": [ { "path": "id", "issue": "not_found" } ],
    "requestId": "01J..."
  }
}
```

## Standard error codes

| HTTP | code family | Example |
|------|-------------|---------|
| 400 | `VALIDATION_ERROR` | Zod validation failure with `details[]` |
| 401 | `UNAUTHENTICATED` | missing/expired access token |
| 403 | `FORBIDDEN` / `PERMISSION_DENIED` | RBAC failure |
| 404 | `*_NOT_FOUND` | resource missing or soft-deleted |
| 409 | `CONFLICT` | duplicate key / optimistic version clash |
| 422 | `BUSINESS_RULE` | domain invariant violated |
| 429 | `RATE_LIMITED` | rate limiter tripped (`Retry-After` header) |
| 500 | `INTERNAL` | unexpected (traced in Sentry via `requestId`) |

## Pagination, filtering, sorting

- **Cursor pagination** (default) for feeds/lists: `?limit=25&cursor=<opaque>`. Stable, scales better than offset.
- **Offset pagination** available for tables that need page numbers: `?page=2&pageSize=25`.
- **Filtering:** typed query params, e.g. `?status=todo,in_progress&priority=high&assigneeId=...&sprintId=...`.
- **Sorting:** `?sort=-priority,dueDate` (`-` = desc). Whitelisted fields only.
- **Search:** `?q=` triggers Atlas Search (full-text) on the resource.

## Auth headers

- `Authorization: Bearer <accessToken>`
- Refresh via `POST /auth/refresh` with rotating refresh token (httpOnly cookie or body — see [Security](./07-security-rbac.md)).

## Endpoint catalogue (v1)

### Auth
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/google            → OAuth redirect
GET    /auth/google/callback
GET    /auth/me
```

### Organizations & members
```
POST   /orgs
GET    /orgs                    # orgs I belong to
GET    /orgs/:id
PATCH  /orgs/:id
DELETE /orgs/:id                # soft delete (admin)
GET    /orgs/:id/members
POST   /orgs/:id/members        # invite
PATCH  /orgs/:id/members/:userId   # change role
DELETE /orgs/:id/members/:userId
```

### Projects
```
POST   /projects
GET    /projects                # list (filter/sort/paginate/search)
GET    /projects/:id
PATCH  /projects/:id
POST   /projects/:id/archive
POST   /projects/:id/restore
DELETE /projects/:id            # soft delete
POST   /projects/:id/undo-delete
```

### Sprints
```
POST   /projects/:projectId/sprints
GET    /projects/:projectId/sprints
GET    /sprints/:id
PATCH  /sprints/:id
POST   /sprints/:id/start
POST   /sprints/:id/complete
DELETE /sprints/:id
```

### Tasks
```
POST   /tasks
GET    /tasks                   # filter/sort/paginate/search
GET    /tasks/:id
PATCH  /tasks/:id
DELETE /tasks/:id
POST   /tasks/:id/undo-delete
POST   /tasks/bulk-update       # { ids[], patch }
POST   /tasks/bulk-delete       # { ids[] }
POST   /tasks/:id/assign        # { assigneeId }
POST   /tasks/:id/move          # { sprintId?, status?, order? }
GET    /tasks/:id/subtasks
POST   /tasks/:id/subtasks
```

### Comments / Labels / Files
```
GET/POST/PATCH/DELETE  /tasks/:taskId/comments[/:id]
GET/POST/PATCH/DELETE  /labels[/:id]
POST   /files/presign           # get signed upload URL (R2/S3)
POST   /files                   # confirm upload metadata
GET    /files/:id/download      # signed download URL
DELETE /files/:id
```

### Notifications
```
GET    /notifications
POST   /notifications/:id/read
POST   /notifications/read-all
```

### Activity & Audit
```
GET    /activity                # timeline (filter by project/entity)
GET    /audit-logs              # admin/manager only
```

### Dashboard & Reports
```
GET    /dashboard/overview      # counts, cached
GET    /dashboard/velocity      # per sprint
GET    /dashboard/burndown?sprintId=
GET    /dashboard/tasks-per-user
GET    /dashboard/priority-distribution
GET    /dashboard/project-progress
GET    /reports/weekly?projectId=
```

### Search
```
GET    /search?q=&scope=all|tasks|projects   # Atlas Search
POST   /search/semantic { query, projectId? } # Vector Search (RAG)
```

### AI & Chat
```
POST   /ai/chat/sessions
GET    /ai/chat/sessions
GET    /ai/chat/sessions/:id/messages
POST   /ai/chat/sessions/:id/messages    # SSE stream: tokens + tool events
GET    /ai/tools                         # introspect tool registry (schemas)
GET    /ai/executions/:id                # AIExecution trace
```

### RAG documents
```
POST   /documents/presign
POST   /documents                        # confirm → enqueue indexing job
GET    /documents
GET    /documents/:id                     # status: processing|indexed
DELETE /documents/:id
POST   /documents/:id/generate-tasks      # PRD → tasks (AI)
```

### Ops
```
GET    /health        # liveness
GET    /health/ready   # readiness (mongo, redis reachable)
GET    /metrics        # OTel/prometheus (internal)
```

## Streaming (AI chat)

`POST /ai/chat/sessions/:id/messages` returns **Server-Sent Events**:
```
event: token       data: {"delta":"Creating"}
event: tool_call   data: {"name":"createTask","args":{...},"callId":"c1"}
event: tool_result data: {"callId":"c1","ok":true,"data":{"key":"AUTH-124"}}
event: token       data: {"delta":" the task..."}
event: done        data: {"messageId":"...","executionId":"..."}
```
Rationale: SSE is simpler than WebSockets for one-way streaming and works through most proxies; we can upgrade to WS if we later need bidirectional presence.

## Cross-cutting API behaviors

- **Rate limiting:** Redis token-bucket per user+route (stricter on `/ai/*` and `/auth/*`).
- **Caching:** `CacheInterceptor` on GET dashboard/read endpoints with short TTL + invalidation on writes.
- **Idempotency:** `Idempotency-Key` stored in Redis for create endpoints to dedupe retries.
- **Request tracing:** every request gets a `requestId` (propagated to logs, errors, audit, OTel span).
