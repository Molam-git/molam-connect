# ☸️  Molam Kubernetes Production Deployment

Complete Kubernetes manifests for deploying Molam Platform to production clusters.

## 📋 Overview

This directory contains production-ready Kubernetes manifests for deploying:

- **Molam ID** - Authentication & identity service
- **Notifications Center** - Multi-channel notifications (Email/SMS/Push)
- **Translation Service** - Multi-language translation with LibreTranslate
- **Supporting services** - PostgreSQL, Redis, LibreTranslate

## 🚀 Quick Start

### Prerequisites

- Kubernetes cluster 1.28+
- `kubectl` configured with cluster access
- cert-manager installed (for TLS certificates)
- Ingress controller (nginx recommended)
- Prometheus Operator (optional, for metrics)

### 1. Configure Secrets

⚠️ **CRITICAL**: Do NOT use `secrets-example.yaml` in production!

**Option A: Manual Secrets (Development)**
```bash
# Copy example and edit
cp secrets-example.yaml secrets.yaml
# Edit secrets.yaml with real values
kubectl apply -f secrets.yaml
```

**Option B: External Secrets (Production)**
```bash
# Install External Secrets Operator
helm install external-secrets external-secrets/external-secrets -n external-secrets-system

# Create SecretStore pointing to Vault/AWS Secrets Manager
kubectl apply -f external-secrets-config.yaml
```

### 2. Deploy Infrastructure

```bash
# Apply all manifests
kubectl apply -f namespace.yaml
kubectl apply -f sa-rbac.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml  # or your external secrets

# Deploy services
kubectl apply -f deployment-molam-id.yaml
kubectl apply -f deployment-notifications.yaml
kubectl apply -f deployment-translation.yaml

# Create services and ingress
kubectl apply -f services.yaml
kubectl apply -f ingress.yaml

# Apply autoscaling and reliability
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f network-policy.yaml

# (Optional) Prometheus monitoring
kubectl apply -f servicemonitor.yaml
```

### 3. Verify Deployment

```bash
# Check all pods are running
kubectl -n molam get pods

# Check services
kubectl -n molam get svc

# Check ingress
kubectl -n molam get ingress

# Check HPA status
kubectl -n molam get hpa

# View logs
kubectl -n molam logs -f deployment/molam-id
```

## 📁 File Structure

```
k8s/
├── namespace.yaml              # Molam namespace
├── sa-rbac.yaml               # Service accounts & RBAC
├── configmap.yaml             # Environment configuration
├── secrets-example.yaml       # Secret template (DO NOT USE IN PROD)
├── deployment-molam-id.yaml   # Molam ID deployment
├── deployment-notifications.yaml # Notifications service
├── deployment-translation.yaml   # Translation service
├── services.yaml              # Kubernetes services
├── ingress.yaml              # Ingress rules + TLS
├── hpa.yaml                  # Horizontal Pod Autoscalers
├── pdb.yaml                  # Pod Disruption Budgets
├── network-policy.yaml       # Network security policies
├── servicemonitor.yaml       # Prometheus ServiceMonitors
├── kustomization.yaml        # Kustomize configuration
└── README.md                 # This file
```

## 🔧 Configuration

### Environment Variables

Edit `configmap.yaml` to configure:

```yaml
NODE_ENV: "production"
APP_BASE_URL: "https://molam.com"
DEFAULT_LANG: "en"
DEFAULT_CURRENCY: "XOF"
LOG_LEVEL: "info"
```

### Secrets

Required secrets in `molam-secrets`:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_PRIVATE_KEY` - JWT signing private key
- `JWT_PUBLIC_KEY` - JWT verification public key
- `SMTP_*` - Email provider credentials
- `TWILIO_*` - SMS provider credentials
- `FIREBASE_SERVICE_ACCOUNT` - FCM credentials
- `REDIS_URL` - Redis connection string

### Resource Limits

Default resource allocation per service:

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| Molam ID | 200m | 1000m | 512Mi | 1Gi |
| Notifications API | 150m | 800m | 384Mi | 768Mi |
| Notifications Worker | 100m | 500m | 256Mi | 512Mi |
| Translation API | 150m | 700m | 384Mi | 768Mi |
| LibreTranslate | 500m | 2000m | 2Gi | 4Gi |

Adjust in deployment YAML files based on load testing results.

## 🔐 Security

### Network Policies

Network policies enforce:
- **Default deny all** ingress/egress
- **Allow from ingress** controller to backend services
- **Allow inter-service** communication
- **Allow database** access on port 5432
- **Allow Redis** access on port 6379
- **Allow external** HTTPS (443) and SMTP (587, 25)
- **Block metadata** service (169.254.169.254)

### Pod Security

All deployments enforce:
- `runAsNonRoot: true`
- `runAsUser: 1000`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- Drop all Linux capabilities

### TLS/HTTPS

Ingress configured with:
- cert-manager for automatic Let's Encrypt certificates
- Force SSL redirect
- CORS headers
- Rate limiting (100 req/s per IP)

## 📊 Monitoring

### Prometheus Metrics

ServiceMonitors scrape:
- `/metrics` endpoint every 15s
- Custom application metrics
- Node.js runtime metrics

### Key Metrics

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `molam_translation_requests_total` - Translation requests
- `molam_notification_sent_total` - Notifications sent
- `molam_auth_attempts_total` - Authentication attempts

### Grafana Dashboards

Import dashboards from:
- `monitoring/grafana-dashboards/molam-overview.json`
- `monitoring/grafana-dashboards/molam-id.json`
- `monitoring/grafana-dashboards/molam-notifications.json`

## 🔄 Autoscaling

### Horizontal Pod Autoscaler (HPA)

**Molam ID:**
- Min replicas: 3
- Max replicas: 10
- Target CPU: 60%
- Target Memory: 70%

**Notifications API:**
- Min replicas: 2
- Max replicas: 8
- Target CPU: 65%

**Translation API:**
- Min replicas: 2
- Max replicas: 6
- Target CPU: 70%

### Vertical Pod Autoscaler (VPA)

Install VPA for automatic resource recommendations:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml
```

