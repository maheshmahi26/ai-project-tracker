# TASK-10 — Comments, Labels, Files, Notifications (+ background jobs)

- **Status:** ✅ done (typecheck + lint + 97 API tests + build + live MinIO round-trip)
- **Date:** 2026-07-16
- **Agent / chat:** comments/labels/files/notifications backend chat
- **Branch / PR:** task/TASK-10-comments-files-notifications → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-16 (03-database-schema Comments/Labels/Files/Notifications, 04-api-design → Comments/Labels/Files/Notifications, 01-tech-stack → File Storage)

## What was implemented

Four collaboration modules plus the background-job plumbing they need:

- **Comments** on tasks (rich-text JSON body, `@mentions` → notifications, author-only edit/soft-delete, live `commentsCount`).
- **Labels** (org-wide or project-scoped, unique-per-scope, attach/detach via task `labelIds`, delete detaches from all tasks).
- **Files** via a `StorageService` port with an S3-compatible adapter (MinIO in dev, Cloudflare R2/S3 in prod): presign → confirm → signed download, size/MIME allowlist, private buckets, live `attachmentsCount`.
- **Notifications** (durable inbox + list/read/read-all) fanned out on mention and assignment, each enqueuing a transactional email job.

### Shared contracts — `packages/shared/src/index.ts`
- Comments: `commentBodySchema`, `createCommentSchema`, `updateCommentSchema`, `listCommentsQuerySchema`, `CommentDTO`.
- Labels: `createLabelSchema`, `updateLabelSchema`, `listLabelsQuerySchema`, `LabelDTO`.
- Files: `FILE_MAX_BYTES` (25 MB), `ALLOWED_FILE_MIME_TYPES` + `isAllowedMimeType()`, `fileScopeSchema` (`task|project|comment`), `presignFileSchema`, `confirmFileSchema`, `PresignFileResult`, `FileDTO`.
- Notifications: `NOTIFICATION_TYPES` (`mention|assignment|comment|system`), `listNotificationsQuerySchema`, `NotificationDTO`.

### Domain events — `modules/events/domain-event.ts`
- Added `comment.created|updated|deleted`, `label.created|updated|deleted`, `file.uploaded|deleted`. All reuse the TASK-07 bus → Audit (diff) + Activity (feed).

### StorageService contract — `modules/files/storage/`
- `storage.service.ts` (abstract port):
  - `presignUpload({ key, contentType, maxSizeBytes? }): Promise<string>` — short-lived presigned **PUT** URL.
  - `presignDownload({ key, fileName? }): Promise<string>` — short-lived presigned **GET** URL (sets `Content-Disposition`).
  - `deleteObject(key): Promise<void>` — best-effort; never throws into the request path.
  - `urlTtlSec` — URL validity (adapter default **900s / 15 min**).
