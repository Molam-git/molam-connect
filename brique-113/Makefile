# Brique 113: SIRA Inference Service - Makefile

.PHONY: help install build test lint clean docker-build k8s-deploy

# Default target
.DEFAULT_GOAL := help

## help: Show this help message
help:
	@echo "SIRA Inference Service - Available Commands:"
	@echo ""
	@sed -n 's/^##//p' ${MAKEFILE_LIST} | column -t -s ':' | sed -e 's/^/ /'

## install: Install dependencies
install:
	npm install

## build: Build TypeScript
build:
	npm run build

## dev: Run in development mode
dev:
	npm run dev

## test: Run tests
test:
	npm test

## test-watch: Run tests in watch mode
test-watch:
	npm run test:watch

## test-coverage: Run tests with coverage
test-coverage:
	npm test -- --coverage

## lint: Lint TypeScript files
lint:
	npm run lint

## clean: Clean build artifacts
clean:
	rm -rf dist/ coverage/ node_modules/

## docker-build: Build Docker image
docker-build:
	docker build -t molam/sira-inference:latest .

## docker-run: Run Docker container locally
docker-run:
	docker run -p 8080:8080 \
		-e DATABASE_URL=${DATABASE_URL} \
		-e JWT_SECRET=${JWT_SECRET} \
		-e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
		-e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
		molam/sira-inference:latest

## k8s-apply: Apply Kubernetes manifests
k8s-apply:
	kubectl apply -f k8s/

## k8s-delete: Delete Kubernetes resources
k8s-delete:
	kubectl delete -f k8s/

## k8s-logs: Tail logs from all pods
k8s-logs:
	kubectl logs -n molam -l app=sira-inference -f --tail=50

## k8s-port-forward: Port-forward to service
k8s-port-forward:
	kubectl port-forward -n molam svc/sira-inference 8080:80

## db-migrate: Run database migration
db-migrate:
	psql -d ${DATABASE_URL} -f migrations/001_sira_inference.sql

## smoke-test: Run smoke tests
smoke-test:
	@echo "Running smoke tests..."
	@curl -s http://localhost:8080/healthz | jq
	@curl -s http://localhost:8080/readyz | jq
	@echo "Smoke tests complete!"

## all: Install, build, test
all: install build test

## ci: Continuous integration pipeline
ci: install lint build test-coverage
