.PHONY: help install dev start stop test migrate clean

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install
	cd web && npm install

dev: ## Start development server
	npm run dev

dev-web: ## Start web dashboard
	cd web && npm run dev

start: ## Start with Docker Compose
	docker-compose up -d
	@echo "Services started:"
	@echo "  - API: http://localhost:3010"
	@echo "  - Dashboard: http://localhost:3011"
	@echo "  - PostgreSQL: localhost:5432"

stop: ## Stop Docker Compose services
	docker-compose down

logs: ## Show logs
	docker-compose logs -f

migrate: ## Run database migrations
	psql $$DATABASE_URL -f database/migrations/147_experiments.sql

test: ## Run tests
	npm test

test-integration: ## Run integration tests
	npm run test:integration

clean: ## Clean up
	docker-compose down -v
	rm -rf node_modules web/node_modules dist

build: ## Build production
	npm run build
	cd web && npm run build

restart: ## Restart services
	docker-compose restart

ps: ## Show running containers
	docker-compose ps
