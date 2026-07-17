# TASK-15 — Deployment & observability

- **Status:** ✅ done — typecheck + lint + full build green; migration runner verified against local Mongo; API coverage gate still passes (119 tests). Docker image builds + platform deploys are exercised in CI (not runnable in the dev sandbox — see gaps).
- **Date:** 2026-07-17
- **Agent / chat:** deployment & observability chat
- **Branch / PR:** task/TASK-15-deployment-observability → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-17 (09-devops-deployment).
- **Depends on:** TASK-14 (CI + coverage gates).

## What was implemented

Production packaging, an idempotent migration runner, live observability wiring, and
the deploy pipeline — turning the human-layer app into something reproducibly deployable.

### 1. Container images (multi-stage, non-root, healthchecked)
- **`apps/api/Dockerfile`** — one image, two entrypoints (API `dist/main.js`, worker
  `dist/worker.js`). `node:22-alpine` build stage installs the filtered workspace
  (`--filter @ai-projectos/api...`), builds shared + api, then `pnpm deploy --prod`
  produces a pruned prod tree. Runtime stage runs as a non-root `nodejs` user, `EXPOSE 3000`,
  and a `HEALTHCHECK` that hits `/health/ready`.
- **`apps/web/Dockerfile`** — builds the SPA (VITE_* baked at build time) and serves it with
  **unprivileged nginx** (`nginxinc/nginx-unprivileged`, port 8080) + `apps/web/nginx.conf`
  (SPA fallback, asset caching, security headers).
- **`.dockerignore`** — keeps node_modules/dist/env/secrets/test-artifacts out of the context.

### 2. Migration / bootstrap runner — `apps/api/src/scripts/migrate.ts`
- Boots an `AppModule` application context, then **`syncIndexes()`** on every Mongo model
  (required in prod where `autoIndex` is off — creates schema + text indexes idempotently),
  and **bootstraps the Qdrant collection** (`ai_projectos_chunks`, dim 768, Cosine) if missing.
- Qdrant bootstrap is **non-fatal** (RAG isn't live until TASK-20, so a missing Qdrant never
  blocks a deploy). Wired as `pnpm --filter api migrate`, `make migrate`, and a compose
  `migrate` service. **Verified locally:** synced 12 collections, exit 0.

### 3. Observability (live wiring)
- **OpenTelemetry** (`observability/otel.ts`): real `NodeSDK` + OTLP/HTTP exporter +
  `getNodeAutoInstrumentations` (HTTP → Express → Mongo/Redis), resource tagged with
  `service.name`/`service.version`. Guarded no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set;
  graceful SIGTERM/SIGINT shutdown. Started before Nest boot in `main.ts`.
- **Sentry BE** (`observability/sentry.ts`): adds `release` (git SHA) + env-tunable
  `SENTRY_TRACES_SAMPLE_RATE`. Errors already flow through `AllExceptionsFilter` with
  `requestId` + `code` context.
- **Sentry FE** (`apps/web/src/observability/sentry.ts` + `main.tsx`): `@sentry/react` init with
  browser tracing, guarded by `VITE_SENTRY_DSN`; `vite-env.d.ts` types the VITE_* vars.
- **Pino → Better Stack** (`observability/logger.ts`): ships structured logs via `@logtail/pino`
  when `BETTER_STACK_SOURCE_TOKEN` is set; pretty locally; stdout JSON otherwise. `requestId` on every line.
- **Rate limits tunable**: `ThrottlerModule` now reads `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_MAX`.

### 4. CI/CD workflows
- **`ci.yml`** (from TASK-14) — the merge gate.
- **`deploy-web.yml`** — Vercel prebuilt deploy on main (`vercel pull/build/deploy`), VITE_* + release from secrets.
- **`deploy-api.yml`** — build & push image to **GHCR** (SHA + latest, gha cache) → **run migrations**
  using that image → **Railway** rolling redeploy (api + worker) → **health-gate** polling
  `/health/ready` for `"status":"ok"` (fails safe: platform keeps the previous image = rollback) →
  create **Sentry release** + source maps.

