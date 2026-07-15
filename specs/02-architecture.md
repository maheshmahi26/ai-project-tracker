# 02 — System Architecture

## Guiding style: Clean Architecture + SOLID

Business rules must not depend on frameworks, databases, or the LLM. Dependencies point **inward**. NestJS, Mongoose, and Gemini are *details* at the edges.

```
        ┌───────────────────────────────────────────────┐
        │              Frameworks & Drivers               │  ← NestJS, Mongoose,
        │  Controllers · Mongo Repos · Gemini · R2 · Redis │    Gemini SDK, BullMQ
        ├───────────────────────────────────────────────┤
        │              Interface Adapters                  │  ← DTOs, Mappers,
        │   Controllers ↔ DTOs ↔ Presenters ↔ Repo impls   │    Repository impls
        ├───────────────────────────────────────────────┤
        │               Application (Use Cases)            │  ← Services, tool
        │   CreateTask, AssignTask, GenerateSprint, ...     │    handlers, ports
        ├───────────────────────────────────────────────┤
        │                   Domain (Entities)              │  ← Entities, value
        │   Task, Project, Sprint, User, Policy rules       │    objects, invariants
        └───────────────────────────────────────────────┘
```

**Key rule that ties the whole product together:** both the **UI controllers** and the **AI tools** call the *same* Application-layer use cases. The AI layer is just another client of the use cases — never a parallel implementation.

```
     REST Controller ─┐
                       ├─► Application Use Case ─► Domain ─► Repository Port ─► Mongo
     AI Tool Handler ─┘        (validation,           (invariants)   (impl detail)
                              authorization,
                              auditing live here)
```

## C4 — Level 1: System Context

```
        ┌─────────┐        ┌──────────────────────┐        ┌───────────────┐
        │  User    │──────►│     AI ProjectOS      │──────►│  Gemini API    │
        │ (browser)│◄──────│   (Web + API + AI)     │        └───────────────┘
        └─────────┘        └──────────┬───────────┘
                                       │
             ┌───────────────┬─────────┼──────────┬───────────────┐
             ▼               ▼         ▼          ▼               ▼
      MongoDB (local)  Redis          R2/S3   Google OAuth   Sentry/OTel/
      + Qdrant (vec)   (cache/queue)  (files)               Better Stack
```

## C4 — Level 2: Containers

```
┌──────────────┐    HTTPS/JSON     ┌───────────────────────────────────────┐
│  Web (Vercel) │ ────────────────►│  API (NestJS on Railway)               │
│  React 19     │  SSE (streaming) │                                        │
│  Vite         │◄────────────────►│  ┌─────────────┐  ┌─────────────────┐  │
└──────────────┘                   │  │ HTTP Layer   │  │ AI Layer         │  │
                                    │  │ Controllers  │  │ LangGraph agent  │  │
                                    │  │ Guards/Filters│ │ Tool registry    │  │
                                    │  └──────┬──────┘  └────────┬────────┘  │
                                    │         └──────┬───────────┘           │
                                    │          Application Use Cases          │
                                    │                │                        │
                                    │          Domain + Repository Ports      │
                                    │                │                        │
                                    │   ┌────────────┼─────────────┐          │
                                    │   ▼            ▼             ▼           │
                                    │ Mongo repos  Redis/BullMQ  Storage/AI    │
                                    └───┼────────────┼─────────────┼──────────┘
                                        ▼            ▼             ▼
                                 Mongo+Qdrant    Redis          R2 / Gemini
                                                                 Worker (BullMQ)
```

## Backend module structure (NestJS, feature-based)

```
apps/api/src/
├── main.ts                      # bootstrap, Swagger, OTel, Pino
├── app.module.ts
├── common/                      # cross-cutting
│   ├── guards/                  # JwtAuthGuard, RolesGuard, OrgGuard
│   ├── interceptors/            # Logging, Timeout, Transform, Cache
│   ├── filters/                 # AllExceptionsFilter (error envelope)
│   ├── decorators/              # @CurrentUser, @Roles, @Permissions
│   ├── pipes/                   # ZodValidationPipe
│   └── pagination/              # cursor + offset helpers
├── config/                      # typed config (env via Zod)
├── infra/                       # framework details
│   ├── database/                # Mongoose connection, schemas
│   ├── redis/ · queue/          # Redis + BullMQ setup
│   ├── storage/                 # R2/S3 adapter (StorageService port)
│   └── ai/                      # Gemini client, embeddings client
└── modules/                     # one folder per feature
    ├── auth/
    ├── users/
    ├── organizations/
    ├── projects/
    ├── sprints/
    ├── tasks/
    ├── comments/
    ├── labels/
    ├── files/
    ├── notifications/
    ├── activity/                # activity timeline + audit logs
    ├── dashboard/               # aggregations, reports
    ├── ai/                      # agent, tool registry, chat, executions
    └── rag/                     # documents, chunking, embeddings, retrieval
```

