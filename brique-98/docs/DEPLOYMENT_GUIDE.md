# Brique 98 — Deployment Guide

Complete guide for deploying Brique 98 (Offline Fallback) to production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Database Deployment](#database-deployment)
4. [Application Deployment](#application-deployment)
5. [Worker Deployment](#worker-deployment)
6. [Security Hardening](#security-hardening)
7. [Monitoring Setup](#monitoring-setup)
8. [Rollback Plan](#rollback-plan)

---

## 1. Prerequisites

### Required Infrastructure

- **AWS Account** with KMS access
- **PostgreSQL 13+** (RDS recommended)
- **Redis 6+** (optional - for distributed nonce tracking)
- **Kubernetes Cluster** (EKS, GKE, or AKS)
- **Load Balancer** with TLS 1.2+ support

### Required Dependencies

- **Brique 97** (PCI Tokenization) - for KMS encryption utilities
- **Brique 94** (SIRA) - for fraud detection (optional but recommended)

### Required Credentials

- AWS KMS key administrator access
- Database superuser credentials
- Docker registry access
- Kubernetes cluster admin

---

## 2. Infrastructure Setup

### VPC Configuration

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.110.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=molam-offline-vpc}]'

# Create private subnets
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.110.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=molam-offline-subnet-1a}]'

# Security group
aws ec2 create-security-group \
  --group-name molam-offline-sg \
  --description "Offline payment services" \
  --vpc-id vpc-xxxxx

# Allow HTTPS from load balancer
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 443 \
  --source-group sg-lb-xxxxx
```

### RDS PostgreSQL

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name molam-offline \
  --db-subnet-group-description "Offline payment database" \
  --subnet-ids subnet-xxxxx subnet-yyyyy

# Create PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier molam-offline \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 15.4 \
  --master-username molam \
  --master-user-password 'SecurePassword123!' \
  --allocated-storage 100 \
  --storage-type gp3 \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:us-east-1:123456789:key/xxxxx \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00" \
  --db-subnet-group-name molam-offline \
  --vpc-security-group-ids sg-xxxxx \
  --multi-az \
  --publicly-accessible false
```

### ElastiCache Redis (Optional)

```bash
# Create Redis cluster for distributed nonce tracking
aws elasticache create-replication-group \
  --replication-group-id molam-offline-redis \
  --replication-group-description "Redis for nonce tracking" \
  --engine redis \
  --cache-node-type cache.t3.small \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --auth-token 'SecureRedisPassword123!' \
  --cache-subnet-group-name molam-redis-subnet \
  --security-group-ids sg-xxxxx
```

---

## 3. Database Deployment

### Step 1: Create Database

```bash
# Connect to RDS
psql -h molam-offline.xxxxx.us-east-1.rds.amazonaws.com -U molam -d postgres

# Create database
CREATE DATABASE molam_offline;

# Connect to new database
\c molam_offline
```

### Step 2: Run Migrations

```bash
# Run schema migration
psql -h molam-offline.xxxxx.us-east-1.rds.amazonaws.com \
  -U molam \
  -d molam_offline \
  -f migrations/001_create_offline_schema.sql

# Verify tables
\dt

# Expected output:
#  Schema |         Name              | Type  | Owner
# --------+---------------------------+-------+-------
#  public | offline_devices           | table | molam
#  public | offline_tx_bundles        | table | molam
#  public | offline_transactions      | table | molam
#  public | offline_policies          | table | molam
#  public | offline_audit_logs        | table | molam
#  public | offline_sync_queue        | table | molam
#  public | offline_device_activity   | table | molam
```

### Step 3: Create Application User

```sql
-- Create read-write user (app)
CREATE USER molam_offline_app WITH PASSWORD 'AppPassword123!';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO molam_offline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO molam_offline_app;

-- Grant execution on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_offline_app;
```

### Step 4: Verify Default Policies

```sql
-- Check default policies were created
SELECT country, max_offline_amount, enabled FROM offline_policies;

-- Expected: 6 West African countries with default limits
```

---

## 4. Application Deployment

### Step 1: Build Docker Images

```bash
# Build API image
docker build -t molam/offline:1.0.0 -f Dockerfile .

# Push to registry
docker push molam/offline:1.0.0
```

### Step 2: Kubernetes Secrets

```bash
# Create namespace
kubectl create namespace molam

# Create secrets
kubectl create secret generic molam-offline-secrets \
  --from-literal=postgres-password='AppPassword123!' \
  --from-literal=redis-password='SecureRedisPassword123!' \
  --from-literal=jwt-secret='YourJwtSecretHere' \
  --from-literal=sira-api-key='YourSiraApiKey' \
  --namespace molam

# Create ConfigMap
kubectl create configmap molam-offline-config \
  --from-literal=postgres-host=molam-offline.xxxxx.us-east-1.rds.amazonaws.com \
  --from-literal=postgres-db=molam_offline \
  --from-literal=redis-host=molam-offline-redis.xxxxx.cache.amazonaws.com \
  --from-literal=kms-key-id=alias/molam-offline \
  --from-literal=sira-api-url=https://sira.molam.com \
  --namespace molam
```

### Step 3: Deploy API

```yaml
# k8s/deployment-api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-offline-api
  namespace: molam
spec:
  replicas: 3
  selector:
    matchLabels:
      app: molam-offline-api
  template:
    metadata:
      labels:
        app: molam-offline-api
    spec:
      serviceAccountName: molam-offline-sa
      containers:
        - name: api
          image: molam/offline:1.0.0
          ports:
            - containerPort: 8098
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "8098"
            - name: USE_REAL_KMS
              value: "true"
            - name: POSTGRES_HOST
              valueFrom:
                configMapKeyRef:
                  name: molam-offline-config
                  key: postgres-host
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: molam-offline-secrets
                  key: postgres-password
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: molam-offline-secrets
                  key: jwt-secret
            - name: SIRA_API_KEY
              valueFrom:
                secretKeyRef:
                  name: molam-offline-secrets
                  key: sira-api-key
          livenessProbe:
            httpGet:
              path: /health
              port: 8098
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8098
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

```bash
kubectl apply -f k8s/deployment-api.yaml
```

### Step 4: Deploy Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: molam-offline-api
  namespace: molam
spec:
  selector:
    app: molam-offline-api
  ports:
    - port: 80
      targetPort: 8098
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: molam-offline-ingress
  namespace: molam
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - offline.molam.com
      secretName: molam-offline-tls
  rules:
    - host: offline.molam.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: molam-offline-api
                port:
                  number: 80
```

```bash
kubectl apply -f k8s/service.yaml
```

---

## 5. Worker Deployment

### Reconciliation Worker CronJob

```yaml
# k8s/cronjob-reconciliation.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: offline-reconciliation-worker
  namespace: molam
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: molam-offline-sa
          restartPolicy: OnFailure
          containers:
            - name: worker
              image: molam/offline:1.0.0
              command: ["npm", "run", "worker:reconciliation"]
              env:
                - name: NODE_ENV
                  value: "production"
                - name: WORKER_MODE
                  value: "once"
                - name: BATCH_SIZE
                  value: "20"
                - name: ENABLE_SIRA_SCORING
                  value: "true"
                - name: POSTGRES_HOST
                  valueFrom:
                    configMapKeyRef:
                      name: molam-offline-config
                      key: postgres-host
                - name: POSTGRES_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: molam-offline-secrets
                      key: postgres-password
              resources:
                requests:
                  memory: "512Mi"
                  cpu: "500m"
                limits:
                  memory: "1Gi"
                  cpu: "1000m"
```

```bash
kubectl apply -f k8s/cronjob-reconciliation.yaml
```

### Continuous Worker (Alternative)

For high-volume environments, use continuous worker:

```yaml
# k8s/deployment-worker.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-offline-worker
  namespace: molam
spec:
  replicas: 2
  selector:
    matchLabels:
      app: molam-offline-worker
  template:
    metadata:
      labels:
        app: molam-offline-worker
    spec:
      containers:
        - name: worker
          image: molam/offline:1.0.0
          command: ["npm", "run", "worker:reconciliation:continuous"]
          env:
            - name: WORKER_MODE
              value: "continuous"
            - name: POLL_INTERVAL_MS
              value: "3000"
          # ... same env vars as API
```

---

## 6. Security Hardening

### KMS Key Setup

```bash
# Create KMS key for offline encryption
aws kms create-key \
  --description "Molam Offline Payment Encryption Key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS

# Create alias
aws kms create-alias \
  --alias-name alias/molam-offline \
  --target-key-id arn:aws:kms:us-east-1:123456789:key/xxxxx
```

### IAM Role for EKS

```bash
# Create IAM role for service account
eksctl create iamserviceaccount \
  --name molam-offline-sa \
  --namespace molam \
  --cluster molam-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess \
  --approve

# Attach KMS policy
aws iam put-role-policy \
  --role-name eksctl-molam-cluster-addon-iamserviceaccount-molam-offline-sa \
  --policy-name KMSAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789:key/xxxxx"
    }]
  }'
```

### Network Policies

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: molam-offline-policy
  namespace: molam
spec:
  podSelector:
    matchLabels:
      app: molam-offline-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx-ingress
      ports:
        - protocol: TCP
          port: 8098
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: sira
      ports:
        - protocol: TCP
          port: 8094
```

---

## 7. Monitoring Setup

### Prometheus ServiceMonitor

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: molam-offline
  namespace: molam
spec:
  selector:
    matchLabels:
      app: molam-offline-api
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

### Alerts

```yaml
# prometheus/alerts.yaml
groups:
  - name: offline-payments
    rules:
      - alert: HighOfflineBundleRejectionRate
        expr: rate(offline_bundles_rejected_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High offline bundle rejection rate"
          description: "Offline bundle rejection rate is {{ $value }} per second"

      - alert: ReconciliationWorkerFailed
        expr: rate(offline_reconciliation_failures_total[5m]) > 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Reconciliation worker failures detected"

      - alert: OfflineSyncQueueBacklog
        expr: offline_sync_queue_size > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Large sync queue backlog"
          description: "{{ $value }} bundles waiting for reconciliation"
```

---

## 8. Rollback Plan

### Quick Rollback

```bash
# Rollback API deployment
kubectl rollout undo deployment/molam-offline-api -n molam

# Rollback to specific revision
kubectl rollout undo deployment/molam-offline-api --to-revision=2 -n molam

# Check rollout status
kubectl rollout status deployment/molam-offline-api -n molam
```

### Database Rollback

```bash
# Restore from backup (point-in-time)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier molam-offline \
  --target-db-instance-identifier molam-offline-rollback \
  --restore-time 2025-01-15T12:00:00Z
```

---

## Checklist

### Pre-Deployment

- [ ] VPC and subnets created
- [ ] RDS PostgreSQL instance created
- [ ] KMS key created and policy configured
- [ ] IAM roles and policies created
- [ ] Kubernetes cluster ready
- [ ] Docker images built and pushed
- [ ] Secrets and ConfigMaps created
- [ ] Dependencies (Brique 97, Brique 94) deployed

### Deployment

- [ ] Database migrations run successfully
- [ ] API deployment running (3 replicas)
- [ ] Worker deployment/cronjob running
- [ ] Services and Ingress configured
- [ ] Health checks passing
- [ ] TLS certificates valid

### Post-Deployment

- [ ] Run smoke tests (device registration, bundle push)
- [ ] Verify reconciliation worker processing
- [ ] Check Prometheus metrics
- [ ] Verify audit logs
- [ ] Test rollback procedure
- [ ] Update runbooks
- [ ] Notify stakeholders

---

## Support

For deployment issues:
- **Slack**: `#platform-deployment`
- **On-call**: PagerDuty
- **Email**: devops@molam.co