### 5. Prod infra + docs
- **`docker/docker-compose.prod.yml`** — self-hosted Mongo (RS) + Redis (password) + Qdrant (api key)
  + API + worker + one-shot migrate, env from `.env.prod`.
- **`docker/README.md`** — migration, production compose, hardening (auth/keyfile/secrets), and
  observability setup.
- **`.env.example`** — completed with rate-limit, OTel, Better Stack, Sentry release, and VITE_* keys.

## Design decisions
- **One API/worker image, two CMDs** — identical build, so the worker can't drift from the API; the
  platform picks the entrypoint. Matches the spec's "share the image, different entrypoints".
- **Migrations as a discrete, idempotent deploy step** (not on app boot) — indexes are created once,
  predictably, before traffic; re-running is safe. `autoIndex` stays off in prod for performance.
- **Everything observability is opt-in via env** — zero cost/noise locally and in tests; flip a single
  env var per concern to light it up. No SDKs in the hot path when unconfigured.
- **Health-gated cutover for rollback safety** — the deploy fails (and the platform retains the prior
  release) if `/health/ready` doesn't report `ok`, giving zero-downtime + a trivial rollback story.
- **Non-root, minimal images** — alpine + pruned prod deps + unprivileged users reduce attack surface and size.

## How to run / verify locally
```
docker compose -f docker/docker-compose.yml up -d mongo redis qdrant
make migrate                 # syncs indexes + bootstraps Qdrant (verified: 12 collections, exit 0)

pnpm typecheck               # green
pnpm lint                    # green (pre-existing fast-refresh warnings only)
pnpm build                   # all packages build (web bundles Sentry)
pnpm --filter @ai-projectos/api exec vitest run --coverage --no-file-parallelism  # 119 tests, gate passes

# Images (build in CI / a clean network):
docker build -f apps/api/Dockerfile -t ai-projectos-api .
docker build -f apps/web/Dockerfile --build-arg VITE_API_TARGET=https://api.example.com -t ai-projectos-web .
```

## Definition of Done checklist
- [x] Multi-stage Dockerfiles for api/worker + web; non-root; `HEALTHCHECK` on `/health/ready`.
- [x] CI blocks merge on red (TASK-14); `deploy-web` + `deploy-api` deploy on main.
- [x] Zero-downtime deploy (rolling + health gate) + documented rollback (redeploy previous image).
- [x] Errors → Sentry with `requestId`; traces → OTel (HTTP→service→Mongo/Redis); logs → Better Stack; all env-gated.
- [x] Idempotent migration runner (Mongo indexes + text indexes + Qdrant collection) — verified locally.
- [x] `.env.example` complete; rate limits + cache TTLs tunable via env.

## Known gaps / follow-ups
- **Not runnable in the dev sandbox:** Docker image builds (in-container pnpm install hits the corporate
  TLS proxy) and the Vercel/Railway/Sentry/Better Stack deploys (need accounts + secrets). These are
  authored to run in CI / a clean environment; the code paths they invoke (migrate, health, build) are
  verified locally.
- **Web main bundle ~796 kB** (Sentry adds weight) — a `manualChunks` split for vendor is a follow-up.
- **OTel patch timing:** `initOtel()` runs first in `main.ts`; for perfect auto-instrumentation coverage a
  `--require` preloader could be added, but the current ordering covers HTTP/Mongo/Redis in practice.
- **Prod Mongo auth/keyfile** is documented but left to the operator (the compose runs an open single-node RS for parity).
- AI-specific observability (`AIExecutions`) lands with TASK-16.

## Notes for the next agent
- Add a new env var: extend `apps/api/src/config/env.schema.ts` (fail-fast Zod) **and** `.env.example`.
- The migration runner is the place for future index/data migrations — add steps to `scripts/migrate.ts` (keep them idempotent).
- Observability is env-gated: set `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN`/`VITE_SENTRY_DSN`, `BETTER_STACK_SOURCE_TOKEN` to enable.
- Deploy secrets are listed at the top of each `deploy-*.yml`.
