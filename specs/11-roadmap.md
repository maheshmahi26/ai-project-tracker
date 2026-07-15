# 11 — Implementation Roadmap

The project is built **incrementally in 10 phases**. Each phase is independently shippable, reviewable (pushed via Gerrit review refs), and ends with a **Definition of Done (DoD)**. Do not start a phase until the previous one's DoD is met.

Legend: `BE` backend · `FE` frontend · `INFRA` devops · `AI` ai/rag.

---

## Phase 0 — Foundations (pre-req, part of Phase 1)
Monorepo + tooling before any feature code.
- `INFRA` pnpm workspaces + Turborepo; `apps/api`, `apps/web`, `packages/shared`, `packages/config`.
- `INFRA` Shared ESLint/Prettier/tsconfig presets; strict TS everywhere.
- `INFRA` Docker Compose (Mongo replica set + Redis); `.env.example`; config validated with Zod.
- `INFRA` Base CI (typecheck + lint + build).

---

## Phase 1 — Project Setup
**Goal:** a running skeleton for both apps with cross-cutting concerns wired.
- `BE` NestJS bootstrap: config module, Pino logger, Swagger at `/api/docs`, `/health` + `/health/ready`.
- `BE` Global cross-cutting: `AllExceptionsFilter` (error envelope), `TransformInterceptor` (success envelope), `ZodValidationPipe`, request-id middleware, CORS + Helmet, rate limiter.
- `BE` Mongo connection + base repository (org-scoped filter, soft-delete middleware) + migration/index runner.
- `BE` Redis + BullMQ setup; empty worker process boots.
- `FE` Vite + React 19 + Tailwind + shadcn/ui installed; theme (dark mode) + AppShell layout + router with lazy routes + error boundaries; `apiClient` with envelope handling.
- `INFRA` Sentry + OTel initialized (no-op safe locally).
- **DoD:** both apps boot; `/health/ready` green; Swagger loads; a "ping" endpoint round-trips through envelope + logging; CI green.

---

