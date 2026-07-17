# syntax=docker/dockerfile:1
#
# Multi-stage image for the API **and** the background worker — same image, two
# entrypoints (main.js vs worker.js), selected via CMD in the platform config.
#
# Build from the REPO ROOT so the pnpm workspace + lockfile are in context:
#   docker build -f apps/api/Dockerfile -t ai-projectos-api .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ── build: install the whole workspace (cached), build shared + api ───────────
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-projectos/api...
RUN pnpm --filter @ai-projectos/shared build \
    && pnpm --filter @ai-projectos/api build
# Produce a pruned, production-only deployment (dist + prod node_modules only).
RUN pnpm --filter=@ai-projectos/api deploy --prod /prod/api

# ── runtime: small, non-root ──────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# Run as an unprivileged user.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S -G nodejs nodejs
COPY --from=build --chown=nodejs:nodejs /prod/api/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /prod/api/dist ./dist
USER nodejs
EXPOSE 3000

# Liveness/readiness for the platform load balancer (readiness pings Mongo/Redis/Qdrant).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# API by default; the worker service overrides this with ["node","dist/worker.js"].
CMD ["node", "dist/main.js"]
