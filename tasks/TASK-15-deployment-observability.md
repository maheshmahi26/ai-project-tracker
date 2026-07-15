# TASK-15 — Deployment & observability

- **Layer:** Human
- **Depends on:** TASK-14
- **Parallel with:** —
- **Size:** M–L

## Specs to read first
- [09 DevOps & Deployment](../specs/09-devops-deployment.md)

## Scope — in
- **Multi-stage Dockerfiles** for `api`, `worker`, and `web` (web-parity); non-root user; `HEALTHCHECK`.
- **CI/CD** GitHub Actions: `ci.yml` (typecheck/lint/test/build), `e2e.yml` (nightly/label), `deploy-web.yml` (Vercel), `deploy-api.yml` (build image → Railway → migration step → health-gated cutover).
- **Migration/bootstrap runner**: idempotent Mongo indexes + text indexes (Qdrant collection bootstrap is created here as a placeholder, populated in TASK-20).
- Provision docs for self-hosted **Mongo (RS) + Qdrant + Redis** containers in prod; secrets via platform managers; `.env.example` complete.
- **Observability live**: Sentry (FE+BE, source maps, releases), OpenTelemetry traces (HTTP→service→Mongo), Pino → Better Stack; `requestId` propagation verified end-to-end.
- Rate limits + cache TTLs tuned.

## Scope — out
- AI-specific observability (`AIExecutions`) lands with TASK-16.

## Deliverables
- Reproducible production deploy + working observability pipeline.

## Definition of Done
- [ ] `docker compose`/images build; containers run as non-root and pass healthchecks.
- [ ] CI blocks merge on red; deploy workflows deploy web + api on main.
- [ ] Zero-downtime deploy + documented rollback.
- [ ] Errors appear in Sentry with `requestId`; traces in OTel; logs in Better Stack.
- [ ] Smoke E2E passes against a prod-like preview.

## History requirement
Create `../history/TASK-15.md`: document image build, deploy pipeline, env/secrets inventory, migration runner, and observability wiring. Add CHANGELOG row.
