# SIRA Inference Service - Production Runbook

## Pre-Deployment Checklist

- [ ] Database migration `001_sira_inference.sql` applied
- [ ] Production and canary models registered in `siramodel_registry`
- [ ] Models exported to ONNX format and uploaded to S3
- [ ] Secrets created in Vault/KMS
- [ ] Kubernetes namespace `molam` exists
- [ ] IAM role for S3 access configured
- [ ] Prometheus and Grafana configured
- [ ] Alertmanager rules deployed
- [ ] PagerDuty integration tested

## Deployment Steps

### 1. Database Migration

```bash
# Connect to production database
psql -h prod-db.molam.com -U postgres -d molam

# Run migration
\i brique-113/migrations/001_sira_inference.sql

# Verify tables created
\dt sira_*

# Check views
\dv v_*

# Exit
\q
```

### 2. Create Kubernetes Secrets

```bash
# Create molam-secrets
kubectl create secret generic molam-secrets \
  --from-literal=database-url="postgresql://sira_service:$DB_PASSWORD@prod-db.molam.com:5432/molam" \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  --from-literal=internal-service-token="$(openssl rand -base64 32)" \
  -n molam

# Create AWS credentials
kubectl create secret generic aws-credentials \
  --from-literal=access-key-id="$AWS_ACCESS_KEY_ID" \
  --from-literal=secret-access-key="$AWS_SECRET_ACCESS_KEY" \
  -n molam

# Verify secrets
kubectl get secrets -n molam
```

### 3. Build and Push Docker Image

```bash
# Build image
docker build -t registry.molam/sira-inference:v1.0.0 .

# Tag as latest
docker tag registry.molam/sira-inference:v1.0.0 registry.molam/sira-inference:latest

# Push to registry
docker push registry.molam/sira-inference:v1.0.0
docker push registry.molam/sira-inference:latest

# Verify push
docker pull registry.molam/sira-inference:v1.0.0
```

### 4. Deploy to Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Wait for rollout
kubectl rollout status deployment/sira-inference -n molam

# Check pods
kubectl get pods -n molam -l app=sira-inference

# Verify readiness
kubectl get pods -n molam -l app=sira-inference -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}'
```

### 5. Smoke Tests

```bash
# Port-forward for testing
kubectl port-forward -n molam svc/sira-inference 8080:80 &

# Health check
curl http://localhost:8080/healthz
# Expected: {"ok":true,"service":"sira-inference","timestamp":"..."}

# Readiness check
curl http://localhost:8080/readyz
# Expected: {"ready":true}

# List models
curl -H "Authorization: Bearer $ML_OPS_TOKEN" http://localhost:8080/v1/models
# Expected: {"models":[...],"total":N}

# Test inference (using internal token)
curl -X POST http://localhost:8080/v1/infer \
  -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "test-event-001",
    "product": "fraud_score",
    "payload": {
      "amount": 100,
      "currency": "USD",
      "country": "US",
      "payment_method": "card"
    }
  }'
# Expected: {"prediction_id":"...","score":X.XX,"decision":"..."}

# Kill port-forward
pkill -f "port-forward.*sira-inference"
```

### 6. Configure Canary

```bash
# Get current production model ID
PROD_MODEL_ID=$(psql -h prod-db.molam.com -U postgres -d molam -t -c "SELECT model_id FROM siramodel_registry WHERE product='fraud_score' AND status='production' ORDER BY created_at DESC LIMIT 1" | xargs)

# Start with 0% canary (just configure, don't route yet)
curl -X POST http://inference.molam.com/v1/canary \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"product\": \"fraud_score\",
    \"canary_model_id\": \"$NEW_MODEL_ID\",
    \"production_model_id\": \"$PROD_MODEL_ID\",
    \"canary_percent\": 0
  }"
```

### 7. Import Grafana Dashboard

```bash
# Import dashboard.json via Grafana UI or API
curl -X POST http://grafana.molam.com/api/dashboards/db \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @grafana/dashboard.json
```

## Canary Rollout Procedure

### Phase 1: 10% Canary (Day 1)

```bash
# Enable 10% canary
curl -X POST http://inference.molam.com/v1/canary \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -d '{"product":"fraud_score","canary_percent":10,...}'

# Monitor for 24h
# - Check Grafana dashboard
# - Watch Slack #sira-alerts channel
# - Review metrics every 2h
```

**Go/No-Go Criteria:**
- Error rate delta < 20%
- Latency delta < 30%
- No critical alerts
- False positive rate within ±5%

### Phase 2: 25% Canary (Day 2)

```bash
# Increase to 25%
curl -X POST http://inference.molam.com/v1/canary \
  -d '{"product":"fraud_score","canary_percent":25,...}'

# Monitor for 24h
```

### Phase 3: 50% Canary (Day 3)

```bash
# Increase to 50%
curl -X POST http://inference.molam.com/v1/canary \
  -d '{"product":"fraud_score","canary_percent":50,...}'

# Monitor for 48h (weekend coverage)
```

### Phase 4: 100% Canary (Day 5)

```bash
# Full rollout
curl -X POST http://inference.molam.com/v1/canary \
  -d '{"product":"fraud_score","canary_percent":100,...}'

