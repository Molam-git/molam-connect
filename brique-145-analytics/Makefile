.PHONY: help install dev start stop logs test clean

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies for all services
	cd services/analytics-consumer && npm install
	cd services/analytics-api && npm install
	cd services/analytics-ws && npm install
	cd web && npm install

dev: ## Start all services in development mode
	docker-compose up -d clickhouse kafka zookeeper redis
	@echo "Waiting for services to be ready..."
	@sleep 10
	@echo "Starting consumer..."
	cd services/analytics-consumer && npm run dev &
	@echo "Starting API..."
	cd services/analytics-api && npm run dev &
	@echo "Starting WebSocket..."
	cd services/analytics-ws && npm run dev &
	@echo "Starting Dashboard..."
	cd web && npm run dev

start: ## Start all services with Docker Compose
	docker-compose up -d
	@echo "Services started. Access points:"
	@echo "  - ClickHouse: http://localhost:8123"
	@echo "  - Kafka: localhost:9092"
	@echo "  - Redis: localhost:6379"
	@echo "  - Analytics API: http://localhost:3002"
	@echo "  - WebSocket: http://localhost:3003"
	@echo "  - Dashboard: http://localhost:3004"

stop: ## Stop all services
	docker-compose down

logs: ## Show logs from all services
	docker-compose logs -f

logs-consumer: ## Show consumer logs
	docker-compose logs -f consumer

logs-api: ## Show API logs
	docker-compose logs -f api

logs-ws: ## Show WebSocket logs
	docker-compose logs -f ws

test: ## Run all tests
	cd services/analytics-consumer && npm test
	cd services/analytics-api && npm test

test-e2e: ## Run end-to-end tests
	@echo "Starting test environment..."
	docker-compose up -d
	@sleep 15
	cd tests && npm test
	docker-compose down

clean: ## Clean up containers and volumes
	docker-compose down -v
	rm -rf services/*/node_modules
	rm -rf web/node_modules
	rm -rf services/*/dist

build: ## Build all Docker images
	docker-compose build

restart: ## Restart all services
	docker-compose restart

ps: ## Show running containers
	docker-compose ps

clickhouse-cli: ## Open ClickHouse CLI
	docker exec -it molam_analytics_clickhouse clickhouse-client

kafka-topics: ## List Kafka topics
	docker exec -it molam_analytics_kafka kafka-topics --list --bootstrap-server localhost:9092

redis-cli: ## Open Redis CLI
	docker exec -it molam_analytics_redis redis-cli

backfill: ## Run backfill script (requires args: START_DATE END_DATE)
	@if [ -z "$(START_DATE)" ] || [ -z "$(END_DATE)" ]; then \
		echo "Usage: make backfill START_DATE=2024-01-01 END_DATE=2025-01-01"; \
		exit 1; \
	fi
	cd scripts && ts-node backfill.ts $(START_DATE) $(END_DATE)

grafana-dashboard: ## Import Grafana dashboard
	@echo "Import grafana/dashboard-analytics-overview.json to your Grafana instance"
	@echo "Dashboard URL: http://localhost:3000 (if Grafana is running locally)"