**Each feature module follows the same internal layout:**

```
tasks/
├── tasks.controller.ts          # HTTP (Interface Adapter)
├── tasks.service.ts             # Application use cases
├── tasks.repository.ts          # Repository impl (Interface Adapter)
├── tasks.repository.port.ts     # Port/interface (Application depends on this)
├── entities/task.entity.ts      # Domain entity + invariants
├── schemas/task.schema.ts       # Mongoose schema (Infra)
├── dto/                         # Zod schemas → DTOs (shared with packages/shared)
├── tasks.tools.ts               # AI tool handlers → call the SAME service
└── tasks.module.ts
```

## Patterns used (and why)

| Pattern | Where | Why |
|---------|-------|-----|
| **Repository** | `*.repository.port.ts` + impl | Swap Mongo without touching use cases; testable via fakes |
| **Dependency Injection** | NestJS providers | Inversion of control, easy mocking |
| **DTO + Mapper** | `dto/`, mappers | Decouple wire shape from domain/persistence |
| **Guards** | `JwtAuthGuard`, `RolesGuard`, `OrgGuard` | Declarative authN/authZ per route |
| **Interceptors** | logging, transform, cache | Cross-cutting concerns without polluting handlers |
| **Exception Filters** | `AllExceptionsFilter` | One consistent error envelope |
| **Ports & Adapters (Hexagonal)** | storage, AI, queue | Providers are swappable behind interfaces |
| **CQRS-lite** | read models for dashboard | Heavy aggregations separated from write path |
| **Strategy** | Passport strategies, storage provider | Interchangeable implementations |
| **Outbox-ish events** | activity/audit via events | Decouple side-effects (notifications, logs) from writes |

## Request lifecycle (write path example: create a task)

```
1. HTTP POST /api/v1/tasks            (or AI tool createTask)
2. JwtAuthGuard        → authenticate user, attach principal
3. OrgGuard            → verify user belongs to target org
4. RolesGuard          → verify permission "task:create"
5. ZodValidationPipe   → validate body against shared Zod schema
6. TasksController     → calls TasksService.create(dto, principal)
7. TasksService        → enforce domain invariants (Task entity)
8. TasksRepository     → persist via Mongoose (transaction if multi-doc)
9. EventEmitter        → emit task.created
      ├─ ActivityService  → ActivityLog + AuditLog
      ├─ NotificationsSvc → notify assignee (+ enqueue email job)
      └─ SearchIndexer    → maintain Mongo text index / Qdrant vectors
10. TransformInterceptor → wrap in success envelope
11. Response 201 { data: TaskDto }
```

The AI path is identical from step 6 onward — it enters at the service, so validation, authorization, invariants, and auditing are guaranteed regardless of entry point.

## How it scales

- **Stateless API** → horizontal scaling behind a load balancer; no sticky sessions (JWT + Redis for shared state).
- **Redis cache** for hot reads (dashboards, permission lookups) with short TTL + explicit invalidation on writes.
- **BullMQ workers** offload email, embedding generation, report building, and heavy AI generation from the request path.
- **Indexed + paginated queries** (cursor-based) prevent large scans; compound indexes per access pattern (see [DB spec](./03-database-schema.md)).
- **Read models** for dashboards precomputed/cached so charts don't hammer the write collections.
- **Provider ports** (storage/AI/queue) let us scale or swap infra pieces independently.

## Interview questions this section prepares you for

- How do you keep business logic independent of NestJS/Mongo/Gemini?
- How do you guarantee the AI can't bypass authorization or validation?
- Repository pattern vs. Active Record — trade-offs in a Mongo/Mongoose app?
- When would you introduce full CQRS/event sourcing vs. the CQRS-lite here?
- How do interceptors/guards/filters map to middleware in Express, and why prefer them?
