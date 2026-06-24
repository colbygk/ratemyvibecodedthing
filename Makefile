# Docker-only local dev + testing. No host Node/npm required — just Docker.
# See docs/DOCKER.md for details.

COMPOSE = docker compose

.PHONY: help dev down logs build test test-web test-api e2e clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

dev: ## Run the full dev stack (web on :5173, api on :8787) with live reload
	$(COMPOSE) --profile dev up

down: ## Stop everything and remove volumes (fresh slate)
	$(COMPOSE) --profile dev --profile e2e --profile unit down -v

logs: ## Tail logs of the running stack
	$(COMPOSE) logs -f

build: ## Build all images
	$(COMPOSE) --profile dev --profile e2e --profile unit build

test: test-api test-web ## Run all unit tests in Docker

test-web: ## Run web unit tests (vitest) in Docker
	$(COMPOSE) run --rm web-unit

test-api: ## Run api unit tests (vitest) in Docker
	$(COMPOSE) run --rm api-unit

e2e: ## Bring up the stack and run Playwright system tests, then exit
	$(COMPOSE) --profile e2e up \
		--build --abort-on-container-exit --exit-code-from playwright
	@$(COMPOSE) --profile e2e down

clean: down ## Alias for down (tear down + remove volumes)
