# CI/CD Pipeline Guide - Molam Experiments

## Overview

Automated pipeline for building, testing, and deploying Molam Experiments to Kubernetes.

**Pipeline stages:**
1. **Test** : Lint + Unit tests
2. **Build** : Docker image build + push to GHCR
3. **Deploy Staging** : Auto-deploy on `develop` branch
4. **Deploy Production** : Auto-deploy on `main` branch (with approval)

## Required GitHub Secrets

Configure these secrets in your GitHub repository:

### Container Registry

```
GITHUB_TOKEN (automatically provided by GitHub Actions)
```

For private registries (ECR, GCR):
```
REGISTRY_USERNAME
REGISTRY_PASSWORD
```

### Kubernetes Clusters

#### Staging

```bash
# Generate base64-encoded kubeconfig
cat ~/.kube/config-staging | base64 -w 0

# Add to GitHub secrets as:
KUBE_CONFIG_STAGING
```

#### Production

```bash
# Generate base64-encoded kubeconfig
cat ~/.kube/config-production | base64 -w 0

# Add to GitHub secrets as:
KUBE_CONFIG_PRODUCTION
```

### Optional (Notifications)

```
SLACK_WEBHOOK_URL       # For deployment notifications
SENTRY_AUTH_TOKEN       # For release tracking
```

## Workflow Triggers

### Automatic Triggers

| Branch | Trigger | Environment |
|--------|---------|-------------|
| `develop` | Push | Staging (auto) |
| `main` | Push | Production (manual approval) |
| `release/*` | Push | Build only |
| PR | Open/Update | Test only |

### Manual Trigger

```bash
# Via GitHub UI: Actions → CI/CD → Run workflow
# Or via gh CLI:
gh workflow run ci-cd.yml -f environment=staging
```

## Pipeline Stages

### 1. Test & Lint

```yaml
- npm ci
- npm run lint
- npm test
```

**Artifacts**: Test coverage reports

### 2. Build & Push

```yaml
- docker build
- docker push to ghcr.io/molam/molam-experiments
- Generate SBOM
```

**Outputs**:
- Image tags: `latest`, `main-{sha}`, `{branch}-{sha}`
- SBOM (Software Bill of Materials)

**Image tagging strategy**:
- `latest` : Latest main branch
- `main-abc123` : Main branch commit
- `develop-xyz789` : Develop branch commit
- `v1.2.3` : Semantic version tag

### 3. Deploy Staging

**Triggers**: Push to `develop` branch

**Steps**:
1. Update deployment image tag
2. Apply Kubernetes manifests
3. Run database migrations (Job)
4. Wait for rollout completion
5. Run smoke tests

**Environment**: `staging`
**URL**: https://experiments-staging.molam.io

### 4. Deploy Production

**Triggers**: Push to `main` branch (requires approval)

**Steps**:
1. Manual approval required
2. Update deployment image tag
3. Apply Kubernetes manifests
4. Run database migrations (Job)
5. Wait for rollout completion (10min timeout)
6. Run smoke tests
7. Send Slack notification

**Environment**: `production`
**URL**: https://experiments.molam.io

### 5. Security Scan

**Tool**: Trivy vulnerability scanner

**Triggers**: After build (parallel with deploy)

**Output**: SARIF results uploaded to GitHub Security

## Deployment Process

### Staging Deployment

```bash
# 1. Push to develop branch
git checkout develop
git merge feature/my-feature
git push origin develop

# 2. GitHub Actions automatically:
#    - Runs tests
#    - Builds Docker image
#    - Deploys to staging
#    - Runs smoke tests

# 3. Verify deployment
curl https://experiments-staging.molam.io/healthz
```

### Production Deployment

```bash
# 1. Merge develop to main
git checkout main
git merge develop
git push origin main

# 2. GitHub Actions:
#    - Runs tests
#    - Builds Docker image
#    - Waits for manual approval

# 3. Approve deployment in GitHub UI
#    Actions → CI/CD → Review deployments → Approve

# 4. Deployment proceeds automatically
#    - Applies manifests
#    - Runs migrations
#    - Waits for rollout
#    - Sends Slack notification

# 5. Verify production
curl https://experiments.molam.io/healthz
```

## Manual Deployment

If CI/CD fails, deploy manually:

```bash
# 1. Build image locally
docker build -t ghcr.io/molam/molam-experiments:manual-v1 .

# 2. Push to registry
docker push ghcr.io/molam/molam-experiments:manual-v1

# 3. Update deployment
kubectl set image deployment/molam-experiments \
  molam-experiments=ghcr.io/molam/molam-experiments:manual-v1 \
  -n molam-pay

# 4. Run migrations
kubectl apply -f k8s/db-migration-job.yaml

# 5. Monitor rollout
kubectl rollout status deployment/molam-experiments -n molam-pay
```

## Troubleshooting

### Build Failures

**Symptom**: `npm test` fails

```bash
# Run tests locally
npm test

# Check test logs in GitHub Actions
# Actions → CI/CD → Failed job → test
```

