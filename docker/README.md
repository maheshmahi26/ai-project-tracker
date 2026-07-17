# Local infrastructure (Docker Compose)

Everything AI ProjectOS needs to run locally — no cloud accounts required.

## Services

| Service | Port(s) | Purpose | URL / notes |
|---------|---------|---------|-------------|
| **mongo** | 27017 | Primary datastore, single-node **replica set** (`rs0`) so transactions work | `mongodb://localhost:27017/ai_projectos?replicaSet=rs0&directConnection=true` |
| **redis** | 6379 | Cache + BullMQ queue | `redis://localhost:6379` |
| **qdrant** | 6333 (http), 6334 (grpc) | Vector DB for RAG | dashboard: http://localhost:6333/dashboard |
| **minio** | 9000 (S3), 9001 (console) | S3-compatible object storage (files) | console: http://localhost:9001 (`minioadmin` / `minioadmin`) |
| **minio-setup** | — | one-shot: creates the `ai-projectos` bucket | exits after creating the bucket |
| **mongo-express** | 8081 | Mongo web UI (profile `tools`) | http://localhost:8081 |
| **redis-insight** | 5540 | Redis web UI (profile `tools`) | http://localhost:5540 |

## Commands (from repo root)

```bash
make up          # start mongo, redis, qdrant, minio
make up-tools    # also start the dev UIs (mongo-express, redis-insight)
make ps          # status
make logs        # tail logs
make down        # stop & remove containers (data volumes preserved)
make reset       # DANGER: also delete all data volumes (fresh start)
```

Or directly:

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml --profile tools up -d
```

## Notes

- **Replica set auto-init:** the `mongo` container's healthcheck runs `rs.initiate(...)` on first boot, then reports healthy. Wait until `make ps` shows mongo as `healthy` before starting the API.
- **Transactions:** the API connects with `directConnection=true`, which works with the single-node replica set and supports multi-document transactions.
- **Data persistence:** each service uses a named volume (`mongo-data`, `redis-data`, `qdrant-data`, `minio-data`). `make reset` wipes them.
- **Qdrant collection** (name/vector-size/distance) is bootstrapped by the migration runner (`make migrate`) and populated in TASK-20; the container just provides the engine.
- **Env:** copy `.env.example` → `.env` at the repo root; defaults already match this stack.

## Migrations / bootstrap

Idempotent step run before an app takes traffic (and locally):

```bash
make migrate     # builds shared+api, syncs Mongo indexes + text indexes, bootstraps the Qdrant collection
```

In production `autoIndex` is **off**, so this step is what creates indexes. It is safe to re-run.

## Production (self-hosted data tier + images)

`docker/docker-compose.prod.yml` runs the self-hosted **Mongo (RS) + Redis + Qdrant**
plus the **API** and **worker** built from `apps/api/Dockerfile` (same image, two
entrypoints). The web SPA ships to Vercel (or self-host via `apps/web/Dockerfile`).

```bash
# Secrets live in .env.prod (never committed) — see .env.example for keys.
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod run --rm migrate
```

Hardening notes for a real deployment:

- **Auth:** enable MongoDB auth + a replica-set keyfile; set `REDIS_PASSWORD`; set `QDRANT_API_KEY`.
- **Secrets** come from the platform's secret manager (Railway variables / Vercel env), not files.
- **Images** run as a non-root user and expose a `HEALTHCHECK` on `/health/ready` (API) — the
  platform uses it for health-gated, zero-downtime cutover; rollback = redeploy the previous image.
- **Files** use Cloudflare R2 / S3 in prod (MinIO is local only).

## Observability

- **Errors:** set `SENTRY_DSN` (API) / `VITE_SENTRY_DSN` (web); `SENTRY_RELEASE` (git SHA) ties
  errors + source maps to a build. Every API error carries its `requestId`.
- **Traces:** set `OTEL_EXPORTER_OTLP_ENDPOINT` to a collector; the API auto-instruments
  HTTP → Express → Mongo/Redis. No-op when unset.
- **Logs:** set `BETTER_STACK_SOURCE_TOKEN` to ship structured Pino logs to Better Stack;
  otherwise logs go to stdout (JSON in prod, pretty locally). Logs carry `requestId`.
