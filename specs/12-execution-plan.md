# 12 — Execution Plan (Multi-Agent Workflow)

This document explains **how the project gets built** by handing discrete work packages ("tasks") to **different Cursor agents**, and how each agent **records what it did** so the next agent has full context.

## Core idea

- The whole build is split into **numbered task cards** in the [`../tasks/`](../tasks/) folder (`TASK-01` … `TASK-22`).
- Each task card is **self-contained**: an agent can open it cold, read the referenced specs, and complete it without needing the chat history.
- When an agent finishes a task, it writes a **history entry** in the [`../history/`](../history/) folder describing exactly what was done, decisions made, and follow-ups.
- Tasks have **dependencies** and a strict **build order**.

## Golden rule: human-first, AI-last

We build the **traditional product first** (auth, orgs, projects, sprints, tasks, dashboard) and only **after that solid core exists** do we add the **AI layer** (agent, tools, chat) and **RAG**.

Why: the AI tools are thin wrappers over the same Application-layer services the UI uses. Those services must exist and be tested first — otherwise there is nothing for the AI to call. Building AI last also means every AI tool has a proven, audited service behind it (see [AI spec](./05-ai-agent.md)).

```
 HUMAN LAYER (build first)                          AI LAYER (build last)
 ────────────────────────────────────────────      ─────────────────────────────
 Foundation → Auth/RBAC → Projects → Tasks →        AI foundation → AI tools →
 Sprints → Comments/Files → Dashboard →             AI generative → AI chat UI →
 Testing → Deployment                               RAG + Memory → Docs
```

## Task order & dependency graph

```
TASK-01 Monorepo & tooling
      │
TASK-02 Local infra (Mongo RS + Redis + Qdrant, env/config)
      │
      ├── TASK-03 Backend skeleton (cross-cutting) ─┐
      └── TASK-04 Frontend skeleton (shell + DS) ───┤
                                                     │
TASK-05 Auth + RBAC backend ◄────────────────────────┘
      │
TASK-06 Auth frontend + org bootstrap
      │
TASK-07 Projects backend (+ activity/audit events)
      │
TASK-08 Projects frontend
      │
TASK-09 Sprints + Tasks backend
      │
      ├── TASK-10 Comments/Labels/Files/Notifications backend
      └── TASK-11 Tasks frontend (board/table/detail)
      │
TASK-12 Dashboard backend ── TASK-13 Dashboard frontend
      │
TASK-14 Testing hardening
      │
TASK-15 Deployment & observability
      │
══════════════ AI LAYER STARTS HERE ══════════════
      │
TASK-16 AI foundation (Gemini + tool registry + LangGraph + chat + SSE)
      │
      ├── TASK-17 AI action/CRUD tools (parity)
      └── TASK-18 AI generative tools
      │
TASK-19 AI chat frontend
      │
TASK-20 RAG ingestion (Qdrant)
      │
TASK-21 RAG features + conversation memory
      │
TASK-22 Final docs & ADRs
```

Tasks on the same line with `├──`/`└──` can be worked **in parallel by different agents** once their shared dependency is complete.

## How to run one task (agent instructions)

Give the agent a prompt like:

> Read `specs/12-execution-plan.md` and `tasks/TASK-07-projects-backend.md`. Complete that task exactly as specified, following all referenced specs. Do not start any other task. When finished, create the history entry as described in the task card.

Every task card follows the same template:

```
# TASK-XX — <title>
Phase · Depends on · Can run in parallel with · Estimated size

## Specs to read first
(links into specs/ that define the contract)

## Scope — in
(what to build)

## Scope — out
(explicitly not in this task)

## Deliverables
(files/modules expected)

## Definition of Done (acceptance criteria)
(checklist that must all pass)

## History requirement
(what to write in history/ when done)
```

## History / progress tracking

The [`../history/`](../history/) folder is the durable memory of the build.

- **`history/README.md`** — explains the format and links the log index.
- **`history/_TEMPLATE.md`** — copy this for each completed task.
- **`history/TASK-XX.md`** — one file per completed task, created by the agent that did it.
- **`history/CHANGELOG.md`** — a running, newest-first index: `TASK-XX · title · status · date · agent/chat link`.

**Rule for every agent:** the task is not "done" until its `history/TASK-XX.md` exists and `history/CHANGELOG.md` has a new top row. The history entry must capture:
1. What was implemented (files/modules touched).
2. Key decisions & deviations from the spec (with reasons).
3. How to run/verify it locally (commands).
4. Known gaps / TODOs / follow-ups for later tasks.
5. Anything the **next** agent must know.

## Conventions all agents follow

- **Branch/PR per task**, named `task/TASK-XX-short-slug`; push for review via Gerrit review refs (`refs/for/<branch>`), never directly to protected branches.
- **Strong typing**, lint + format clean, tests for the slice being built (see [Testing](./10-testing-strategy.md)).
- **Shared contracts** (Zod schemas/types) go in `packages/shared` — never duplicate them.
- **Don't break earlier tasks**: run the existing test suite before finishing.
- **Stay in scope**: if you discover work belonging to another task, note it in history as a follow-up rather than doing it.
- **Update the spec** if reality diverges, and mention the update in history.

## Status board (fill in as tasks complete)

| Task | Title | Layer | Status |
|------|-------|-------|--------|
| TASK-01 | Monorepo & tooling | Foundation | ✅ done (2026-07-15, installed & building) |
| TASK-02 | Local infra (Mongo/Redis/Qdrant/MinIO) | Foundation | ✅ done (2026-07-15, containers healthy) |
| TASK-03 | Backend skeleton | Foundation | ✅ done (2026-07-15, verified live) |
| TASK-04 | Frontend skeleton | Foundation | ✅ done (2026-07-16, verified) |
| TASK-05 | Auth + RBAC backend | Human | ☐ |
| TASK-06 | Auth frontend + org bootstrap | Human | ☐ |
| TASK-07 | Projects backend | Human | ☐ |
| TASK-08 | Projects frontend | Human | ☐ |
| TASK-09 | Sprints + Tasks backend | Human | ☐ |
| TASK-10 | Comments/Labels/Files/Notifications | Human | ☐ |
| TASK-11 | Tasks frontend | Human | ☐ |
| TASK-12 | Dashboard backend | Human | ☐ |
| TASK-13 | Dashboard frontend | Human | ☐ |
| TASK-14 | Testing hardening | Human | ☐ |
| TASK-15 | Deployment & observability | Human | ☐ |
| TASK-16 | AI foundation | AI | ☐ |
| TASK-17 | AI action/CRUD tools | AI | ☐ |
| TASK-18 | AI generative tools | AI | ☐ |
| TASK-19 | AI chat frontend | AI | ☐ |
| TASK-20 | RAG ingestion (Qdrant) | AI | ☐ |
| TASK-21 | RAG features + memory | AI | ☐ |
| TASK-22 | Final docs & ADRs | AI | ☐ |
