# Brique 97 — Deployment Guide

Complete guide for deploying Brique 97 to production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Database Deployment](#database-deployment)
4. [KMS Setup](#kms-setup)
5. [Application Deployment](#application-deployment)
6. [Security Hardening](#security-hardening)
7. [Monitoring Setup](#monitoring-setup)
8. [Rollback Plan](#rollback-plan)

---

## 1. Prerequisites

### Required Infrastructure

- **AWS Account** with KMS access
- **PostgreSQL 13+** (RDS recommended)
- **Redis 6+** (ElastiCache recommended)
- **Kubernetes Cluster** (EKS, GKE, or AKS)
- **Load Balancer** with TLS 1.2+ support
- **Domain**: `hosted.molam.com` (for PCI-hosted server)

### Required Credentials

- AWS KMS key administrator access
- Database superuser credentials
- Docker registry access
- Kubernetes cluster admin

### PCI Requirements

- **Network Isolation**: Dedicated VPC for PCI workloads
- **HSM** (optional but recommended for production)
- **Audit Logging**: Centralized SIEM
- **IDS/IPS**: Network intrusion detection
- **Vulnerability Scanning**: Regular automated scans

---

## 2. Infrastructure Setup

### VPC Configuration

```bash
# Create dedicated VPC for PCI workloads
aws ec2 create-vpc \
  --cidr-block 10.100.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=molam-pci-vpc}]'

# Create private subnets (no internet gateway)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.100.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=molam-pci-subnet-1a}]'

# Security group (restrictive)
aws ec2 create-security-group \
  --group-name molam-pci-sg \
  --description "PCI-compliant security group" \
  --vpc-id vpc-xxxxx

# Allow only HTTPS from load balancer
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
  --db-subnet-group-name molam-tokenization \
  --db-subnet-group-description "Tokenization database" \
  --subnet-ids subnet-xxxxx subnet-yyyyy

# Create PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier molam-tokenization \
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
  --db-subnet-group-name molam-tokenization \
  --vpc-security-group-ids sg-xxxxx \
  --multi-az \
  --publicly-accessible false
```

### ElastiCache Redis

```bash
# Create Redis cluster
aws elasticache create-replication-group \
  --replication-group-id molam-tokenization-redis \
  --replication-group-description "Redis for rate limiting" \
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
psql -h molam-tokenization.xxxxx.us-east-1.rds.amazonaws.com -U molam -d postgres

# Create database
CREATE DATABASE molam_tokenization;

# Connect to new database
\c molam_tokenization
```

### Step 2: Run Migrations

```bash
# Run schema migration
psql -h molam-tokenization.xxxxx.us-east-1.rds.amazonaws.com -U molam -d molam_tokenization -f migrations/001_create_tokenization_schema.sql

# Verify tables
\dt

# Expected output:
#  Schema |         Name         | Type  | Owner
# --------+----------------------+-------+-------
#  public | client_tokens        | table | molam
#  public | payment_methods      | table | molam
#  public | payment_method_audit | table | molam
#  ...
```

### Step 3: Create Application User

```sql
-- Create read-write user (app)
CREATE USER molam_app WITH PASSWORD 'AppPassword123!';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO molam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO molam_app;

-- Grant execution on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO molam_app;
```

---

## 4. KMS Setup

### Step 1: Create KMS Key

```bash
# Create KMS key
aws kms create-key \
  --description "Molam Tokenization Master Key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS \
  --multi-region false \
  --tags TagKey=Application,TagValue=MolamTokenization

# Create alias
aws kms create-alias \
  --alias-name alias/molam-tokenization \
  --target-key-id arn:aws:kms:us-east-1:123456789:key/xxxxx
```

### Step 2: Key Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow Tokenization Service",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789:role/molam-tokenization-role"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 3: IAM Role for EKS

```bash
# Create IAM role for service account
eksctl create iamserviceaccount \
  --name molam-tokenization-sa \
  --namespace molam \
  --cluster molam-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess \
  --attach-role-arn arn:aws:iam::123456789:role/molam-tokenization-role \
  --approve
```

---

## 5. Application Deployment

### Step 1: Build Docker Images

```bash
# Build API image
docker build -t molam/tokenization:1.0.0 -f Dockerfile .

# Build hosted server image
docker build -t molam/tokenization-hosted:1.0.0 -f Dockerfile.hosted .

# Push to registry
docker push molam/tokenization:1.0.0
docker push molam/tokenization-hosted:1.0.0
```

### Step 2: Kubernetes Secrets

```bash
# Create namespace
kubectl create namespace molam

# Create secrets
kubectl create secret generic molam-tokenization-secrets \
  --from-literal=postgres-password='AppPassword123!' \
  --from-literal=redis-password='SecureRedisPassword123!' \
  --from-literal=jwt-secret='YourJwtSecretHere' \
  --namespace molam

# Create ConfigMap
kubectl create configmap molam-tokenization-config \
  --from-literal=postgres-host=molam-tokenization.xxxxx.us-east-1.rds.amazonaws.com \
  --from-literal=postgres-db=molam_tokenization \
  --from-literal=redis-host=molam-redis.xxxxx.cache.amazonaws.com \
  --from-literal=kms-key-id=alias/molam-tokenization \
  --namespace molam
```

### Step 3: Deploy API

```yaml
# k8s/deployment-api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-tokenization-api
  namespace: molam
spec:
  replicas: 3
  selector:
    matchLabels:
      app: molam-tokenization-api
  template:
    metadata:
      labels:
        app: molam-tokenization-api
    spec:
      serviceAccountName: molam-tokenization-sa
      containers:
        - name: api
          image: molam/tokenization:1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: NODE_ENV
              value: "production"
            - name: USE_REAL_KMS
              value: "true"
            - name: POSTGRES_HOST
              valueFrom:
                configMapKeyRef:
                  name: molam-tokenization-config
                  key: postgres-host
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: molam-tokenization-secrets
                  key: postgres-password
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
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

### Step 4: Deploy Hosted Server (PCI-Isolated)

```yaml
# k8s/deployment-hosted.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: molam-tokenization-hosted
  namespace: molam
spec:
  replicas: 2
  selector:
    matchLabels:
      app: molam-tokenization-hosted
  template:
    metadata:
      labels:
        app: molam-tokenization-hosted
    spec:
      serviceAccountName: molam-tokenization-sa
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: molam.com/pci
                    operator: In
                    values:
                      - "true"
      containers:
        - name: hosted
          image: molam/tokenization-hosted:1.0.0
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: "production"
            - name: VAULT_PROVIDER
              value: "stripe"
            - name: STRIPE_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: molam-tokenization-secrets
                  key: stripe-secret-key
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

```bash
kubectl apply -f k8s/deployment-hosted.yaml
```

### Step 5: Deploy Services & Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: molam-tokenization-api
  namespace: molam
spec:
  selector:
    app: molam-tokenization-api
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: molam-tokenization-hosted
  namespace: molam
spec:
  selector:
    app: molam-tokenization-hosted
  ports:
    - port: 443
      targetPort: 3001
  type: LoadBalancer
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-ssl-cert: arn:aws:acm:us-east-1:123456789:certificate/xxxxx
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: "http"
```

```bash
kubectl apply -f k8s/service.yaml
```

---

## 6. Security Hardening

### TLS Configuration

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
kubectl apply -f k8s/cluster-issuer.yaml

# Request certificate
kubectl apply -f k8s/certificate.yaml
```

### Network Policies

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: molam-tokenization-policy
  namespace: molam
spec:
  podSelector:
    matchLabels:
      app: molam-tokenization-api
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
          port: 8080
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
              app: redis
      ports:
        - protocol: TCP
          port: 6379
```

---

## 7. Monitoring Setup

### Prometheus

```yaml
# k8s/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: molam-tokenization
  namespace: molam
spec:
  selector:
    matchLabels:
      app: molam-tokenization-api
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

### Alerts

```yaml
# prometheus/alerts.yaml
groups:
  - name: tokenization
    rules:
      - alert: HighTokenizationFailureRate
        expr: rate(tokenization_failures_total[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High tokenization failure rate"

      - alert: KMSDecryptionFailure
        expr: rate(kms_decrypt_failures_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "KMS decryption failures detected"
```

---

## 8. Rollback Plan

### Quick Rollback

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/molam-tokenization-api -n molam

# Rollback to specific revision
kubectl rollout undo deployment/molam-tokenization-api --to-revision=2 -n molam

# Check rollout status
kubectl rollout status deployment/molam-tokenization-api -n molam
```

### Database Rollback

```bash
# Restore from backup (point-in-time)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier molam-tokenization \
  --target-db-instance-identifier molam-tokenization-rollback \
  --restore-time 2025-01-15T12:00:00Z
```

---

## Checklist

### Pre-Deployment

- [ ] VPC and subnets created
- [ ] RDS PostgreSQL instance created
- [ ] ElastiCache Redis cluster created
- [ ] KMS key created and policy configured
- [ ] IAM roles and policies created
- [ ] Kubernetes cluster ready
- [ ] Docker images built and pushed
- [ ] Secrets and ConfigMaps created

### Deployment

- [ ] Database migrations run successfully
- [ ] API deployment running (3 replicas)
- [ ] Hosted server deployment running (2 replicas)
- [ ] Services exposed correctly
- [ ] Ingress configured with TLS
- [ ] Health checks passing

### Post-Deployment

- [ ] Run smoke tests
- [ ] Verify tokenization flow end-to-end
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
