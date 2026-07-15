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
- **Qdrant collection** (name/vector-size/distance) is created by the API on boot in a later task (TASK-20); the container just provides the engine.
- **Env:** copy `.env.example` → `.env` at the repo root; defaults already match this stack.
