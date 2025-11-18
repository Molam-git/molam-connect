# =====================================================================
# Brique 81 — Billing Overages Makefile
# =====================================================================
# Common operations for development and deployment
# =====================================================================

.PHONY: help install build test lint format clean \
        docker-build docker-up docker-down docker-logs \
        db-migrate db-seed db-reset kafka-topics kafka-produce \
        dev dev-consumer dev-api dev-trends

# Default target
.DEFAULT_GOAL := help

# Colors for output
COLOR_RESET = \033[0m
COLOR_BOLD = \033[1m
COLOR_GREEN = \033[32m
COLOR_YELLOW = \033[33m
COLOR_BLUE = \033[34m

## help: Display this help message
help:
	@echo "$(COLOR_BOLD)Brique 81 — Billing Overages$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BLUE)Available targets:$(COLOR_RESET)"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /' | column -t -s ':'

## install: Install dependencies
install:
	@echo "$(COLOR_GREEN)Installing dependencies...$(COLOR_RESET)"
	npm install

## build: Build TypeScript
build:
	@echo "$(COLOR_GREEN)Building TypeScript...$(COLOR_RESET)"
	npm run build

## test: Run tests
test:
	@echo "$(COLOR_GREEN)Running tests...$(COLOR_RESET)"
	npm test

## test-watch: Run tests in watch mode
test-watch:
	@echo "$(COLOR_GREEN)Running tests in watch mode...$(COLOR_RESET)"
	npm run test:watch

## test-coverage: Run tests with coverage
test-coverage:
	@echo "$(COLOR_GREEN)Running tests with coverage...$(COLOR_RESET)"
	npm run test:coverage

## lint: Lint code
lint:
	@echo "$(COLOR_GREEN)Linting code...$(COLOR_RESET)"
	npm run lint

## format: Format code
format:
	@echo "$(COLOR_GREEN)Formatting code...$(COLOR_RESET)"
	npm run format

## clean: Clean build artifacts
clean:
	@echo "$(COLOR_GREEN)Cleaning build artifacts...$(COLOR_RESET)"
	rm -rf dist node_modules coverage

## docker-build: Build Docker image
docker-build:
	@echo "$(COLOR_GREEN)Building Docker image...$(COLOR_RESET)"
	docker build -t molam/brique-81:latest .

## docker-up: Start Docker Compose services
docker-up:
	@echo "$(COLOR_GREEN)Starting Docker Compose services...$(COLOR_RESET)"
	docker-compose up -d
	@echo "$(COLOR_YELLOW)Waiting for services to be healthy...$(COLOR_RESET)"
	sleep 10
	@echo "$(COLOR_GREEN)Services started!$(COLOR_RESET)"
	@echo "  - API: http://localhost:3000/api/overages/health"
	@echo "  - Kafka UI: http://localhost:8080"
	@echo "  - Grafana: http://localhost:3001 (admin/admin)"

## docker-down: Stop Docker Compose services
docker-down:
	@echo "$(COLOR_GREEN)Stopping Docker Compose services...$(COLOR_RESET)"
	docker-compose down

## docker-logs: View Docker Compose logs
docker-logs:
	docker-compose logs -f

## docker-logs-consumer: View consumer logs
docker-logs-consumer:
	docker-compose logs -f overage-consumer

## docker-logs-api: View API logs
docker-logs-api:
	docker-compose logs -f overage-api

## db-migrate: Run database migration
db-migrate:
	@echo "$(COLOR_GREEN)Running database migration...$(COLOR_RESET)"
	psql -U postgres -d molam_connect -f sql/010_billing_overages_schema.sql

## db-seed: Seed database (data already in schema)
db-seed:
	@echo "$(COLOR_GREEN)Seed data already included in schema$(COLOR_RESET)"

## db-reset: Reset database (drop and recreate)
db-reset:
	@echo "$(COLOR_YELLOW)WARNING: This will delete all data!$(COLOR_RESET)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		psql -U postgres -d molam_connect -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"; \
		$(MAKE) db-migrate; \
	fi

## kafka-topics: List Kafka topics
kafka-topics:
	@echo "$(COLOR_GREEN)Listing Kafka topics...$(COLOR_RESET)"
	docker exec brique81-kafka kafka-topics --bootstrap-server localhost:9092 --list

## kafka-create-topic: Create quota_exceeded topic
kafka-create-topic:
	@echo "$(COLOR_GREEN)Creating quota_exceeded topic...$(COLOR_RESET)"
	docker exec brique81-kafka kafka-topics --bootstrap-server localhost:9092 \
		--create --topic quota_exceeded --partitions 3 --replication-factor 1

## kafka-produce: Produce test event to Kafka
kafka-produce:
	@echo "$(COLOR_GREEN)Producing test event to Kafka...$(COLOR_RESET)"
	@echo '{"event_id":"test_'$$(date +%s)'","tenant_id":"123e4567-e89b-12d3-a456-426614174000","api_key_id":"test_key","plan_id":"free","country":"US","metric":"requests_per_day","quota_limit":10000,"units_exceeded":5000,"timestamp":"'$$(date -Iseconds)'"}' | \
	docker exec -i brique81-kafka kafka-console-producer --bootstrap-server localhost:9092 --topic quota_exceeded

## kafka-consume: Consume events from Kafka (for debugging)
kafka-consume:
	@echo "$(COLOR_GREEN)Consuming events from Kafka...$(COLOR_RESET)"
	docker exec -i brique81-kafka kafka-console-consumer --bootstrap-server localhost:9092 \
		--topic quota_exceeded --from-beginning

## dev: Start development environment
dev: docker-up
	@echo "$(COLOR_GREEN)Development environment ready!$(COLOR_RESET)"

## dev-consumer: Start consumer in development mode
dev-consumer:
	@echo "$(COLOR_GREEN)Starting consumer in development mode...$(COLOR_RESET)"
	npm run dev:consumer

## dev-api: Start API in development mode
dev-api:
	@echo "$(COLOR_GREEN)Starting API in development mode...$(COLOR_RESET)"
	npm run dev

## dev-trends: Run trend analysis
dev-trends:
	@echo "$(COLOR_GREEN)Running trend analysis...$(COLOR_RESET)"
	npm run start:trends

## dev-recommendations: Generate plan recommendations
dev-recommendations:
	@echo "$(COLOR_GREEN)Generating plan recommendations...$(COLOR_RESET)"
	npm run start:recommendations

## health-check: Check service health
health-check:
	@echo "$(COLOR_GREEN)Checking service health...$(COLOR_RESET)"
	@curl -s http://localhost:3000/api/overages/health | jq .

## metrics: View Prometheus metrics
metrics:
	@echo "$(COLOR_GREEN)Fetching Prometheus metrics...$(COLOR_RESET)"
	@curl -s http://localhost:9090/metrics

## ps: Show running containers
ps:
	@docker-compose ps

## logs-tail: Tail all logs
logs-tail:
	@docker-compose logs -f --tail=100

## restart: Restart services
restart:
	@echo "$(COLOR_GREEN)Restarting services...$(COLOR_RESET)"
	docker-compose restart

## stop: Stop services without removing
stop:
	@echo "$(COLOR_GREEN)Stopping services...$(COLOR_RESET)"
	docker-compose stop

## start: Start stopped services
start:
	@echo "$(COLOR_GREEN)Starting services...$(COLOR_RESET)"
	docker-compose start

## shell-consumer: Open shell in consumer container
shell-consumer:
	docker exec -it brique81-consumer sh

## shell-api: Open shell in API container
shell-api:
	docker exec -it brique81-api sh

## shell-postgres: Open psql in postgres container
shell-postgres:
	docker exec -it brique81-postgres psql -U postgres -d molam_connect

## shell-kafka: Open shell in kafka container
shell-kafka:
	docker exec -it brique81-kafka sh

## all: Install, build, test
all: install build test
	@echo "$(COLOR_GREEN)All tasks completed!$(COLOR_RESET)"
