# Molam Notifications Center — Makefile

.PHONY: help install migrate dev worker test docker-up docker-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	cd backend && npm install

migrate: ## Run database migrations
	cd backend && npm run migrate

dev: ## Start API server in development mode
	cd backend && npm run dev

worker: ## Start dispatch worker
	cd backend && npm run worker

test: ## Run tests
	cd backend && npm test

docker-up: ## Start all services with Docker Compose
	docker-compose up --build

docker-down: ## Stop all services
	docker-compose down

docker-logs: ## Show Docker logs
	docker-compose logs -f

clean: ## Clean build artifacts
	cd backend && rm -rf node_modules dist
	docker-compose down -v

stats: ## Show notification stats
	psql $$DATABASE_URL -c "SELECT status, COUNT(*) FROM notifications GROUP BY status;"

dlq: ## List quarantined notifications
	psql $$DATABASE_URL -c "SELECT id, type, last_error FROM notifications WHERE status='quarantined' LIMIT 20;"

requeue-all: ## Requeue all DLQ notifications
	psql $$DATABASE_URL -c "UPDATE notifications SET status='pending', attempts=0, next_attempt_at=now() WHERE status='quarantined';"
