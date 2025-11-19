# Deployment Guide - Brique 147 : A/B & Experiment Platform

## 📋 Overview

This guide covers deploying Molam Experiments to Kubernetes in staging and production environments.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Ingress (NGINX + TLS)                    │
│                  experiments.molam.io                       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Service (ClusterIP)                             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│         Deployment (2-12 replicas, HPA)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │  Pod 1   │  │  Pod 2   │  │  Pod N   │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│               PostgreSQL (Managed)                           │
│          + SIRA Service (Internal)                          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Option 1: Using deploy.sh script (Recommended)

```bash
# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Deploy without running migrations
./scripts/deploy.sh staging --skip-migration
```

### Option 2: Using Makefile

```bash
# From k8s/ directory
cd k8s

# Deploy to staging
make deploy-staging

# Deploy to production
make deploy-prod

# Just run migrations
make migrate
```

### Option 3: Using kubectl directly

```bash
cd k8s

# Apply all manifests
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret-template.yaml  # After filling with real values
kubectl apply -f serviceaccount-rbac.yaml
kubectl apply -f service.yaml
kubectl apply -f deployment.yaml
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f ingress.yaml
kubectl apply -f servicemonitor.yaml

# Run migrations
kubectl apply -f db-migration-job.yaml
```

### Option 4: GitHub Actions CI/CD (Automated)

```bash
# Push to develop → Auto-deploy to staging
git push origin develop

# Push to main → Deploy to production (requires approval)
git push origin main
```

## 📦 Prerequisites

### 1. Infrastructure

- [x] Kubernetes cluster 1.24+ (GKE, EKS, AKS, or self-hosted)
- [x] PostgreSQL database (managed service recommended)
- [x] Container registry (GHCR, ECR, GCR, ACR)
- [x] Load balancer / Ingress controller (NGINX recommended)

### 2. Tools

```bash
# Check versions
kubectl version --client
docker --version
helm version  # Optional, for Helm-based deployments

# Verify cluster access
kubectl cluster-info
kubectl get nodes
```

### 3. Secrets

Create production secrets (NEVER commit to git):

```bash
# Database URL
DATABASE_URL="postgresql://user:password@postgres-host.example.com:5432/molam?sslmode=require"

# Molam ID JWT Public Key (PEM format)
MOLAM_ID_PUBLIC_KEY="$(cat /path/to/molam-id-public.pem)"

# SIRA endpoint
SIRA_URL="http://sira-service.molam-ai.svc.cluster.local:4000"

# Optional: Sentry for error tracking
SENTRY_DSN="https://xxx@sentry.io/123"
```

## 🔐 Security Setup

### Option A: kubectl (Testing only)

```bash
kubectl create secret generic molam-experiments-secrets \
  --namespace=molam-pay \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=MOLAM_ID_PUBLIC_KEY="$MOLAM_ID_PUBLIC_KEY" \
  --from-literal=SIRA_URL="$SIRA_URL"
```

### Option B: External Secrets Operator (Production)

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Create SecretStore (Vault example)
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: molam-pay
spec:
  provider:
    vault:
      server: "https://vault.molam.io"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "molam-experiments"
EOF

# Create ExternalSecret
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: molam-experiments-secrets
  namespace: molam-pay
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: molam-experiments-secrets
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: molam/experiments/database-url
    - secretKey: MOLAM_ID_PUBLIC_KEY
      remoteRef:
        key: molam/id/public-key
    - secretKey: SIRA_URL
      remoteRef:
        key: molam/sira/url
EOF
```

### Option C: Sealed Secrets

```bash
# Install kubeseal
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
tar -xvzf kubeseal-0.24.0-linux-amd64.tar.gz
sudo install -m 755 kubeseal /usr/local/bin/kubeseal

# Create sealed secret
kubectl create secret generic molam-experiments-secrets \
  --namespace=molam-pay \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --dry-run=client -o yaml | \
  kubeseal --format=yaml > sealed-secret.yaml

# Apply sealed secret (safe to commit)
kubectl apply -f sealed-secret.yaml
```

## 🌐 Environment-Specific Configuration

### Staging

```yaml
# k8s-staging/kustomization.yaml
namespace: molam-pay-staging
images:
  - name: ghcr.io/molam/molam-experiments
    newTag: develop-latest
replicas:
  - name: molam-experiments
    count: 2
```

### Production

```yaml
# k8s-production/kustomization.yaml
namespace: molam-pay
images:
  - name: ghcr.io/molam/molam-experiments
    newTag: main-latest
replicas:
  - name: molam-experiments
    count: 3
```

## 📊 Monitoring Setup

### Prometheus + Grafana

```bash
# Install Prometheus Operator
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# Apply ServiceMonitor
kubectl apply -f k8s/servicemonitor.yaml

