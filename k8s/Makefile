# Molam Kubernetes Deployment Makefile

.PHONY: help deploy deploy-staging deploy-prod verify clean

NAMESPACE := molam
KUBECTL := kubectl

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

deploy: ## Deploy all manifests to current context
	$(KUBECTL) apply -f namespace.yaml
	$(KUBECTL) apply -f sa-rbac.yaml
	$(KUBECTL) apply -f configmap.yaml
	$(KUBECTL) apply -f secrets-example.yaml
	$(KUBECTL) apply -f deployment-molam-id.yaml
	$(KUBECTL) apply -f deployment-notifications.yaml
	$(KUBECTL) apply -f deployment-translation.yaml
	$(KUBECTL) apply -f services.yaml
	$(KUBECTL) apply -f ingress.yaml
	$(KUBECTL) apply -f hpa.yaml
	$(KUBECTL) apply -f pdb.yaml
	$(KUBECTL) apply -f network-policy.yaml

deploy-kustomize: ## Deploy using Kustomize
	kustomize build . | $(KUBECTL) apply -f -

deploy-staging: ## Deploy to staging environment
	$(KUBECTL) config use-context staging
	$(MAKE) deploy

deploy-prod: ## Deploy to production environment
	$(KUBECTL) config use-context production
	$(MAKE) deploy

verify: ## Verify deployment
	$(KUBECTL) -n $(NAMESPACE) get pods
	$(KUBECTL) -n $(NAMESPACE) get svc
	$(KUBECTL) -n $(NAMESPACE) get ingress
	$(KUBECTL) -n $(NAMESPACE) get hpa

logs-id: ## Show Molam ID logs
	$(KUBECTL) -n $(NAMESPACE) logs -f deployment/molam-id

logs-notifications: ## Show Notifications logs
	$(KUBECTL) -n $(NAMESPACE) logs -f deployment/molam-notifications-api

logs-translation: ## Show Translation logs
	$(KUBECTL) -n $(NAMESPACE) logs -f deployment/molam-translation-api

scale-up: ## Scale all services up
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-id --replicas=5
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-notifications-api --replicas=4
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-translation-api --replicas=3

scale-down: ## Scale all services down
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-id --replicas=2
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-notifications-api --replicas=2
	$(KUBECTL) -n $(NAMESPACE) scale deployment/molam-translation-api --replicas=2

restart: ## Restart all deployments
	$(KUBECTL) -n $(NAMESPACE) rollout restart deployment/molam-id
	$(KUBECTL) -n $(NAMESPACE) rollout restart deployment/molam-notifications-api
	$(KUBECTL) -n $(NAMESPACE) rollout restart deployment/molam-translation-api

rollback-id: ## Rollback Molam ID deployment
	$(KUBECTL) -n $(NAMESPACE) rollout undo deployment/molam-id

rollback-notifications: ## Rollback Notifications deployment
	$(KUBECTL) -n $(NAMESPACE) rollout undo deployment/molam-notifications-api

status: ## Check rollout status
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/molam-id
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/molam-notifications-api
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/molam-translation-api

clean: ## Delete all resources
	$(KUBECTL) delete -f network-policy.yaml || true
	$(KUBECTL) delete -f pdb.yaml || true
	$(KUBECTL) delete -f hpa.yaml || true
	$(KUBECTL) delete -f ingress.yaml || true
	$(KUBECTL) delete -f services.yaml || true
	$(KUBECTL) delete -f deployment-translation.yaml || true
	$(KUBECTL) delete -f deployment-notifications.yaml || true
	$(KUBECTL) delete -f deployment-molam-id.yaml || true
	$(KUBECTL) delete -f secrets-example.yaml || true
	$(KUBECTL) delete -f configmap.yaml || true
	$(KUBECTL) delete -f sa-rbac.yaml || true
	$(KUBECTL) delete -f namespace.yaml || true

test-smoke: ## Run smoke tests
	@echo "Testing Molam ID..."
	@curl -sf https://id.molam.com/healthz || echo "❌ Molam ID health check failed"
	@echo "\nTesting Notifications API..."
	@curl -sf https://notifications.molam.com/healthz || echo "❌ Notifications health check failed"
	@echo "\nTesting Translation API..."
	@curl -sf https://translate.molam.com/healthz || echo "❌ Translation health check failed"

describe-pods: ## Describe all pods
	$(KUBECTL) -n $(NAMESPACE) describe pods

top: ## Show resource usage
	$(KUBECTL) -n $(NAMESPACE) top pods
	$(KUBECTL) -n $(NAMESPACE) top nodes

events: ## Show recent events
	$(KUBECTL) -n $(NAMESPACE) get events --sort-by='.lastTimestamp'
