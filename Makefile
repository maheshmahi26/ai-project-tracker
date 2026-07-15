COMPOSE := docker compose -f docker/docker-compose.yml

.PHONY: help install up up-tools down stop logs ps reset seed dev api web build lint typecheck test format

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	pnpm install

up: ## Start local infra (mongo, redis, qdrant, minio)
	$(COMPOSE) up -d
	@echo "Mongo :27017  Redis :6379  Qdrant :6333 (dashboard /dashboard)  MinIO :9000 (console :9001)"

up-tools: ## Start infra + dev UIs (mongo-express, redis-insight)
	$(COMPOSE) --profile tools up -d

down: ## Stop and remove infra containers (keeps volumes)
	$(COMPOSE) down

stop: ## Stop infra containers without removing them
	$(COMPOSE) stop

logs: ## Tail infra logs
	$(COMPOSE) logs -f

ps: ## Show infra container status
	$(COMPOSE) ps

reset: ## DANGER: stop infra and delete all data volumes
	$(COMPOSE) down -v

seed: ## Seed the database with sample data (implemented in a later task)
	@echo "seed: not implemented yet (added in a later task)"

dev: ## Run api + web in watch mode
	pnpm dev

api: ## Run only the API in watch mode
	pnpm --filter @ai-projectos/api dev

web: ## Run only the web app in watch mode
	pnpm --filter @ai-projectos/web dev

build: ## Build all packages
	pnpm build

lint: ## Lint all packages
	pnpm lint

typecheck: ## Typecheck all packages
	pnpm typecheck

test: ## Run all tests
	pnpm test

format: ## Format the repo with Prettier
	pnpm format