## 🚨 Disaster Recovery

### Pod Disruption Budgets

PDBs ensure availability during:
- Node upgrades
- Cluster autoscaling
- Manual pod evictions

**Molam ID:** minAvailable=2 (always 2+ pods running)
**Notifications API:** minAvailable=1
**Translation API:** minAvailable=1

### Backup Strategy

**Database:**
```bash
# Automated daily backups via CronJob
kubectl apply -f cronjobs/postgres-backup.yaml
```

**Secrets:**
```bash
# Export secrets (encrypted)
kubectl -n molam get secrets molam-secrets -o yaml > secrets-backup-encrypted.yaml
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

Located at `.github/workflows/ci-cd-k8s.yaml`

**Triggers:**
- Push to `main` → Deploy to production
- Push to `develop` → Deploy to staging
- Pull request → Build and test only

**Pipeline Steps:**
1. Build Docker images
2. Push to GitHub Container Registry
3. Update Kubernetes deployments
4. Wait for rollout completion
5. Verify health checks
6. Notify on Slack

**Required Secrets:**
- `GITHUB_TOKEN` - Auto-provided
- `KUBECONFIG_PROD_B64` - Production cluster config (base64)
- `KUBECONFIG_STAGING_B64` - Staging cluster config (base64)

### Manual Deployment

```bash
# Deploy specific service
kubectl apply -f deployment-molam-id.yaml

# Update image
kubectl -n molam set image deployment/molam-id molam-id=ghcr.io/molam/molam-id:v1.2.3

# Rollback
kubectl -n molam rollout undo deployment/molam-id

# Check rollout status
kubectl -n molam rollout status deployment/molam-id
```

## 🧪 Testing

### Smoke Tests

```bash
# Test Molam ID API
curl -k https://id.molam.com/healthz

# Test Notifications API
curl -k https://notifications.molam.com/healthz

# Test Translation API
curl -k https://translate.molam.com/healthz
```

### Load Testing

```bash
# Install k6
kubectl apply -f tests/k6-load-test.yaml

# View results
kubectl -n molam logs -f job/k6-load-test
```

## 📈 Scaling Guide

### Scale Manually

```bash
# Scale up
kubectl -n molam scale deployment/molam-id --replicas=5

# Scale down
kubectl -n molam scale deployment/molam-id --replicas=2
```

### Cluster Autoscaling

Enable cluster autoscaler for automatic node provisioning:

```bash
# GKE
gcloud container clusters update CLUSTER_NAME --enable-autoscaling --min-nodes=3 --max-nodes=10

# EKS
eksctl scale nodegroup --cluster=CLUSTER_NAME --name=NODEGROUP_NAME --nodes=3 --nodes-min=3 --nodes-max=10
```

## 🛠️ Troubleshooting

### Pod Not Starting

```bash
# Describe pod
kubectl -n molam describe pod POD_NAME

# Check events
kubectl -n molam get events --sort-by='.lastTimestamp'

# Check logs
kubectl -n molam logs POD_NAME
```

### ImagePullBackOff

```bash
# Check image exists
docker pull ghcr.io/molam/molam-id:latest

# Check imagePullSecrets
kubectl -n molam get secrets
```

### CrashLoopBackOff

```bash
# Check previous logs
kubectl -n molam logs POD_NAME --previous

# Check resource limits
kubectl -n molam top pods
```

### Ingress Not Working

```bash
# Check ingress status
kubectl -n molam describe ingress molam-ingress

# Check ingress controller logs
kubectl -n ingress-nginx logs -f deployment/ingress-nginx-controller

# Test backend service directly
kubectl -n molam port-forward svc/molam-id 8080:80
curl http://localhost:8080/healthz
```

## 📞 Support

- **Slack**: #molam-devops
- **Runbooks**: https://docs.molam.com/runbooks/kubernetes
- **On-call**: PagerDuty escalation

---

**Last updated**: 2025-01-19
**Maintained by**: Platform Team
