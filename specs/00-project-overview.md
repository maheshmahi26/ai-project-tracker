# 00 — Project Overview

## Vision

Build **AI ProjectOS**, an AI-native project management SaaS that feels like a real, fundable startup product — not a portfolio demo. It should credibly demonstrate Senior Full-Stack + AI engineering: system design, agentic AI with LLM tool-calling, RAG, modern DevOps, and production SaaS architecture, built almost entirely on open-source libraries and the free Gemini API.

## The core idea

A project management platform (organizations → projects → sprints → tasks → subtasks) where **every operation can be performed in two ways**:

1. **Traditional UI** — forms, boards, tables, dashboards.
2. **AI Chat** — natural language that the agent turns into audited backend tool calls.

```
User: "Create a High Priority backend authentication task assigned to Mahesh."
          │
          ▼
   AI Agent (Gemini 2.5 Flash + LangGraph)
          │  interprets intent → selects tool → validates args
          ▼
   createTask() backend tool  ──► Service Layer ──► Repository ──► MongoDB
          │
          ▼
   Returns structured result → visualized in chat (which tool ran + result)
```

**Hard rule:** the AI *never* accesses MongoDB directly. It can only call backend tools that enforce the same validation, authorization, and auditing as the UI.

## Target outcome

A portfolio-worthy product that signals a Senior Full-Stack + AI Engineer (targeting 50–60 LPA roles). It must look and behave like a scalable commercial product.

## Personas

| Persona | Role | Primary needs |
|---------|------|---------------|
| **Aisha** | Org Admin / Founder | Manage org, members, billing-ready settings, high-level reports |
| **Ravi** | Engineering Manager | Plan sprints, assign work, track velocity & burndown, standups |
| **Mahesh** | Developer | See my tasks, update status, comment, use AI to move fast |
| **Nina** | Viewer / Stakeholder | Read-only dashboards, reports, project progress |

## Scope (what "done" means for the product)

**In scope**
- Auth (register, login, forgot password, Google login, JWT + refresh).
- Multi-tenant organizations with RBAC (Admin, Manager, Developer, Viewer).
- Projects, sprints, tasks, subtasks, labels, priorities, comments, notifications, files.
- Full task CRUD + bulk ops + assign/status/priority/deadline + search/filter/sort/pagination.
- Dashboards & reports (completed/pending, velocity, burndown, per-user, priority distribution, progress).
- AI chat that mirrors *all* UI operations via tools, plus generative features (sprint/standup/report/user stories/etc.).
- RAG over uploaded documents (PDF/Word/Markdown/Text) with semantic search.
- Conversation memory across sessions.
- Advanced: soft delete + undo, activity timeline, audit logs, optimistic UI, infinite scroll, dark mode, email, background jobs, rate limiting, caching, health checks, API versioning.
- Observability: Sentry, OpenTelemetry, structured logs.
- DevOps: Docker, Docker Compose, GitHub Actions CI/CD.
- Tests: unit, integration, E2E.

**Out of scope (v1)**
- Real payment/billing integration (settings are billing-*ready* only).
- Native mobile apps (web is responsive/PWA-friendly instead).
- Real-time multi-cursor collaborative editing (comments + notifications instead).
- Self-hosted LLM inference (use free Gemini API).

## Success criteria

- **Parity:** any operation available in the UI is available via AI, and vice-versa, through the *same* service layer.
- **Safety:** 100% of AI mutations pass through validated, authorized, audited tools; zero direct DB access from the AI layer.
- **Quality:** strong TypeScript typing end-to-end, lint/format clean, meaningful test coverage (see [Testing](./10-testing-strategy.md)).
- **Scale story:** stateless API, cache + queue layers, indexed queries, horizontal-scaling-ready — documented with trade-offs.
- **Polish:** modern, responsive, accessible UI with skeleton loaders, error boundaries, optimistic updates, dark mode.

## High-level module map

```
Auth ── Organization ── Projects ── Sprints ── Tasks ── Subtasks
   │                                    │
Settings / Profile                   Labels · Priority · Comments · Files
   │                                    │
RBAC                          Notifications · Activity Timeline · Audit Logs
   │
AI Layer ── Chat Sessions/Messages ── Tool Registry ── AI Executions
   │
RAG ── Documents ── Embeddings ── Vector Search
   │
Dashboard ── Reports
```

## Guiding constraints

- **Open-source first**, free Gemini API wherever possible — minimal recurring cost.
- **Clean Architecture + SOLID**, feature-based folders, repository pattern, DI.
- **Incremental delivery** in 10 phases (see the [roadmap](./11-roadmap.md)); each phase is shippable and reviewable.
- For every feature we document: *why this architecture, which patterns, how it scales, related interview questions, and alternatives/trade-offs.*
