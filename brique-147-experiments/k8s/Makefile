.PHONY: help deploy deploy-staging deploy-prod migrate rollback scale logs shell

NAMESPACE ?= molam-pay
APP_NAME = molam-experiments
REGISTRY ?= ghcr.io/molam
IMAGE_TAG ?= latest

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

validate: ## Validate Kubernetes manifests
	@echo "🔍 Validating manifests..."
	kubectl apply --dry-run=client -f namespace.yaml
	kubectl apply --dry-run=client -f configmap.yaml
	kubectl apply --dry-run=client -f serviceaccount-rbac.yaml
	kubectl apply --dry-run=client -f service.yaml
	kubectl apply --dry-run=client -f deployment.yaml
	kubectl apply --dry-run=client -f hpa.yaml
	kubectl apply --dry-run=client -f pdb.yaml
	kubectl apply --dry-run=client -f ingress.yaml
	@echo "✅ All manifests valid"

deploy: validate ## Deploy all resources
	@echo "🚀 Deploying $(APP_NAME) to $(NAMESPACE)..."
	kubectl apply -f namespace.yaml
	kubectl apply -f configmap.yaml
	kubectl apply -f secret-template.yaml
	kubectl apply -f serviceaccount-rbac.yaml
	kubectl apply -f service.yaml
	kubectl apply -f deployment.yaml
	kubectl apply -f hpa.yaml
	kubectl apply -f pdb.yaml
	kubectl apply -f ingress.yaml
	kubectl apply -f servicemonitor.yaml
	@echo "✅ Deployment complete"

deploy-staging: ## Deploy to staging environment
	@$(MAKE) deploy NAMESPACE=molam-pay-staging IMAGE_TAG=develop-latest

deploy-prod: ## Deploy to production environment
	@echo "⚠️  Deploying to PRODUCTION!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(MAKE) deploy NAMESPACE=molam-pay IMAGE_TAG=main-latest; \
	else \
		echo "\n❌ Deployment cancelled"; \
	fi

migrate: ## Run database migrations
	@echo "🔄 Running database migrations..."
	kubectl apply -f db-migration-job.yaml
	kubectl wait --for=condition=complete --timeout=300s job/$(APP_NAME)-migrate -n $(NAMESPACE)
	kubectl logs -n $(NAMESPACE) job/$(APP_NAME)-migrate
	@echo "✅ Migration complete"

migrate-cleanup: ## Delete migration job
	kubectl delete job $(APP_NAME)-migrate -n $(NAMESPACE) --ignore-not-found=true

status: ## Show deployment status
	@echo "📊 Status for $(APP_NAME) in $(NAMESPACE):"
	@echo "\n=== Pods ==="
	kubectl get pods -n $(NAMESPACE) -l app=$(APP_NAME)
	@echo "\n=== Services ==="
	kubectl get svc -n $(NAMESPACE) $(APP_NAME)
	@echo "\n=== Ingress ==="
	kubectl get ingress -n $(NAMESPACE) $(APP_NAME)-ingress
	@echo "\n=== HPA ==="
	kubectl get hpa -n $(NAMESPACE) $(APP_NAME)-hpa

logs: ## Tail application logs
	kubectl logs -n $(NAMESPACE) -l app=$(APP_NAME) --tail=100 -f

logs-previous: ## Show previous pod logs (for crashed pods)
	kubectl logs -n $(NAMESPACE) -l app=$(APP_NAME) --previous --tail=100

events: ## Show recent events
	kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20

describe: ## Describe deployment
	kubectl describe deployment $(APP_NAME) -n $(NAMESPACE)

shell: ## Open shell in pod
	kubectl exec -it -n $(NAMESPACE) deployment/$(APP_NAME) -- sh

port-forward: ## Forward port 8080 to local
	kubectl port-forward -n $(NAMESPACE) deployment/$(APP_NAME) 8080:8080

restart: ## Restart deployment
	kubectl rollout restart deployment/$(APP_NAME) -n $(NAMESPACE)

rollback: ## Rollback to previous version
	@echo "⏮️  Rolling back $(APP_NAME)..."
	kubectl rollout undo deployment/$(APP_NAME) -n $(NAMESPACE)
	kubectl rollout status deployment/$(APP_NAME) -n $(NAMESPACE)
	@echo "✅ Rollback complete"

