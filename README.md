# AI ProjectOS

AI-native project management SaaS. Every operation is possible **two ways**: a modern UI **and** an AI chat interface backed by audited backend tool-calling.

> **Status:** early build. Foundation (monorepo + local infra) is scaffolded. See [`specs/`](./specs/) for the full design and [`tasks/`](./tasks/) for the phased build plan (human layer first, AI layer last). Progress is logged in [`history/`](./history/).

## Tech stack (summary)

- **Frontend:** React 19 · Vite · TypeScript · (Tailwind + shadcn/ui land in TASK-04)
- **Backend:** NestJS · TypeScript · MongoDB (Mongoose) · Redis · BullMQ
- **Data:** self-hosted **MongoDB** (single-node replica set) · **Qdrant** (vectors/RAG) · **Redis** · **MinIO** (files, S3-compatible)
- **AI (later phases):** Gemini 2.5 Flash · LangGraphJS · tool-calling · RAG
- **Monorepo:** pnpm workspaces + Turborepo

## Prerequisites

- **Node 20+** (`.nvmrc` pins 20)
- **pnpm 9+** (`corepack enable` then `corepack prepare pnpm@9 --activate`, or install pnpm directly)
- **Docker** + Docker Compose

## Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env        # defaults already match the local Docker stack

# 3. Start local infrastructure (mongo replica set, redis, qdrant, minio)
make up                     # wait until `make ps` shows mongo "healthy"

# 4. Run the apps (in another terminal)
pnpm dev                    # api on :3000, web on :5173
```

Then open http://localhost:5173 — the page pings the API at `/api/v1/ping`.

## Common commands

```bash
pnpm dev          # run api + web (watch)
pnpm build        # build all workspaces
pnpm typecheck    # typecheck all
pnpm lint         # lint all
pnpm test         # test all
make up / down    # start / stop local infra   (see docker/README.md)
make reset        # wipe local data volumes
```

## Repository layout

```
apps/
  api/         NestJS backend
  web/         React + Vite frontend
packages/
  shared/      Zod schemas + types shared across api, web, and AI tools
  config/      shared ESLint / tooling presets
docker/        local infra (Mongo RS, Redis, Qdrant, MinIO)
specs/         design & architecture (source of truth)
tasks/         per-agent build work packages (TASK-01 … TASK-22)
history/       durable build log
```

## Documentation

- Design & architecture: [`specs/`](./specs/) (start at [`specs/README.md`](./specs/README.md))
- Build plan & workflow: [`specs/12-execution-plan.md`](./specs/12-execution-plan.md) and [`tasks/`](./tasks/)