# Monitor for 72h
```

### Phase 5: Promote to Production (Day 8)

```bash
# Promote canary to production
curl -X POST http://localhost:3000/api/sira/models/$NEW_MODEL_ID/promote \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -d '{"target":"production"}'

# Stop canary
curl -X POST http://inference.molam.com/v1/canary/fraud_score/stop \
  -H "Authorization: Bearer $ML_OPS_TOKEN"

# Archive old model
curl -X POST http://localhost:3000/api/sira/models/$OLD_MODEL_ID/promote \
  -d '{"target":"archived"}'
```

## Rollback Procedures

### Automatic Rollback

The system will automatically rollback if:
- Canary error rate > production * 1.5
- Canary latency P95 > production * 1.3
- Custom metrics exceed thresholds

**Check rollback logs:**
```sql
SELECT * FROM sira_canary_rollback_log
WHERE product = 'fraud_score'
ORDER BY created_at DESC
LIMIT 1;
```

### Manual Rollback

```bash
# Stop canary immediately
curl -X POST http://inference.molam.com/v1/canary/fraud_score/stop \
  -H "Authorization: Bearer $ML_OPS_TOKEN"

# Verify traffic routed to production
curl http://inference.molam.com/v1/canary/fraud_score | jq '.canary_percent'
# Expected: 0

# Record incident
psql -d molam -c "INSERT INTO sira_canary_rollback_log (product, canary_model_id, production_model_id, reason, rolled_back_by) VALUES ('fraud_score', '$CANARY_ID', '$PROD_ID', 'manual_rollback_high_error_rate', 'ops_john');"
```

## Scaling Procedures

### Manual Scale Up

```bash
# Scale to 6 replicas
kubectl scale deployment sira-inference -n molam --replicas=6

# Watch rollout
kubectl rollout status deployment/sira-inference -n molam
```

### Manual Scale Down

```bash
# Scale to 2 replicas (minimum)
kubectl scale deployment sira-inference -n molam --replicas=2
```

### Adjust HPA

```bash
# Edit HPA
kubectl edit hpa sira-inference-hpa -n molam

# Change maxReplicas or target CPU/memory

# Verify
kubectl get hpa -n molam
```

## Troubleshooting

### Pods Not Ready

```bash
# Check pod status
kubectl get pods -n molam -l app=sira-inference

# Describe pod
kubectl describe pod sira-inference-xxx -n molam

# View logs
kubectl logs -n molam sira-inference-xxx

# Common issues:
# - Database connection failed → Check DATABASE_URL secret
# - Models not loading → Check S3 permissions, MODEL_BUCKET env
# - OOM killed → Increase memory limits
```

### High Latency

```bash
# Check metrics
kubectl exec -it -n molam sira-inference-xxx -- curl localhost:8080/metrics | grep latency

# Check cache hit rate
kubectl exec -it -n molam sira-inference-xxx -- curl localhost:8080/metrics | grep cache_hits

# Solutions:
# - Increase CACHE_MAX_ITEMS env var
# - Scale up replicas
# - Check database query performance
# - Verify model file size (should be optimized ONNX)
```

### Model Not Found

```bash
# Check model registry
psql -d molam -c "SELECT model_id, name, version, status, storage_s3_key FROM siramodel_registry WHERE status IN ('production','canary');"

# Check if model downloaded
kubectl exec -it -n molam sira-inference-xxx -- ls -lh /models/

# Force model reload
kubectl rollout restart deployment/sira-inference -n molam
```

## Monitoring Checklist

### Daily Checks
- [ ] Review Grafana dashboard
- [ ] Check error rate < 0.5%
- [ ] Verify P95 latency < 30ms
- [ ] Confirm no critical alerts

### Weekly Checks
- [ ] Review canary rollout progress
- [ ] Analyze decision distribution (allow/block/review)
- [ ] Check model performance degradation
- [ ] Review PagerDuty incidents

### Monthly Checks
- [ ] Audit prediction logs for compliance
- [ ] Review model retraining schedule
- [ ] Check S3 storage costs
- [ ] Update runbook with lessons learned

## Emergency Contacts

- **On-Call ML Engineer**: [PagerDuty]
- **Platform Team**: #platform-oncall
- **Database Team**: #db-oncall
- **Security Team**: #security-oncall

## Appendix: Useful Commands

```bash
# Get all inference pods
kubectl get pods -n molam -l app=sira-inference -o wide

# Tail logs from all pods
kubectl logs -n molam -l app=sira-inference -f --tail=50

# Port-forward to specific pod
kubectl port-forward -n molam sira-inference-xxx 8080:8080

# Execute shell in pod
kubectl exec -it -n molam sira-inference-xxx -- /bin/sh

# Delete and recreate pod (forces restart)
kubectl delete pod -n molam sira-inference-xxx

# View HPA status
kubectl get hpa -n molam -w

# Check resource usage
kubectl top pods -n molam -l app=sira-inference

# View events
kubectl get events -n molam --sort-by='.lastTimestamp' | grep sira-inference
```
