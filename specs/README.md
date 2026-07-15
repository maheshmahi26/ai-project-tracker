# AI ProjectOS — Specifications

> Production-quality, AI-native Project Management SaaS.
> Every operation is possible in **two ways**: through a traditional UI **and** through an AI chat interface backed by backend tool-calling.

This `specs/` folder is the **single source of truth** for _what_ we are building and _how_ we will build it. It is written before implementation so the codebase can be generated incrementally, phase by phase, without ambiguity.

---

## How to read these specs

Read them in order. Each document is self-contained but builds on the previous one.

| # | Document | What it covers |
|---|----------|----------------|
| 00 | [Project Overview](./00-project-overview.md) | Vision, goals, personas, scope, success criteria |
| 01 | [Tech Stack](./01-tech-stack.md) | Every technology + the rationale/trade-off for each |
| 02 | [System Architecture](./02-architecture.md) | Clean architecture, C4 diagrams, module boundaries, request lifecycle |
| 03 | [Database Schema](./03-database-schema.md) | All 15 MongoDB collections, indexes, relationships |
| 04 | [API Design](./04-api-design.md) | REST conventions, versioning, error envelope, endpoint catalogue |
| 05 | [AI Agent & Tool Calling](./05-ai-agent.md) | LangGraph agent loop, tool registry, MCP concepts, streaming |
| 06 | [RAG & Memory](./06-rag-memory.md) | Ingestion pipeline, embeddings, vector search, conversation memory |
| 07 | [Security & RBAC](./07-security-rbac.md) | Auth flows, JWT/refresh, roles, permissions, guards |
| 08 | [Frontend Architecture](./08-frontend-architecture.md) | Feature folders, state strategy, chat UI, design system |
| 09 | [DevOps & Deployment](./09-devops-deployment.md) | Docker, CI/CD, environments, observability |
| 10 | [Testing Strategy](./10-testing-strategy.md) | Unit / integration / E2E, coverage targets |
| 11 | [Implementation Roadmap](./11-roadmap.md) | The 10 phases broken into concrete, ordered steps |

---

## The one-paragraph pitch

**AI ProjectOS** is a Jira/Linear-class project management platform where an AI agent is a first-class citizen. Users manage organizations, projects, sprints, tasks, and documents through a modern, accessible React UI — or they can simply *tell* the system what they want: _"Create a high-priority backend auth task assigned to Mahesh and add it to Sprint 4."_ The agent interprets intent, calls **audited backend tools** (never the database directly), and returns a verifiable result with the exact tool call visualized in the chat. Uploaded PRDs and meeting notes become searchable knowledge via RAG, so the agent can _"Generate a sprint from this requirements doc."_

---

## Non-negotiable principles

1. **The AI never touches the database directly.** All AI actions go through the same validated, authorized service/tool layer the UI uses.
2. **Two paths, one core.** UI and AI are thin clients over a shared application layer — no duplicated business logic.
3. **Everything is audited.** Every mutation (UI or AI) writes an `AuditLog`; every AI run writes an `AIExecution`.
4. **Clean Architecture + SOLID.** Domain logic is framework-agnostic and testable in isolation.
5. **Production-ready, not demo.** Strong typing, validation at boundaries, error handling, observability, and tests from day one.

---

## Status

These are **planning specs only**. No application code has been written yet. Implementation follows [the roadmap](./11-roadmap.md), phase by phase, after these specs are approved.
