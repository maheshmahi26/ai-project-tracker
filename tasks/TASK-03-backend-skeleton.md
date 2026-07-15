# TASK-03 — Backend skeleton & cross-cutting concerns

- **Layer:** Foundation
- **Depends on:** TASK-02
- **Parallel with:** TASK-04
- **Size:** M–L

## Specs to read first
- [02 Architecture](../specs/02-architecture.md) (module structure, request lifecycle)
- [04 API Design](../specs/04-api-design.md) (envelopes, error codes, versioning)

## Scope — in
- NestJS app in `apps/api`: `/api/v1` global prefix, versioning, Swagger at `/api/docs`.
- Config module (Zod-validated env from TASK-02), Pino logger with request-id.
- Global cross-cutting:
  - `AllExceptionsFilter` → standard error envelope + error codes.
  - `TransformInterceptor` → standard success/paginated envelope.
  - `ZodValidationPipe`.
  - request-id middleware, `LoggingInterceptor`, `TimeoutInterceptor`.
  - CORS allowlist + Helmet + Redis-backed rate limiter.
- Infra wiring: Mongoose connection, **base repository** (org-scoped filter + soft-delete query middleware), Redis module, BullMQ module, empty **worker** process entrypoint that boots.
- Pagination helpers (cursor + offset).
- `GET /health` (liveness) + `GET /health/ready` (checks Mongo, Redis, Qdrant reachable).
- Sentry + OpenTelemetry init (safe/no-op locally).

## Scope — out
- No auth/domain features (TASK-05+). No Qdrant business logic (just readiness ping).

## Deliverables
- Bootable API with Swagger, health endpoints, and all global providers.
- A trivial `GET /api/v1/ping` proving envelope + logging + error filter.

## Definition of Done
- [ ] `/health/ready` returns 200 only when Mongo/Redis/Qdrant reachable.
- [ ] Swagger renders at `/api/docs`.
- [ ] A thrown error returns the standard error envelope with `requestId`.
- [ ] A validation failure returns `VALIDATION_ERROR` with `details[]`.
- [ ] Rate limiter trips with `429` + `Retry-After`.
- [ ] Worker process boots and connects to Redis.
- [ ] Unit tests for filter/interceptor/pipe pass.

## History requirement
Create `../history/TASK-03.md`: document module layout, envelope shapes, how to add a feature module, and readiness-check behavior. Add CHANGELOG row.
