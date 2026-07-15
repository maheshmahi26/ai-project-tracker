# Tasks — per-agent work packages

Each `TASK-XX-*.md` is a self-contained work package for **one Cursor agent**. Read [`../specs/12-execution-plan.md`](../specs/12-execution-plan.md) first for the workflow, ordering, and history rules.

**Golden rule:** build the human layer (TASK-01 → TASK-15) before the AI layer (TASK-16 → TASK-22).

When a task is done, the agent must write `../history/TASK-XX.md` and add a row to `../history/CHANGELOG.md`.

| Order | Task | Depends on |
|-------|------|-----------|
| 1 | [TASK-01 Monorepo & tooling](./TASK-01-monorepo-foundation.md) | — |
| 2 | [TASK-02 Local infra (Mongo/Redis/Qdrant)](./TASK-02-local-infra.md) | 01 |
| 3 | [TASK-03 Backend skeleton](./TASK-03-backend-skeleton.md) | 02 |
| 4 | [TASK-04 Frontend skeleton](./TASK-04-frontend-skeleton.md) | 02 |
| 5 | [TASK-05 Auth + RBAC backend](./TASK-05-auth-rbac-backend.md) | 03 |
| 6 | [TASK-06 Auth frontend + org bootstrap](./TASK-06-auth-frontend.md) | 04, 05 |
| 7 | [TASK-07 Projects backend](./TASK-07-projects-backend.md) | 05 |
| 8 | [TASK-08 Projects frontend](./TASK-08-projects-frontend.md) | 06, 07 |
| 9 | [TASK-09 Sprints + Tasks backend](./TASK-09-sprints-tasks-backend.md) | 07 |
| 10 | [TASK-10 Comments/Labels/Files/Notifications](./TASK-10-comments-files-notifications.md) | 09 |
| 11 | [TASK-11 Tasks frontend](./TASK-11-tasks-frontend.md) | 08, 09 |
| 12 | [TASK-12 Dashboard backend](./TASK-12-dashboard-backend.md) | 09 |
| 13 | [TASK-13 Dashboard frontend](./TASK-13-dashboard-frontend.md) | 11, 12 |
| 14 | [TASK-14 Testing hardening](./TASK-14-testing-hardening.md) | 13 |
| 15 | [TASK-15 Deployment & observability](./TASK-15-deployment-observability.md) | 14 |
| 16 | [TASK-16 AI foundation](./TASK-16-ai-foundation.md) | 15 |
| 17 | [TASK-17 AI action/CRUD tools](./TASK-17-ai-action-tools.md) | 16 |
| 18 | [TASK-18 AI generative tools](./TASK-18-ai-generative-tools.md) | 16 |
| 19 | [TASK-19 AI chat frontend](./TASK-19-ai-chat-frontend.md) | 17, 18 |
| 20 | [TASK-20 RAG ingestion (Qdrant)](./TASK-20-rag-ingestion.md) | 16 |
| 21 | [TASK-21 RAG features + memory](./TASK-21-rag-features-memory.md) | 19, 20 |
| 22 | [TASK-22 Final docs & ADRs](./TASK-22-docs-adrs.md) | 21 |
