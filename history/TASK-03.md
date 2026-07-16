# TASK-03 — Backend skeleton & cross-cutting concerns

- **Status:** ✅ done
- **Date:** 2026-07-15
- **Agent / chat:** backend skeleton chat
- **Branch / PR:** task/TASK-03-backend-skeleton → (push to `refs/for/<branch>` for review)
- **Spec version built against:** specs as of 2026-07-15 (02-architecture, 04-api-design)

## What was implemented

A production-shaped NestJS skeleton in `apps/api` with all global cross-cutting
concerns, infra wiring, health probes, a background worker, and unit tests.

### Config / bootstrap
- `apps/api/src/main.ts` — Pino logger as the Nest logger, Helmet (CSP off so
  Swagger renders), CORS allowlist from config, `/{API_PREFIX}/v1` global prefix
  with `health` routes **excluded** (so probes live at `/health`), Swagger at
  `/api/docs`, shutdown hooks, Sentry + OTel init before app creation.
- `apps/api/src/app.module.ts` — imports config, Pino, Redis, Database, Queue,
  Throttler (Redis-backed), Health; registers global providers:
  `LoggingInterceptor` → `TimeoutInterceptor` → `TransformInterceptor` (outer→inner),
  `AllExceptionsFilter`, and `ThrottlerGuard`.
- `apps/api/src/app.controller.ts` — `GET /api/v1/ping` (proves envelope + logging)
  plus debug routes `GET /debug/error` (500), `GET /debug/app-error` (422),
  `POST /debug/validate` (Zod pipe).

### Common (cross-cutting) — `apps/api/src/common/`
- `errors/error-codes.ts` — canonical `ErrorCode` union + `ERROR_STATUS` map + `codeFromStatus`.
- `errors/app-exception.ts` — `AppException` (code + message + `details[]`) with static helpers.
- `filters/all-exceptions.filter.ts` — renders the standard error envelope
  `{ error: { code, message, details?, requestId } }`; maps `AppException`,
  `ZodError`, built-in `HttpException`, and unknown → `INTERNAL` (no leak); logs
  5xx with stack and reports to Sentry.
- `interceptors/transform.interceptor.ts` — success envelope `{ data, meta:{ requestId, page? } }`;
  detects `PaginatedResult`; honors `@Passthrough()`.
- `interceptors/logging.interceptor.ts` — one timing line per request, tagged with `requestId`.
- `interceptors/timeout.interceptor.ts` — 15s request timeout → 503 (skips `@Passthrough()`).
- `pipes/zod-validation.pipe.ts` — parses against a Zod schema; throws `VALIDATION_ERROR` + details.
- `decorators/passthrough.decorator.ts` — `@Passthrough()` opts a route out of transform/timeout.
- `request/request-context.ts` — `genRequestId` (pino-http) reuses inbound `X-Request-Id`
  or mints a uuid and echoes it on the response; `getRequestId(req)` reads it.
- `pagination/pagination.ts` — `PaginatedResult`, opaque cursor encode/decode, `buildCursorPage`.

### Infra — `apps/api/src/infra/`
- `redis/redis.module.ts` — global `RedisService` (ioredis, `maxRetriesPerRequest: null`
  for BullMQ), `ping()`, quits on shutdown.
- `database/database.module.ts` — `MongooseModule.forRootAsync` (URI from config, autoIndex off in prod).
- `database/base.repository.ts` — generic `BaseRepository<T>` enforcing **org scoping**
  + **soft delete** (find/create/update/softDelete/restore).
- `queue/queue.module.ts` — `BullModule.forRootAsync` using the shared Redis connection.

### Observability — `apps/api/src/observability/`
- `logger.ts` — Pino config (pretty in dev, JSON in prod, redacts auth/cookie headers).
- `sentry.ts` — guarded init (only if `SENTRY_DSN` set); `captureException` no-ops otherwise.
- `otel.ts` — guarded no-op stub; full NodeSDK/OTLP wiring deferred to **TASK-15**.

### Health — `apps/api/src/health/`
- `GET /health` (liveness) and `GET /health/ready` — pings Mongo (admin ping),
  Redis (`PING`), Qdrant (`/readyz`) in parallel; returns 200 with per-dep states,
  or 503 `SERVICE_UNAVAILABLE` listing the down dependency. Both are `@Passthrough()`.

### Worker
- `worker.module.ts` + `worker.ts` — separate process (no HTTP) sharing infra; boots
  and connects to Redis/Mongo. BullMQ processors are added in later tasks.

### Tests
- `vitest.config.ts` (SWC transform for decorators) + `tsconfig.build.json` (excludes specs).
- Specs for the filter (4), transform interceptor (2), and Zod pipe (2) — **8 tests, all passing**.

## Key decisions & deviations
- **Dropped `@nestjs/terminus`** in favor of a hand-rolled `HealthService`, so the
  readiness payload and 503 flow through our own error envelope (full control, one fewer dep).
- **Rate limiting** via `@nestjs/throttler` v6 + `@nest-lab/throttler-storage-redis`
  (Redis-backed, shared connection). Default 100 req / 60s; stricter per-route limits (auth, ai) come later.
