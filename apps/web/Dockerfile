# syntax=docker/dockerfile:1
#
# Web image for parity / self-hosting (in prod the SPA is deployed to Vercel).
# Builds static assets and serves them with an unprivileged nginx (SPA fallback).
#
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_TARGET=https://api.example.com -t ai-projectos-web .

FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# Baked into the static bundle at build time (only VITE_* is exposed to the browser).
ARG VITE_API_TARGET
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_RELEASE
ENV VITE_API_TARGET=$VITE_API_TARGET \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-projectos/web...
RUN pnpm --filter @ai-projectos/shared build \
    && pnpm --filter @ai-projectos/web build

# ── runtime: unprivileged nginx serving static assets ─────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
