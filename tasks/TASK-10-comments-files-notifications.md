# TASK-10 — Comments, Labels, Files, Notifications (+ background jobs)

- **Layer:** Human
- **Depends on:** TASK-09
- **Parallel with:** TASK-11
- **Size:** L

## Specs to read first
- [03 Database Schema → Comments, Labels, Files, Notifications](../specs/03-database-schema.md)
- [04 API Design → Comments/Labels/Files/Notifications](../specs/04-api-design.md)
- [01 Tech Stack → File Storage](../specs/01-tech-stack.md)

## Scope — in
- **Comments** on tasks: rich-text (JSON) body, `@mentions` → notifications, edit/soft-delete.
- **Labels**: CRUD, per-org/per-project scoping, attach/detach on tasks.
- **Files**: `StorageService` port with **Cloudflare R2 (S3-compatible)** adapter; presigned upload URL, confirm metadata, signed download; size/mime allowlist; private buckets.
- **Notifications**: model + endpoints (list, read, read-all); fan-out on mention/assignment.
- **BullMQ jobs** (in the worker): email sender (SMTP/console in dev), notification fan-out, (email templates).
- Emit events → Audit + Activity.

## Scope — out
- Frontend for these lands in TASK-11. No AI. No RAG documents (TASK-20 handles document files separately).

## Deliverables
- Comments/labels/files/notifications backend + working job worker.

## Definition of Done
- [ ] Comment with mention creates a notification (+ enqueues email job).
- [ ] Presigned upload → confirm → signed download round-trips against R2 (or S3-compatible local like MinIO in dev).
- [ ] Labels CRUD + attach/detach; notifications list/read/read-all work.
- [ ] Jobs processed by the worker with retry/backoff.
- [ ] RBAC + tenancy enforced; tests (unit + integration, mocked storage) pass.

## History requirement
Create `../history/TASK-10.md`: document StorageService contract, upload flow, job names/queues, and notification types. Add CHANGELOG row.
