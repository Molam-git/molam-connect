# Kubernetes Deployment Guide - Molam Experiments

## Prerequisites

- Kubernetes cluster 1.24+
- kubectl configured
- PostgreSQL database (managed service recommended)
- Container registry access (GHCR, ECR, GCR)
- cert-manager installed (for TLS)
- Prometheus Operator (optional, for ServiceMonitor)

## Quick Start

### 1. Setup Secrets

**⚠️ NEVER commit real secrets to git!**

Use one of these methods:

#### Option A: kubectl (for testing only)

```bash
kubectl create secret generic molam-experiments-secrets \
  --namespace=molam-pay \
  --from-literal=DATABASE_URL="postgresql://user:password@host:5432/molam" \
  --from-literal=MOLAM_ID_PUBLIC_KEY="$(cat molam-id-public.pem)" \
  --from-literal=SIRA_URL="http://sira-service.molam-ai.svc.cluster.local:4000"
```

#### Option B: External Secrets Operator (recommended for production)

```yaml
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
```

#### Option C: Sealed Secrets

```bash
# Create sealed secret
kubeseal --format=yaml < secret.yaml > sealed-secret.yaml
kubectl apply -f sealed-secret.yaml
```

### 2. Deploy Application

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply all manifests
kubectl apply -f k8s/

# OR apply in order
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/serviceaccount-rbac.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/servicemonitor.yaml

# Run database migrations
kubectl apply -f k8s/db-migration-job.yaml
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n molam-pay -l app=molam-experiments

# Check services
kubectl get svc -n molam-pay molam-experiments

# Check ingress
kubectl get ingress -n molam-pay

# View logs
kubectl logs -n molam-pay -l app=molam-experiments --tail=100 -f

# Check health
kubectl exec -it -n molam-pay deployment/molam-experiments -- curl localhost:8080/healthz
```

## Configuration

### ConfigMap

Edit [configmap.yaml](configmap.yaml) to customize:

- `LOG_LEVEL`: info, debug, warn, error
- `DATABASE_POOL_MAX`: Connection pool size
- `CORS_ORIGIN`: Allowed origins
- `BANDIT_STOP_THRESHOLD`: Thompson Sampling threshold (0-1)

### Secrets

Required secrets:
- `DATABASE_URL`: PostgreSQL connection string
- `MOLAM_ID_PUBLIC_KEY`: JWT public key (PEM format)
- `SIRA_URL`: SIRA service endpoint

Optional secrets:
- `SENTRY_DSN`: Error tracking
- `KMS_KEY_URI`: For runtime decryption

### Resources

Default requests/limits:

```yaml
requests:
  cpu: "200m"
  memory: "256Mi"
limits:
  cpu: "1000m"
  memory: "1Gi"
```

Adjust based on load testing results.

### Autoscaling

HPA configuration:

```yaml
minReplicas: 2
maxReplicas: 12
targetCPUUtilizationPercentage: 60
targetMemoryUtilizationPercentage: 70
```

## Database Migrations

Migrations run automatically via Job before deployment.

### Manual migration

```bash
# Run migration job
kubectl apply -f k8s/db-migration-job.yaml

# Check job status
kubectl get jobs -n molam-pay

# View migration logs
kubectl logs -n molam-pay job/molam-experiments-migrate

# Delete completed job
kubectl delete job -n molam-pay molam-experiments-migrate
```

## Monitoring

### Prometheus Metrics

Metrics exposed at `/metrics`:

- `http_request_duration_seconds`: Request latency
- `http_requests_total`: Request counter
- `experiments_total`: Experiments by status
- `experiment_assignments_total`: Assignment counter
- `sira_decisions_latency_seconds`: SIRA decision time

### ServiceMonitor

If using Prometheus Operator:

```bash
kubectl apply -f k8s/servicemonitor.yaml
```

### Grafana Dashboard

Import dashboard JSON from `grafana/dashboard-experiments.json`

## Troubleshooting

### Pods not starting

```bash
# Check events
kubectl describe pod -n molam-pay -l app=molam-experiments

# Check logs
kubectl logs -n molam-pay -l app=molam-experiments

# Common issues:
# - Secret not found → Create molam-experiments-secrets
# - ImagePullBackOff → Check registry credentials
# - CrashLoopBackOff → Check DATABASE_URL
```

### Database connection errors

```bash
# Test database connectivity
kubectl run -it --rm pg-test --image=postgres:15-alpine --restart=Never -- \
  psql $DATABASE_URL -c "SELECT 1"

# Check secrets
kubectl get secret molam-experiments-secrets -n molam-pay -o yaml
```

### Ingress not working

```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Check TLS certificate
kubectl get certificate -n molam-pay

# Describe ingress
kubectl describe ingress molam-experiments-ingress -n molam-pay
```

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/molam-experiments -n molam-pay

# Rollback to previous version
kubectl rollout undo deployment/molam-experiments -n molam-pay

# Rollback to specific revision
kubectl rollout undo deployment/molam-experiments -n molam-pay --to-revision=2
```

## Scaling

### Manual scaling

```bash
# Scale replicas
kubectl scale deployment molam-experiments -n molam-pay --replicas=5

# Check HPA status
kubectl get hpa -n molam-pay
```

### Vertical scaling (resources)

Edit deployment.yaml resources and apply:

```bash
kubectl apply -f k8s/deployment.yaml
```

## Security

### Pod Security

All pods run with:
- `runAsNonRoot: true`
- `runAsUser: 1000`
- `allowPrivilegeEscalation: false`
- `readOnlyRootFilesystem: false` (requires /tmp write)
- Capabilities dropped: ALL

### Network Policies (TODO)

Add NetworkPolicy to restrict traffic:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: molam-experiments-netpol
  namespace: molam-pay
spec:
  podSelector:
    matchLabels:
      app: molam-experiments
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
      - podSelector:
          matchLabels:
            app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

## Production Checklist

- [ ] PostgreSQL managed service provisioned
- [ ] Secrets stored in Vault/KMS (not in git)
- [ ] Container registry configured
- [ ] TLS certificates configured (cert-manager)
- [ ] Prometheus + Grafana setup
- [ ] Alerting rules configured
- [ ] Backup strategy for database
- [ ] Disaster recovery plan
- [ ] Load testing completed
- [ ] Security scan passed
- [ ] Documentation updated

## Support

- **Slack**: #molam-platform-ops
- **Runbook**: [../RUNBOOK.md](../RUNBOOK.md)
- **On-call**: PagerDuty rotation