## Phase 2 — Authentication
**Goal:** secure auth end-to-end.
- `BE` Users + Memberships + Organizations schemas; Argon2id hashing.
- `BE` Passport local + JWT + Google strategies; access/refresh tokens with rotation + reuse detection; forgot/reset password (emailed token via BullMQ email job).
- `BE` `JwtAuthGuard`, `OrgGuard`; `@CurrentUser`; auth endpoints (see [API](./04-api-design.md#auth)).
- `BE` Audit auth events.
- `FE` auth feature: register/login/forgot/reset forms (RHF+Zod), Google button, auth store + refresh-on-401, protected routes, org bootstrap (create/select org).
- **DoD:** full auth flow works in UI + Swagger; refresh rotation + reuse-lockout tested; a user can create an org and land in the app shell.

---

## Phase 3 — Projects
**Goal:** CRUD + lifecycle for projects with RBAC.
- `BE` RBAC: `Memberships` roles, `RolesGuard`, `@Permissions`, permission matrix; policy checks.
- `BE` Projects module: create/update/archive/restore/soft-delete/undo; project key + task counter; list with filter/sort/paginate/search.
- `BE` Activity + Audit logging via domain events (introduce the event bus here).
- `FE` projects feature: list, create/edit dialogs, archive/restore, detail shell; empty/skeleton/error states; RBAC-aware controls.
- **DoD:** projects CRUD + archive/restore + undo work with RBAC enforced (Viewer blocked); audit + activity rows written; list paginates/filters.

---

## Phase 4 — Tasks (+ Sprints, Comments, Labels, Files)
**Goal:** the core work-management surface.
- `BE` Sprints module (plan/start/complete, point totals via transaction).
- `BE` Tasks module: CRUD, subtasks (`parentId`), assign, move, status/priority/deadline, **bulk-update/bulk-delete**, soft-delete + undo; filter/sort/paginate; MongoDB text index on title/description for search.
- `BE` Comments (rich text, mentions → notifications), Labels, Files (R2/S3 presigned upload/download).
- `BE` Notifications module + email/notification jobs (BullMQ).
- `FE` tasks feature: **Kanban board** (optimistic drag), **task table** (filter/sort/search/paginate, bulk actions), **task detail** (TipTap description, comments, subtasks, files, activity), notifications center; infinite scroll.
- **DoD:** create→assign→move→comment→bulk-update→soft-delete→undo all work in UI; search/filter/sort/paginate work; files upload/download; notifications fire.

---

## Phase 5 — Dashboard & Reports
**Goal:** insight surfaces.
- `BE` Dashboard aggregations (read models, cached): overview counts, velocity, burndown, tasks-per-user, priority distribution, project progress; weekly report endpoint.
- `FE` dashboard feature: Recharts widgets + recent activity feed; skeletons; date/project filters; export (CSV/PDF) for privileged roles.
- **DoD:** all charts render from seeded data; caching + invalidation verified; reports downloadable.

---

## Phase 6 — AI Integration (the differentiator)
**Goal:** every UI operation also works via AI, safely.
- `AI` Gemini client + tool registry (MCP-inspired typed contracts); Zod→function-declaration conversion.
- `AI` LangGraph agent (ingest→reason→act→observe→respond) with guardrails (iterations/timeout/token budget).
- `AI` Wire **CRUD/action tools** to existing services (createTask, updateTask, deleteTask, bulk*, assignTask, moveTask, searchTasks, project/sprint tools, addComment, createLabel). Each: input/output schema, validation, permission, error handling.
- `AI` **Generative tools** (structured JSON, propose→confirm): generateSprint/standup/report/weekly/user-stories/acceptance-criteria/subtasks/roadmap/release-notes/meeting-summary; `analytics`.
- `AI` Chat sessions/messages + `AIExecutions`; SSE streaming (tokens + tool_call + tool_result events).
- `FE` **AI chat UI**: streaming, markdown + code highlight, session history, suggested prompts, **tool execution visualization** cards, in-chat confirm for destructive ops, deep links to entities.
- **DoD:** parity proven — e.g. "create a high-priority task assigned to X" creates the same task the UI would, audited as `source:'ai'`, with the tool card visualized; Viewer's AI cannot exceed permissions.

---

## Phase 7 — RAG & Memory
**Goal:** ground the agent in user documents + recall past context.
- `AI` Documents module: presign → confirm → **BullMQ indexing job** (parse pdf/docx/md/txt → chunk → Gemini embeddings → Embeddings collection); status tracking + retries.
- `AI` Qdrant collection + client (payload-filtered by org/project); `searchKnowledge` tool + `POST /search/semantic`; citations.
- `AI` RAG features: Q&A over docs; **generate tasks from PRD**; generate sprint from documents (propose→confirm).
- `AI` **Conversation memory**: recent-turns + rolling summary + entity-reference resolver (e.g. "tasks we discussed yesterday").
- `FE` documents feature: drag-drop upload, indexing status, semantic search UI; chat surfaces citations.
- **DoD:** upload a PRD → indexed → agent answers with citations and generates tasks; "move the tasks we discussed yesterday to Sprint 4" resolves correctly and mutates via tools.

---

## Phase 8 — Deployment
**Goal:** production-live on the target platforms.
- `INFRA` Multi-stage Dockerfiles (api, worker, web-parity); non-root; healthchecks.
- `INFRA` CI/CD: deploy-web (Vercel), deploy-api + worker (Railway), migration/index step, health-gated cutover, rollback path.
- `INFRA` Provision self-hosted Mongo (replica set) + Qdrant + Redis containers, R2, Google OAuth creds, Sentry/Better Stack/OTel; secrets in platform managers.
- `INFRA` Rate limits + caching tuned for free tiers (esp. Gemini).
- **DoD:** production URLs live; preview deploys per PR; observability dashboards receiving data; smoke E2E passes against prod-like preview.

---

## Phase 9 — Testing
**Goal:** confidence + regression safety (tests are written alongside each phase, hardened here).
- `BE` Unit (domain, services with fake repos, tools, RBAC matrix) + integration (mongodb-memory-server, auth/tenant/CRUD/soft-delete/audit, mocked-Gemini agent).
- `FE` component/hook tests (states, optimistic rollback, chat reducer, forms).
- E2E Playwright journeys (auth, project/task UI flow, RBAC, **AI parity**, RAG, dashboard).
- Coverage gates enforced in CI.
- **DoD:** coverage targets met; all suites green in CI; E2E stable on nightly.

---

## Phase 10 — Documentation
**Goal:** portfolio- and interview-ready.
- Root `README` (architecture diagram, quickstart, screenshots/gifs, live links).
- Keep these `specs/` updated to match the built system.
- API docs (Swagger) + a short "AI tools reference".
- Per-feature "engineering notes": why this architecture, patterns used, how it scales, **interview questions**, alternatives/trade-offs (this is a stated deliverable).
- Architecture Decision Records (ADRs) for major choices.
- **DoD:** a new engineer can clone, run locally, and understand the system from docs alone; the repo reads like a real startup product.

---

## Dependency graph (build order)

```
P0 → P1 → P2 → P3 → P4 → P5
                     └────────► P6 → P7
                                      └► P8 → P9 → P10
(P9 testing is continuous; P8 can begin once P6 is stable enough for a preview)
```

## Milestones to demo
1. **M1 (end P2):** auth + orgs live.
2. **M2 (end P4):** full project/task management via UI.
3. **M3 (end P6):** AI does everything the UI does — the headline demo.
4. **M4 (end P7):** upload a PRD, get a sprint — the "wow".
5. **M5 (end P10):** deployed, tested, documented, portfolio-ready.

## Per-feature deliverable checklist (applies to every feature)
- [ ] Strong TypeScript types + shared Zod schema in `packages/shared`
- [ ] Validation, authorization, error handling, audit/activity
- [ ] Available via **both** UI and AI tool (parity)
- [ ] Unit + integration tests; E2E for critical paths
- [ ] Loading/empty/error states in UI; optimistic where sensible
- [ ] Engineering note: why / patterns / scaling / interview Qs / trade-offs
