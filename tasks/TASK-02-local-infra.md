# TASK-02 — Local infrastructure (MongoDB RS + Redis + Qdrant) & config

- **Layer:** Foundation
- **Depends on:** TASK-01
- **Parallel with:** —
- **Size:** M

## Specs to read first
- [09 DevOps → "Local development (Docker Compose)"](../specs/09-devops-deployment.md)
- [01 Tech Stack → "Database & Search"](../specs/01-tech-stack.md)
- [03 Database Schema → "Transactions"](../specs/03-database-schema.md)

## Scope — in
- `docker/docker-compose.yml` bringing up:
  - **mongo** as a **single-node replica set** (init script so transactions work locally).
  - **redis** (cache + BullMQ).
  - **qdrant** (ports 6333 http / 6334 grpc, named volume).
  - optional dev UIs (mongo-express, redis-insight) behind a compose profile.
- Healthchecks + named volumes for persistence.
- `.env.example` with every key (Mongo URI incl. `?replicaSet=rs0`, Redis URL, Qdrant URL/API key, JWT secrets, Google OAuth, R2, Gemini, Sentry/OTel) — **no real secrets**.
- Typed config loading (Zod) skeleton in `apps/api` that validates env at boot and fails fast.
- Makefile / npm scripts: `make up`, `make down`, `make logs`, `make seed` (seed stub).

## Scope — out
- No Nest modules/features (TASK-03+). No Qdrant collection bootstrap logic beyond documenting it (real bootstrap lands in TASK-20).

## Deliverables
- Compose stack that boots cleanly; Mongo reachable as a replica set; Qdrant dashboard reachable at `http://localhost:6333/dashboard`.
- `.env.example` + config validation.

## Definition of Done
- [ ] `make up` starts mongo (RS initialized), redis, qdrant with healthy status.
- [ ] A quick transaction test against Mongo succeeds (proves replica set).
- [ ] Qdrant reachable; Redis reachable.
- [ ] Missing required env var causes a clear boot-time failure.
- [ ] Documented in `docker/README` how to start/stop/reset volumes.

## History requirement
Create `../history/TASK-02.md`: record ports, connection strings, RS init approach, Qdrant version, and reset instructions. Add CHANGELOG row.