- `s3-storage.service.ts` (`S3StorageService`): `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Reads `STORAGE_*` env (endpoint, region, bucket, keys, force-path-style). Works with MinIO (path-style, custom endpoint) and R2/S3. Bucket is private; the API never proxies bytes.

### Upload flow (two-step, API never touches bytes)
1. `POST /files/presign { fileName, mimeType, sizeBytes, scope }` → validate MIME/size (Zod) + that the scope target (task/project) exists in the org → build `storageKey` = `orgs/<orgId>/<scopeType>/<scopeId>/<uuid>-<safeName>` → return `{ url, storageKey, expiresInSec }`. **No DB row yet.**
2. Client `PUT`s the bytes directly to `url` (MinIO/R2).
3. `POST /files { storageKey, fileName, mimeType, sizeBytes, scope }` → persist the `File` doc (uploader = actor); if `scope.type==='task'` `$inc attachmentsCount`; emit `file.uploaded`.
4. `GET /files/:id/download` → presigned GET `{ url, expiresInSec }`.
5. `DELETE /files/:id` → soft-delete, `$inc attachmentsCount -1` for task scope, best-effort `deleteObject`, emit `file.deleted`.

### Comments module — `modules/comments/`
- Schema: `orgId, taskId, authorId, body (Mixed JSON), mentions[], editedAt, isDeleted, deletedAt`. Index `{orgId,taskId,createdAt}`.
- Service: `create` (verifies task, resolves+validates mentions against active members, `$inc commentsCount`, fans out mention notifications, emits `comment.created`), `list` (cursor), `update` (author-only, sets `editedAt`), `remove` (author-only soft-delete, `$inc commentsCount -1`).
- Controller: `GET/POST /tasks/:taskId/comments`, `PATCH/DELETE /tasks/:taskId/comments/:id`. RBAC: `read` for list, `task:update` for write; author identity enforced in the service.

### Labels module — `modules/labels/`
- Schema: `orgId, projectId?(null=org-wide), name, color`. Unique index `{orgId,projectId,name}`.
- Service: `create`/`update` (dup → `CONFLICT` on 11000), `list` (project scope returns project labels **+** org-wide), `remove` (hard-delete + `TasksRepository.pullLabel` detaches from every task). Emits `label.*`.
- Controller: `GET /labels`, `POST /labels`, `PATCH/DELETE /labels/:id`. RBAC: `read` for list, `project:update` for writes. **Attach/detach on tasks** is done via the existing `PATCH /tasks/:id { labelIds }`.

### Notifications module — `modules/notifications/`
- Schema: `orgId, userId, type, title, body?, entity?{type,id}, readAt?` (createdAt only). Indexes `{userId,readAt,createdAt}`, `{orgId,userId,createdAt}`.
- `NotificationsService.fanOut({ orgId, recipientIds, type, title, body?, entity?, excludeUserId?, email? })` — dedups recipients, drops the actor, creates one durable notification each, and enqueues one email job per recipient (looks up emails via `UsersRepository`). Also `list` (cursor, `unreadOnly`, `meta.total = unread count`), `markRead`, `markAllRead`.
- `NotificationsListener` (`@OnEvent domain.event`) reacts to **`task.assigned`** → notifies the new assignee (skips self-assignment). Keeps `TasksService` decoupled from notifications.
- Comment **mentions** are fanned out **directly** by `CommentsService` (it already holds the mention list).
- Controller: `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read`. RBAC: `read` (per-user; scoped to the caller).

### Background jobs — `modules/mail/`
- Queue **`email`** (BullMQ, shared Redis). Job types: `password_reset` (TASK-05) and new **`notification`** (`{ to, subject, text }`).
- Producers set retry/backoff: `notification` → `attempts: 5, backoff: exponential 3000ms, removeOnComplete`.
- `MailProcessor` (runs in the **worker** process, `worker.ts`) consumes both types; dev `MAIL_TRANSPORT=console` logs, SMTP is a later task.

### Wiring
- `app.module.ts` imports `MailModule, NotificationsModule, CommentsModule, LabelsModule, FilesModule`.
- `test/integration-module.ts` extended with all four modules/schemas/services, a **fake `StorageService`** (records uploads/downloads/deletes, returns fake URLs) and a `sendNotification` spy on the fake `MailService`.

## Notification types & channels
| type | trigger | recipient | email |
|------|---------|-----------|-------|
| `mention` | comment `@mentions` an active member | each mentioned member (not the author) | yes |
| `assignment` | task assigned to a user (via `task.assigned` event) | the new assignee (not the actor) | yes |
| `comment` | reserved (thread replies) | — | — |
| `system` | programmatic / future automation | given recipients | yes (opt-out via `email:false`) |

## Design decisions
- **Fan-out is synchronous, email delivery is async.** Notification rows are created in-process (immediate + testable inbox); the email is the BullMQ job with retry/backoff. Fan-out never throws into the mutation (errors are logged).
- **Assignment via events, mentions direct.** Assignment reuses the existing `task.assigned` domain event (no `TasksService` change / no tasks→notifications coupling). Mentions are fanned out inline because `CommentsService` already resolved the member list.
- **Mentions validated against active membership** — non-members / invited-only users are silently dropped so you can't notify outsiders.
- **Nested Mongoose sub-objects** (`file.scope`, `notification.entity`) use the `raw()` helper because a field literally named `type` collides with Mongoose's SchemaType keyword.
- **Label delete detaches**, so tasks never carry dangling `labelIds`.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant minio minio-setup
pnpm --filter @ai-projectos/shared build
pnpm --filter @ai-projectos/api dev            # docs at /api/docs
pnpm --filter @ai-projectos/api worker:dev     # processes email jobs

pnpm --filter @ai-projectos/api typecheck      # green
pnpm --filter @ai-projectos/api lint           # 0 warnings
pnpm --filter @ai-projectos/api test           # 97 passing
pnpm --filter @ai-projectos/api build
```
All comment/label/file/notification routes require an `x-org-id` header (active org).

