# 01 — Tech Stack

Every choice below includes a **why** and a **trade-off**, because in interviews the reasoning matters more than the name.

## Frontend

| Tech | Why | Trade-off / Alternative |
|------|-----|-------------------------|
| **React 19** | Industry standard, Server Components/actions maturing, huge ecosystem | Solid/Svelte are leaner; React chosen for hireability |
| **TypeScript** | Type safety end-to-end, shared DTO types with backend | Compile step; worth it |
| **Vite** | Fast dev server, ESBuild/Rollup, first-class TS | Next.js gives SSR; we don't need SSR for an app-shell SaaS |
| **TailwindCSS** | Utility-first, consistent design tokens, fast iteration | Verbose markup; mitigated by components |
| **shadcn/ui** | Accessible Radix primitives, owned (copy-in) components, themeable | Not a versioned dep; that's intentional for customization |
| **React Router** | Mature client routing, nested layouts, lazy routes | TanStack Router is typed-er; RR is more common |
| **TanStack Query** | Server-state cache, optimistic updates, infinite scroll | Learning curve; replaces most manual fetch state |
| **Zustand** | Tiny client/UI state (theme, chat drawer, selections) | Redux is heavier; we keep server-state in Query |
| **React Hook Form** | Performant uncontrolled forms | — |
| **Zod** | One schema → validation + inferred TS types, shared with API | — |
| **Recharts** | Declarative charts for dashboards | Nivo/visx more flexible but heavier |
| **Framer Motion** | Polished, accessible animations | Bundle cost; lazy-load heavy views |
| **TipTap** | Rich text for comments/docs (ProseMirror based) | Heavy; lazy-loaded in editor routes |

## Backend

| Tech | Why | Trade-off / Alternative |
|------|-----|-------------------------|
| **Node.js + TypeScript** | Same language as FE, shared types, huge ecosystem | CPU-bound work needs workers/queues |
| **NestJS** | Opinionated DI, modules, guards, interceptors, filters → maps 1:1 to Clean Architecture | Boilerplate; pays off at scale |
| **MongoDB + Mongoose** (self-hosted / local) | Flexible documents fit nested tasks/comments; runs locally via Docker, no cloud lock-in | No Atlas Search/Vector — we use Mongo text indexes for full-text + **Qdrant** for vectors |
| **Qdrant** (self-hosted, free & OSS) | Purpose-built vector DB for RAG; runs locally via Docker, generous free cloud tier | A second datastore to run; worth it for real semantic search without Atlas |
| **Redis** (local Docker / Upstash) | Cache, rate-limit buckets, BullMQ backing store, session/refresh helpers | Another moving part; local in dev, Upstash optional in prod |
| **BullMQ** | Reliable background jobs (email, embeddings, reports) on Redis | Requires Redis; acceptable |
| **JWT + Passport** | Stateless auth, standard strategies (local, jwt, google) | Token revocation needs a denylist / short TTL + refresh |
| **Swagger (OpenAPI)** | Auto-generated, always-accurate API docs from decorators | — |
| **Pino** | Fast structured JSON logging, ships to Better Stack | — |

## Database & Search

- **MongoDB (local / self-hosted)** — primary datastore, run as a **single-node replica set** via Docker so multi-document transactions work in dev. No dependency on MongoDB Atlas.
- **Full-text search** — MongoDB **native text indexes** (`$text`) power global/task/project search. Free, local, no Atlas Search needed. (If we ever outgrow it we can move to a dedicated search engine behind the same `SearchService` port.)
- **Vector / semantic search (RAG)** — **Qdrant**, an open-source vector database run locally via Docker (or its free managed cloud tier). Stores chunk embeddings; MongoDB keeps the chunk text + metadata and a `qdrantPointId` reference.
- Trade-off: two datastores instead of one, but everything is free and self-hostable, and Qdrant gives real ANN vector search with payload filtering (org/project isolation) that a naive Mongo approach can't match.

## AI

| Tech | Why | Trade-off |
|------|-----|-----------|
| **Gemini 2.5 Flash (free API)** | Fast, cheap/free, native function-calling + structured JSON output | Rate limits on free tier; we cache + queue |
| **Google AI SDK** | Official client, streaming + tool schemas | — |
| **LangGraphJS** | Explicit, inspectable **agent state machine** (plan → tool → observe → respond); durable, resumable | More setup than a raw loop; needed for reliability + memory |
| **LangChainJS** | Only where useful: loaders, text splitters, embedding helpers | Avoid over-abstraction; use selectively |
| **MCP concepts** | Tools modeled as a typed registry with input/output schemas → portable, inspectable | We adopt the *concepts* (typed tool contracts), not necessarily a full MCP server in v1 |
| **Function Calling + Structured Output** | Deterministic, validated tool args (Zod) instead of brittle string parsing | — |

## File Storage

- **Cloudflare R2** (preferred) via S3-compatible SDK — zero egress fees, cheap. **AWS S3** as drop-in alternative behind a `StorageService` interface, so the provider is swappable.

## Authentication

- JWT **access** token (short TTL) + **refresh** token (rotating, longer TTL, stored hashed).
- **Google OAuth** login via Passport Google strategy.

## Deployment

| Layer | Platform | Why |
|-------|----------|-----|
| Frontend | **Vercel** | Zero-config Vite deploys, edge CDN, previews |
| Backend | **Railway** (or Render) | Simple container hosting, managed env/secrets |
| Database | **Self-hosted MongoDB** (Docker on the backend host / VM) | Free, portable; local in dev, containerized in prod. Atlas remains an optional drop-in later. |
| Vector DB | **Qdrant** (Docker sidecar, or free Qdrant Cloud) | Free semantic search for RAG |
| Redis | **Redis** (Docker) or **Upstash** free tier | Cache + queue |

## Monitoring & Observability

- **Sentry** — error + performance tracing (FE + BE).
- **OpenTelemetry** — traces/metrics, vendor-neutral export.
- **Better Stack Logs** — Pino log aggregation, dashboards, alerts.

## Repository shape (monorepo)

```
ai-projectos/
├── apps/
│   ├── api/        # NestJS backend
│   └── web/        # React + Vite frontend
├── packages/
│   ├── shared/     # Zod schemas, DTO types, tool contracts shared FE/BE
│   └── config/     # eslint, tsconfig, prettier presets
├── docker/         # Dockerfiles, docker-compose
├── .github/        # CI/CD workflows
└── specs/          # this folder
```

**Why a monorepo:** shared Zod schemas and tool contracts live in `packages/shared`, so the same task/tool types are used by the API, the React UI, and the AI tool registry — a single source of truth prevents drift.
**Tooling:** pnpm workspaces + Turborepo for caching builds. Trade-off: slightly more setup vs. two repos, but shared types are the whole point.