**Symptom**: Docker build fails

```bash
# Build locally
docker build -t test .

# Check Dockerfile syntax
# Verify all COPY paths exist
```

### Deploy Failures

**Symptom**: `kubectl apply` fails

```bash
# Validate manifests locally
kubectl apply --dry-run=client -f k8s/

# Check KUBE_CONFIG secret is valid
echo $KUBE_CONFIG_STAGING | base64 -d | kubectl --kubeconfig=- get nodes
```

**Symptom**: Rollout timeout

```bash
# Check pod status
kubectl get pods -n molam-pay -l app=molam-experiments

# Check events
kubectl get events -n molam-pay --sort-by='.lastTimestamp'

# Common issues:
# - ImagePullBackOff → Check registry credentials
# - CrashLoopBackOff → Check DATABASE_URL secret
# - Pending → Insufficient cluster resources
```

**Symptom**: Migration job fails

```bash
# Check job logs
kubectl logs -n molam-pay job/molam-experiments-migrate

# Check database connectivity
kubectl run -it --rm pg-test --image=postgres:15 --restart=Never -- \
  psql $DATABASE_URL -c "SELECT 1"
```

### Smoke Test Failures

**Symptom**: `/healthz` returns 500

```bash
# Check application logs
kubectl logs -n molam-pay -l app=molam-experiments --tail=100

# Exec into pod
kubectl exec -it -n molam-pay deployment/molam-experiments -- sh

# Test health endpoint
curl localhost:8080/healthz

# Check environment variables
kubectl exec -n molam-pay deployment/molam-experiments -- env | grep DATABASE
```

## Rollback

### Via GitHub Actions

```bash
# 1. Find previous successful deployment
#    Actions → CI/CD → Select previous run → View image tag

# 2. Manually trigger deployment with old image
kubectl set image deployment/molam-experiments \
  molam-experiments=ghcr.io/molam/molam-experiments:main-abc123 \
  -n molam-pay

# 3. Verify rollback
kubectl rollout status deployment/molam-experiments -n molam-pay
```

### Via kubectl

```bash
# View rollout history
kubectl rollout history deployment/molam-experiments -n molam-pay

# Rollback to previous version
kubectl rollout undo deployment/molam-experiments -n molam-pay

# Rollback to specific revision
kubectl rollout undo deployment/molam-experiments -n molam-pay --to-revision=3
```

## Monitoring Deployments

### GitHub Actions UI

```
https://github.com/molam/molam-connect/actions
```

### kubectl

```bash
# Watch pods
kubectl get pods -n molam-pay -l app=molam-experiments -w

# Watch rollout
kubectl rollout status deployment/molam-experiments -n molam-pay -w

# View events
kubectl get events -n molam-pay --watch
```

### Grafana

```
https://grafana.molam.io/d/experiments-overview
```

## Security

### Image Scanning

Trivy scans every image for:
- CVEs (Common Vulnerabilities and Exposures)
- Misconfigurations
- Secret leaks

Results uploaded to:
```
https://github.com/molam/molam-connect/security/code-scanning
```

### Secret Rotation

Rotate secrets regularly:

```bash
# 1. Generate new secret
NEW_KEY=$(openssl rand -base64 32)

# 2. Update in Vault/KMS

# 3. Update Kubernetes secret
kubectl create secret generic molam-experiments-secrets \
  --from-literal=NEW_SECRET=$NEW_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Restart deployment
kubectl rollout restart deployment/molam-experiments -n molam-pay
```

## Best Practices

### Branching Strategy

```
main (production)
  └── develop (staging)
       └── feature/* (dev branches)
```

### Commit Messages

```bash
# Good
feat: Add Thompson Sampling fail-fast detection
fix: Resolve database connection pool exhaustion
docs: Update deployment guide

# Bad
update code
fix bug
wip
```

### Pull Requests

1. Create feature branch
2. Make changes
3. Run tests locally (`npm test`)
4. Push and open PR
5. CI runs automatically
6. Request review
7. Merge to develop → auto-deploy to staging
8. Test in staging
9. Merge to main → deploy to production (with approval)

## Emergency Procedures

### Production Down

```bash
# 1. Check pod status
kubectl get pods -n molam-pay -l app=molam-experiments

# 2. Scale up replicas
kubectl scale deployment molam-experiments -n molam-pay --replicas=10

# 3. Rollback if recent deployment
kubectl rollout undo deployment/molam-experiments -n molam-pay

# 4. Notify team in Slack #incidents
```

### Database Migration Failure

```bash
# 1. Check migration job logs
kubectl logs -n molam-pay job/molam-experiments-migrate

# 2. If job failed, fix migration SQL
# 3. Delete failed job
kubectl delete job molam-experiments-migrate -n molam-pay

# 4. Re-run migration
kubectl apply -f k8s/db-migration-job.yaml
```

## Support

- **GitHub Actions Issues**: #molam-devops
- **Kubernetes Issues**: #molam-platform-ops
- **On-call**: PagerDuty rotation
