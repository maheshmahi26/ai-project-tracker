# 09 — DevOps & Deployment

## Environments

| Env | Purpose | Frontend | Backend | Data |
|-----|---------|----------|---------|------|
| **local** | dev | Vite dev server | Nest watch + Docker Compose deps | local Mongo/Redis (compose) or Atlas dev + Upstash |
| **preview** | per-PR | Vercel preview | Railway preview env | Atlas preview db |
| **production** | live | Vercel | Railway | Atlas + Upstash |

Config is loaded from env vars, validated at boot with **Zod** (fail fast if a required var is missing). A committed `.env.example` documents every key; real secrets live only in platform secret managers.

## Local development (Docker Compose)

`docker/docker-compose.yml` brings up local infra so contributors need zero cloud accounts to start:

```
services:
  mongo:     # single-node replica set (needed for transactions)
  redis:     # cache + BullMQ
  mongo-express / redis-insight   # optional dev UIs
```

App processes (`api`, `web`, `worker`) run either in Compose or natively via `pnpm dev`. A Makefile / npm scripts wrap common tasks (`make up`, `make seed`, `make test`).

## Container images

Multi-stage Dockerfiles for small, secure images:

```
# apps/api/Dockerfile (multi-stage)
FROM node:22-alpine AS build   → pnpm install + build
FROM node:22-alpine AS runtime → copy dist + prod deps only
      run as non-root user, HEALTHCHECK → GET /health/ready
```

- **API** and **Worker** share the image but run different entrypoints (`main.ts` vs `worker.ts`).
- **Web** is built to static assets and served by Vercel (no container needed in prod), but a Dockerfile exists for parity/self-hosting.

## Background worker

A separate process runs **BullMQ** consumers (email, document indexing/embeddings, report generation, notification fan-out). Deployed as its own Railway service so heavy jobs scale independently of the API and never block request latency.

## CI/CD — GitHub Actions

```
.github/workflows/
├── ci.yml         # on PR: install → typecheck → lint → test (unit+integration) → build
├── e2e.yml        # on PR (label/nightly): Playwright against ephemeral stack
├── deploy-web.yml # on main: Vercel deploy (prod)
└── deploy-api.yml # on main: build image → Railway deploy → run migrations/health gate
```

Pipeline gates (PR must pass to merge):
1. **Typecheck** (`tsc --noEmit`) across workspaces.
2. **Lint + format** (ESLint + Prettier, `--max-warnings 0`).
3. **Unit + integration tests** (Vitest/Jest) with coverage threshold.
4. **Build** all apps (Turborepo cached).
5. (nightly / on-demand) **E2E** (Playwright).
6. **Security**: `pnpm audit` + Dependabot; secret scanning.

Turborepo remote/local cache speeds repeated builds. Deploys are triggered only after green CI on `main`.

> **Git review note:** for this repo, changes are pushed for review via Gerrit-style review refs (`refs/for/<branch>`), never directly to protected branches. CI still runs on the review ref.

## Deployment topology

```
        Vercel (Web, global CDN)
              │  HTTPS + SSE
              ▼
        Railway: API service   ──┐
        Railway: Worker service  │──► MongoDB Atlas (+ Search + Vector)
                                  ├──► Upstash Redis (cache + queue)
                                  └──► Cloudflare R2 (files)
              │
              ▼
   Gemini API · Google OAuth · Sentry · Better Stack · OTel collector
```

- **Zero-downtime**: rolling deploys + health-gated cutover (`/health/ready` must pass).
- **Migrations**: schema/index setup via a migration runner executed as a deploy step (idempotent index creation, Atlas Search/Vector index definitions checked in as code).
- **Rollback**: platform keeps previous build; revert = redeploy previous image.

## Observability

| Concern | Tool | What we get |
|---------|------|-------------|
| Errors | **Sentry** (FE+BE) | exceptions with `requestId`, releases, source maps |
| Traces/metrics | **OpenTelemetry** | distributed traces (HTTP → service → Mongo → AI), latency, throughput |
| Logs | **Pino → Better Stack** | structured JSON logs, searchable, alerting |
| Health | `/health`, `/health/ready` | liveness/readiness for platform + uptime checks |
| AI runs | `AIExecutions` + OTel spans | per-tool latency, token usage, failure rate |

Every request carries a `requestId` propagated across logs, errors, audit entries, and OTel spans for end-to-end correlation.

## Cost & scaling posture

- Free/low tiers by default: Gemini free API, Upstash pay-per-request, Atlas free/shared to start.
- Scale levers documented: API replicas (stateless), worker concurrency, Redis cache TTLs, Atlas tier bump, later a dedicated vector DB.
- Rate limiting + caching protect free-tier limits (esp. Gemini).

## Interview questions this prepares you for

- Why a separate worker process for jobs? What breaks if you don't?
- How do you achieve zero-downtime deploys and safe rollbacks?
- How do you validate config and fail fast on misconfiguration?
- How do you correlate a user-reported error to logs/traces (requestId)?
- Multi-stage Docker builds — why, and how do they improve security/size?