# Access Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Import dashboard from grafana/dashboard-experiments.json
```

### Alerts

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: molam-experiments-alerts
  namespace: molam-pay
spec:
  groups:
    - name: molam-experiments
      interval: 30s
      rules:
        - alert: ExperimentsHighErrorRate
          expr: rate(http_requests_total{status=~"5..",app="molam-experiments"}[5m]) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate detected"

        - alert: ExperimentsHighLatency
          expr: histogram_quantile(0.95, http_request_duration_seconds{app="molam-experiments"}) > 1
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High P95 latency detected"
```

## 🔄 Upgrade Strategy

### Rolling Update (Default)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # Max 1 extra pod during update
    maxUnavailable: 0  # Always keep at least minReplicas running
```

### Blue-Green Deployment

```bash
# 1. Deploy new version with different label
kubectl apply -f deployment-v2.yaml

# 2. Wait for new pods to be ready
kubectl wait --for=condition=ready pod -l version=v2

# 3. Update service selector
kubectl patch svc molam-experiments -p '{"spec":{"selector":{"version":"v2"}}}'

# 4. Delete old deployment
kubectl delete deployment molam-experiments-v1
```

### Canary Deployment (using Istio/Flagger)

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: molam-experiments
  namespace: molam-pay
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: molam-experiments
  progressDeadlineSeconds: 60
  service:
    port: 80
  analysis:
    interval: 1m
    threshold: 5
    maxWeight: 50
    stepWeight: 10
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99
      - name: request-duration
        thresholdRange:
          max: 500
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Pods not starting

```bash
# Check pod status
kubectl get pods -n molam-pay -l app=molam-experiments

# Describe pod
kubectl describe pod -n molam-pay <pod-name>

# Check logs
kubectl logs -n molam-pay <pod-name>

# Common fixes:
# - ImagePullBackOff: Check registry credentials
# - CrashLoopBackOff: Check DATABASE_URL and secrets
# - Pending: Check resource quotas
```

#### 2. Database connection errors

```bash
# Test database connectivity
kubectl run -it --rm pg-test --image=postgres:15-alpine --restart=Never -- \
  psql "$DATABASE_URL" -c "SELECT version();"

# Check network policies
kubectl get networkpolicies -n molam-pay

# Check if database allows connections from cluster
```

#### 3. Ingress not working

```bash
# Check ingress
kubectl get ingress -n molam-pay molam-experiments-ingress

# Describe ingress
kubectl describe ingress -n molam-pay molam-experiments-ingress

# Check TLS certificate
kubectl get certificate -n molam-pay

# Test from inside cluster
kubectl run -it --rm curl-test --image=curlimages/curl --restart=Never -- \
  curl -v http://molam-experiments.molam-pay.svc.cluster.local/healthz
```

## 📈 Scaling

### Horizontal Scaling (HPA)

```bash
# Check HPA status
kubectl get hpa -n molam-pay

# Manual scale
kubectl scale deployment molam-experiments -n molam-pay --replicas=10

# Update HPA limits
kubectl patch hpa molam-experiments-hpa -n molam-pay -p '{"spec":{"maxReplicas":20}}'
```

### Vertical Scaling (VPA)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: molam-experiments-vpa
  namespace: molam-pay
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: molam-experiments
  updatePolicy:
    updateMode: "Auto"
```

## 🔙 Rollback

```bash
# View rollout history
kubectl rollout history deployment/molam-experiments -n molam-pay

# Rollback to previous version
kubectl rollout undo deployment/molam-experiments -n molam-pay

# Rollback to specific revision
kubectl rollout undo deployment/molam-experiments -n molam-pay --to-revision=3

# Or use Makefile
cd k8s && make rollback
```

## ✅ Production Checklist

Before deploying to production:

- [ ] Secrets stored in Vault/KMS (not in git)
- [ ] PostgreSQL managed service provisioned
- [ ] TLS certificates configured (cert-manager)
- [ ] Prometheus + Grafana monitoring setup
- [ ] Alerting rules configured
- [ ] Backup strategy for database in place
- [ ] Disaster recovery plan documented
- [ ] Load testing completed
- [ ] Security scan passed (Trivy)
- [ ] RBAC policies reviewed
- [ ] Resource quotas and limits set
- [ ] PodDisruptionBudget configured
- [ ] Network policies reviewed
- [ ] Runbook updated
- [ ] Team trained on operations

## 📞 Support

- **Slack**: #molam-platform-ops
- **Email**: engineering@molam.io
- **On-call**: PagerDuty rotation
- **Runbook**: [RUNBOOK.md](RUNBOOK.md)