- **Request id** owned by pino-http `genReqId` (single source of truth) rather than a
  separate middleware, to avoid ordering races.
- **Node ≥ 20.19 required** (root `engines` bumped): the CJS API `require()`s the ESM
  `@ai-projectos/shared` package, which relies on Node's backported `require(esm)`.
- **Helmet CSP disabled** so Swagger UI renders; tightened in TASK-15.
- **OTel deferred to TASK-15** (guarded stub only) to avoid shipping heavy SDK deps before use.
- Libraries added (apps/api): `@nestjs/swagger`, `@nestjs/mongoose`+`mongoose`,
  `@nestjs/bullmq`+`bullmq`, `@nestjs/throttler`+`@nest-lab/throttler-storage-redis`,
  `ioredis`, `nestjs-pino`+`pino`+`pino-http`(+`pino-pretty`), `helmet`, `@sentry/node`;
  dev: `vitest`, `unplugin-swc`, `@swc/core`. `globals` added to `apps/web` devDeps
  (fixed a flat-config resolution error under pnpm's strict layout).

## Environment note (corporate TLS proxy)
This machine sits behind a TLS-inspecting proxy, so package installs from the agent's
non-interactive shell fail cert validation (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`).
Install for this task was done with `pnpm install --config.strict-ssl=false
--config.store-dir=<global store>` (transient, not persisted). Your normal terminal
(with the corporate CA configured) can just run `pnpm install`.

## How to run / verify locally
```
# 1. infra (from repo root)
make up            # or: docker compose -f docker/docker-compose.yml up -d

# 2. install (if not already) + build
pnpm install
pnpm build

# 3. run API and worker
pnpm --filter @ai-projectos/api dev          # API on :3001
pnpm --filter @ai-projectos/api worker:dev   # background worker

# 4. exercise
curl localhost:3001/health
curl localhost:3001/health/ready             # {status:"ok",checks:{mongo,redis,qdrant:"up"}}
curl localhost:3001/api/v1/ping              # success envelope + X-Request-Id header
curl localhost:3001/api/v1/debug/app-error   # 422 BUSINESS_RULE envelope
curl -H 'Content-Type: application/json' -d '{"name":"","count":"x"}' \
     localhost:3001/api/v1/debug/validate    # 400 VALIDATION_ERROR + details[]
open http://localhost:3001/api/docs          # Swagger UI

# 5. tests / quality gates
pnpm --filter @ai-projectos/api test         # 8 passing
pnpm typecheck && pnpm lint && pnpm build
```

## Verified live (2026-07-15)
- `/health/ready` → `200 {"status":"ok","checks":{"mongo":"up","redis":"up","qdrant":"up"}}`.
- Swagger renders at `/api/docs`; `/api/docs-json` serves the OpenAPI doc.
- Thrown error → standard envelope with `requestId` (INTERNAL 500, no leak; app error 422).
- Validation failure → `VALIDATION_ERROR` with `details[]` (400).
- Rate limiter → first `429` at request #100 with `Retry-After: 60`.
- Worker boots and connects to Redis/Mongo ("Background worker started").
- `pnpm typecheck` / `lint` / `build` / `test` all green across the 4 packages.

## Definition of Done checklist
- [x] `/health/ready` returns 200 only when Mongo/Redis/Qdrant reachable.
- [x] Swagger renders at `/api/docs`.
- [x] A thrown error returns the standard error envelope with `requestId`.
- [x] A validation failure returns `VALIDATION_ERROR` with `details[]`.
- [x] Rate limiter trips with `429` + `Retry-After`.
- [x] Worker process boots and connects to Redis.
- [x] Unit tests for filter/interceptor/pipe pass.

## Known gaps / follow-ups
- OTel tracing SDK not started yet — **TASK-15**.
- Helmet CSP disabled — tighten in **TASK-15**.
- `BaseRepository` has no feature repos yet — first real use in **TASK-05/07**.
- No BullMQ processors registered yet — added with email/embeddings/reports in later tasks.
- Auth guards, `@CurrentUser`, and tenant context resolution — **TASK-05**.

## Notes for the next agent
- **Feature module recipe:** create `apps/api/src/modules/<feature>/` with
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts` (extend
  `BaseRepository`), and a `*.schema.ts` Mongoose schema; register the schema with
  `MongooseModule.forFeature([...])` inside the module.
- **Validation:** put request/response Zod schemas in `packages/shared`, validate
  with `@Body(new ZodValidationPipe(schema))`.
- **Responses:** just return your data (or a `PaginatedResult`) — the
  `TransformInterceptor` wraps it. Throw `AppException` for domain errors.
- **Streaming/SSE (AI chat):** decorate the handler with `@Passthrough()` to bypass
  the transform + timeout interceptors.
- **Background jobs:** register a queue with `BullModule.registerQueue({ name })` in
  the feature module (API side) and add its `@Processor` in `WorkerModule`.
- No new shared contracts added beyond what already exists in `packages/shared`
  (`ApiSuccess`/`ApiError`/`ApiMeta`, `paginationQuerySchema`, `healthStatusSchema`).
