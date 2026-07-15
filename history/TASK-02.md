# TASK-02 — Local infrastructure (MongoDB RS + Redis + Qdrant + MinIO) & config

- **Status:** ✅ done (compose validated; full end-to-end boot pending `pnpm install` — see gaps)
- **Date:** 2026-07-15
- **Agent / chat:** initial setup chat
- **Branch / PR:** task/TASK-02-local-infra → (push via `refs/for/<branch>`)
- **Spec version built against:** specs/ as of 2026-07-15

## What was implemented
- **`docker/docker-compose.yml`** (project name `ai-projectos`):
  - **mongo** (`mongo:7`) started with `--replSet rs0 --bind_ip_all`; a **healthcheck self-initiates** the single-node replica set (`rs.initiate`) so transactions work locally. Volume `mongo-data`.
  - **redis** (`redis:7-alpine`) with `redis-cli ping` healthcheck. Volume `redis-data`.
  - **qdrant** (`qdrant/qdrant:v1.12.4`) ports 6333/6334. Volume `qdrant-data`.
  - **minio** (`minio/minio`) S3 :9000 / console :9001, health via `/minio/health/live`; **minio-setup** one-shot (`minio/mc`) creates the `ai-projectos` bucket. Volume `minio-data`.
  - Optional **dev UIs** behind `--profile tools`: `mongo-express` (:8081), `redis-insight` (:5540).
- **`.env.example`** — every key the app needs, defaults matching the compose stack (Mongo URI uses `?replicaSet=rs0&directConnection=true`; MinIO creds; JWT/mail/AI/observability placeholders).
- **Typed, fail-fast config in the API:**
  - `apps/api/src/config/env.schema.ts` — Zod `envSchema` + `validateEnv()` that throws a readable, aggregated error listing every invalid/missing var.
  - `apps/api/src/config/config.module.ts` — global `AppConfigModule` (wraps `@nestjs/config` with the Zod `validate` hook) + `AppConfigService` for typed access (`corsOrigins`, `isProduction`, `get(key)`).
  - Wired into `main.ts` (prefix, CORS from config, shutdown hooks) and `AppModule`.
- **`Makefile`** — `up`, `up-tools`, `down`, `stop`, `logs`, `ps`, `reset`, `seed` (stub), plus `dev`/`api`/`web`/`build`/`lint`/`typecheck`/`test`/`format` wrappers.
- **`docker/README.md`** — service/port table, commands, RS/transaction notes, reset instructions.

## Key decisions & deviations
- **MinIO added now** (not deferred to TASK-10). The user chose MinIO for local file storage, and it's infrastructure, so it belongs with the compose stack. The `StorageService` adapter + upload flow still land in TASK-10; this only provides the running S3-compatible server + bucket.
- **Mongo RS init via healthcheck** (rather than a separate init container) — self-contained and idempotent. The container only reports `healthy` once the RS is initiated, so `make ps` is the gate before starting the API.
- **`directConnection=true`** in the Mongo URI: correct for a single-node RS reached over `localhost`; avoids SDAM topology discovery issues while still supporting transactions.
- **Email transport defaults to `console`** per the user's choice; SMTP is optional via `SMTP_URL`.
- **Google OAuth intentionally omitted** from required env (email/password first, per user choice); Gemini keys are optional until the AI phase.

## How to run / verify locally
```bash
cp .env.example .env
make up                    # start mongo, redis, qdrant, minio
make ps                    # wait for mongo => "healthy"
# transaction sanity check:
docker exec aiprojectos-mongo mongosh --quiet --eval "rs.status().ok"

pnpm install && pnpm --filter @ai-projectos/api dev   # API boots; hit http://localhost:3000/api/v1/ping
```
Verified in this environment:
- ✅ `docker compose -f docker/docker-compose.yml config` valid.
- ✅ `env.schema.ts` logic reviewed (aggregated errors, coercions, defaults).
- ⛔ Full stack boot + API env validation NOT executed here (couldn't `pnpm install`; registry unreachable). Also not spun up Docker containers in this session.

## Tests added
- None (infra + config). Config-validation unit tests can be added in TASK-03 alongside the other cross-cutting tests.

## Definition of Done checklist
- [x] Compose defines mongo (RS self-init), redis, qdrant, minio (+ bucket), dev UIs — **config validated**
- [ ] `make up` → mongo healthy + transaction test passes — **pending Docker run by user**
- [ ] Qdrant + Redis reachable — **pending run**
- [x] Missing required env var → clear boot-time failure (`validateEnv` throws aggregated message)
- [x] `docker/README` documents start/stop/reset

## Known gaps / follow-ups
- User should run `make up` once and confirm mongo reaches `healthy` and the transaction eval returns `1`. If the healthcheck host mapping causes driver issues on any setup, fall back to a dedicated `mongo-init` one-shot service.
- Qdrant/MinIO images use `latest`/pinned tags; pin exact versions before production (TASK-15).
- Readiness endpoint that actually pings mongo/redis/qdrant is **TASK-03**.

## Notes for the next agent (TASK-03)
- Use `AppConfigService` for all env access (already global). Add new env keys to `env.schema.ts` **and** `.env.example` together.
- `/health/ready` in TASK-03 should check Mongo (`db.admin().ping`), Redis (`PING`), and Qdrant (`GET /readyz` or `/`), returning 503 until all are up.
- Mongoose connection string comes from `MONGODB_URI`; keep `directConnection=true` for local.