rollback-to: ## Rollback to specific revision (make rollback-to REVISION=3)
	@if [ -z "$(REVISION)" ]; then \
		echo "❌ Error: REVISION not set. Usage: make rollback-to REVISION=3"; \
		exit 1; \
	fi
	kubectl rollout undo deployment/$(APP_NAME) -n $(NAMESPACE) --to-revision=$(REVISION)
	kubectl rollout status deployment/$(APP_NAME) -n $(NAMESPACE)

history: ## Show rollout history
	kubectl rollout history deployment/$(APP_NAME) -n $(NAMESPACE)

scale: ## Scale deployment (make scale REPLICAS=5)
	@if [ -z "$(REPLICAS)" ]; then \
		echo "❌ Error: REPLICAS not set. Usage: make scale REPLICAS=5"; \
		exit 1; \
	fi
	kubectl scale deployment $(APP_NAME) -n $(NAMESPACE) --replicas=$(REPLICAS)

health: ## Check health endpoint
	@POD=$$(kubectl get pod -n $(NAMESPACE) -l app=$(APP_NAME) -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -n $(NAMESPACE) $$POD -- curl -s localhost:8080/healthz | jq .

metrics: ## Check metrics endpoint
	@POD=$$(kubectl get pod -n $(NAMESPACE) -l app=$(APP_NAME) -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -n $(NAMESPACE) $$POD -- curl -s localhost:8080/metrics

test-db: ## Test database connectivity
	@echo "🔍 Testing database connection..."
	kubectl run -it --rm pg-test --image=postgres:15-alpine --restart=Never -- \
		sh -c "echo 'SELECT version();' | psql \$$DATABASE_URL"

delete: ## Delete all resources
	@echo "⚠️  This will DELETE all resources!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		kubectl delete -f ingress.yaml --ignore-not-found=true; \
		kubectl delete -f pdb.yaml --ignore-not-found=true; \
		kubectl delete -f hpa.yaml --ignore-not-found=true; \
		kubectl delete -f deployment.yaml --ignore-not-found=true; \
		kubectl delete -f service.yaml --ignore-not-found=true; \
		kubectl delete -f serviceaccount-rbac.yaml --ignore-not-found=true; \
		kubectl delete -f configmap.yaml --ignore-not-found=true; \
		kubectl delete -f secret-template.yaml --ignore-not-found=true; \
		echo "✅ Resources deleted"; \
	else \
		echo "\n❌ Deletion cancelled"; \
	fi

top: ## Show resource usage
	kubectl top pods -n $(NAMESPACE) -l app=$(APP_NAME)

watch: ## Watch pods
	watch kubectl get pods -n $(NAMESPACE) -l app=$(APP_NAME)

exec: ## Execute command in pod (make exec CMD="ls -la")
	@if [ -z "$(CMD)" ]; then \
		echo "❌ Error: CMD not set. Usage: make exec CMD='ls -la'"; \
		exit 1; \
	fi
	@POD=$$(kubectl get pod -n $(NAMESPACE) -l app=$(APP_NAME) -o jsonpath='{.items[0].metadata.name}'); \
	kubectl exec -n $(NAMESPACE) $$POD -- $(CMD)

secret-create: ## Create secrets from .env file
	@if [ ! -f ../.env ]; then \
		echo "❌ Error: .env file not found"; \
		exit 1; \
	fi
	@echo "🔐 Creating secrets from .env..."
	kubectl create secret generic $(APP_NAME)-secrets \
		--namespace=$(NAMESPACE) \
		--from-env-file=../.env \
		--dry-run=client -o yaml | kubectl apply -f -
	@echo "✅ Secrets created"

secret-view: ## View secrets (base64 decoded)
	@echo "🔐 Current secrets:"
	kubectl get secret $(APP_NAME)-secrets -n $(NAMESPACE) -o json | \
		jq '.data | map_values(@base64d)'

config-view: ## View current config
	@echo "⚙️  Current configuration:"
	kubectl get configmap $(APP_NAME)-config -n $(NAMESPACE) -o yaml

ingress-url: ## Show ingress URL
	@echo "🌐 Ingress URLs:"
	@kubectl get ingress -n $(NAMESPACE) $(APP_NAME)-ingress -o jsonpath='{range .spec.rules[*]}{.host}{"\n"}{end}'