## Verified live (2026-07-16, against real MinIO)
register → create org → project `SMK` → task `SMK-1` → `POST /files/presign` (text/plain) → **PUT bytes to MinIO** → `POST /files` (confirm) → `task.attachmentsCount = 1` → `GET /files/:id/download` → **GET bytes from MinIO** → downloaded content matches uploaded content ✅.

## Tests added
- Unit: `files/files.mapper.spec.ts` (4 — MIME allowlist incl. image/* prefix + rejects, size cap, DTO mapping).
- Integration (mocked storage):
  - `comments.integration.spec.ts` (6 — create+count+audit/activity, mention → notification + email (author excluded), non-member mention dropped, author-only edit, soft-delete decrements count, tenant isolation).
  - `labels.integration.spec.ts` (5 — org-wide + project-scoped create, duplicate rejection, project-scoped listing incl. org-wide, delete detaches from tasks, tenant isolation).
  - `files.integration.spec.ts` (4 — presign→confirm→download round-trip + `attachmentsCount`, delete decrements + `deleteObject` called, missing-scope reject, tenant isolation).
  - `notifications.integration.spec.ts` (5 — assignment notification via listener + email, no self-assign notification, fan-out dedup + markRead/read-all + unread total, cross-user markRead rejected).
- Repo suite: **97 tests** passing (was 74).

## Definition of Done checklist
- [x] Comment with mention creates a notification (+ enqueues email job).
- [x] Presigned upload → confirm → signed download round-trips against MinIO (live).
- [x] Labels CRUD + attach/detach (via task `labelIds`); notifications list/read/read-all work.
- [x] Jobs processed by the worker with retry/backoff (email queue; `MailProcessor`).
- [x] RBAC + tenancy enforced; unit + integration tests (mocked storage) pass.

## Known gaps / follow-ups
- **Frontend** for comments/labels/attachments/notifications lands in TASK-11.
- Comment `body` is stored opaquely (any JSON object); server does not sanitize rich-text — the editor/renderer must sanitize (XSS) on the frontend.
- `notification` email is a plain text line; **templated HTML emails** and **SMTP transport** are deferred (later task).
- Fan-out is synchronous; if a future path needs to notify very large audiences, move fan-out onto a dedicated queue (the `fanOut` method is already the single choke point to wrap).
- File scope `comment` is validated by id shape only (no cross-module lookup) to avoid a files→comments dependency.
- RAG document files are **out of scope** here — TASK-20 handles document ingestion separately.

## Notes for the next agent
- **Never** enqueue emails or write notifications ad hoc — call `NotificationsService.fanOut(...)`. It dedups, excludes the actor, and handles the email side effect safely.
- To notify on a new domain event, add a branch in `NotificationsListener` (preferred, keeps emitters decoupled) rather than calling notifications from the mutating service.
- New resource routes: `@UseGuards(TenantGuard, PermissionsGuard)`, annotate `@Permissions('...')`, scope every repo query by `org.orgId`, and emit a `DomainEvent` for audit+activity (never call Audit/Activity directly).
- Nested sub-objects in schemas with a `type` field must use `@Prop(raw({...}))`.
- `StorageService` is the only object-storage seam — bind the fake in tests; never import the AWS SDK outside `s3-storage.service.ts`.
