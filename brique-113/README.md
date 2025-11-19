# Brique 113: SIRA Inference Service & Low-Latency Router

High-performance ML inference service with deterministic canary routing for fraud detection and risk scoring.

## Overview

Brique 113 provides a production-ready inference service optimized for low-latency predictions:

- **Low-Latency**: P50 < 2ms (cached), P95 < 30ms (uncached)
- **Deterministic Canary Routing**: Hash-based traffic splitting for consistent model assignment
- **Model Hot-Swapping**: Automatic model loading from S3 with atomic updates
- **LRU Caching**: In-memory cache for sub-millisecond response times
- **Observability**: Prometheus metrics, structured logging, OpenTelemetry traces
- **Resilience**: Circuit breakers, retries, graceful degradation
- **Security**: JWT authentication, mTLS for internal services, Vault integration
- **Scalability**: Kubernetes HPA, PodDisruptionBudget, resource limits

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway / Ingress                    │
│                (JWT Auth + Rate Limiting)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  SIRA Inference Service Pods                │
│                      (Auto-scaled 2-12)                     │
├─────────────────────────────────────────────────────────────┤
│  1. Auth Middleware (JWT + mTLS)                            │
│  2. LRU Cache (5000 items, 5min TTL)                        │
│  3. Canary Router (hash-based deterministic routing)        │
│  4. Model Manager (S3 download + hot-reload)                │
│  5. ONNX Runtime (CPU/GPU optimized)                        │
│  6. Prometheus Metrics                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
         ┌──────────────────┴──────────────────┐
         ↓                                      ↓
┌─────────────────┐                    ┌─────────────────┐
│  Production     │                    │  Canary Model   │
│  Model (90%)    │                    │  (10% traffic)  │
└─────────────────┘                    └─────────────────┘
         ↓                                      ↓
┌─────────────────────────────────────────────────────────────┐
│              siramodel_predictions (Immutable Log)          │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Deterministic Canary Routing

Traffic is split deterministically based on `hash(event_id)`, ensuring the same event always routes to the same model:

```typescript
// Event with hash % 100 = 15 → routes to canary (if canary_percent >= 15)
// Event with hash % 100 = 85 → routes to production (if canary_percent < 85)
const percent = hash(event_id) % 100;
if (percent < canary_percent && canary_model_exists) {
  return canary_model;
} else {
  return production_model;
}
```

### 2. Model Hot-Swapping

Models are downloaded from S3 and loaded automatically:

- Periodic check (default: 30s) queries database for active models
- New models are downloaded to `/models` directory
- ONNX sessions are cached for fast inference
- Atomic file rename ensures consistency

### 3. LRU Cache

In-memory cache for ultra-low latency:

- Max 5000 items (configurable via `CACHE_MAX_ITEMS`)
- 5-minute TTL (configurable via `CACHE_TTL_MS`)
- Cache key: `product:features_hash`
- Automatic eviction on size/TTL limits

### 4. Observability

**Prometheus Metrics:**
- `sira_inference_requests_total{product,model_id,model_role,decision,status}`
- `sira_inference_latency_seconds_bucket{product,model_id,model_role}`
- `sira_inference_cache_hits_total{cache_type}`
- `sira_inference_cache_misses_total{cache_type}`
- `sira_models_loaded`
- `sira_prediction_errors_total{product,model_id,error_type}`
- `sira_canary_traffic_ratio{product}`

**Structured Logging (Winston):**
```json
{
  "timestamp": "2024-01-15 14:30:00",
  "level": "info",
  "message": "Inference completed",
  "prediction_id": "123e4567-...",
  "event_id": "abc123",
  "model_id": "987f6543-...",
  "model_role": "production",
  "score": 0.23,
  "decision": "allow",
  "latency_ms": 12,
  "service": "sira-inference",
  "pod_id": "sira-inference-5d7c9b-xyz"
}
```

## API Endpoints

### POST /v1/infer
Make a prediction

**Request:**
```json
{
  "event_id": "123e4567-e89b-12d3-a456-426614174000",
  "product": "fraud_score",
  "payload": {
    "amount": 150.50,
    "currency": "USD",
    "country": "US",
    "payment_method": "card",
    "features": {
      "hour_of_day": 14,
      "is_weekend": 0
    }
  }
}
```

**Response:**
```json
{
  "prediction_id": "987f6543-e21c-34d5-b678-537625285111",
  "model_id": "abc123-model-id",
  "model_role": "production",
  "score": 0.23,
  "decision": "allow",
  "explain_summary": [
    {"feature": "amount", "importance": 0.45},
    {"feature": "hour_of_day", "importance": 0.23}
  ],
  "latency_ms": 12,
  "cached": false
}
```

**Decision Thresholds:**
- `score >= threshold` → `block`
- `score >= threshold * 0.7` → `review`
- `score < threshold * 0.7` → `allow`

### GET /v1/infer/:prediction_id
Get prediction details by ID

**Response:**
```json
{
  "prediction_id": "987f6543-...",
  "model_id": "abc123-...",
  "event_id": "123e4567-...",
  "product": "fraud_score",
  "score": 0.23,
  "decision": "allow",
  "explain": {...},
  "latency_ms": 12,
  "model_role": "production",
  "created_at": "2024-01-15T14:30:00Z"
}
```

### GET /v1/models (ml_ops only)
List loaded models

**Response:**
```json
{
  "models": [
    {
      "model_id": "abc123-...",
      "name": "sira-fraud-detector",
      "version": "v20240115_143000",
      "product": "fraud_score",
      "status": "production",
      "loaded_at": "2024-01-15T14:25:00Z"
    }
  ],
  "total": 3
}
```

### POST /v1/canary (ml_ops only)
Set canary configuration

**Request:**
```json
{
  "product": "fraud_score",
  "canary_model_id": "new-model-id",
  "production_model_id": "current-model-id",
  "canary_percent": 10
}
```

### POST /v1/canary/:product/stop (ml_ops only)
Stop canary deployment (set percent to 0)

### GET /v1/canary/:product
Get canary configuration

**Response:**
```json
{
  "product": "fraud_score",
  "production_model_id": "current-model-id",
  "canary_model_id": "new-model-id",
  "canary_percent": 10,
  "started_at": "2024-01-15T14:00:00Z",
  "updated_at": "2024-01-15T14:30:00Z"
}
```

### GET /healthz
Health check (always returns 200 if service is running)

### GET /readyz
Readiness probe (returns 503 if models not loaded)

### GET /metrics
Prometheus metrics endpoint

## Deployment

### Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/molam"
export JWT_SECRET="your-jwt-secret"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export MODEL_BUCKET="molam-models"

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

### Docker

```bash
# Build image
docker build -t molam/sira-inference:v1.0.0 .

# Run container
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -e AWS_ACCESS_KEY_ID="..." \
  -e AWS_SECRET_ACCESS_KEY="..." \
  molam/sira-inference:v1.0.0
```

### Kubernetes

```bash
# Create namespace
kubectl create namespace molam

# Create secrets
kubectl create secret generic molam-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=jwt-secret="..." \
  --from-literal=internal-service-token="..." \
  -n molam

kubectl create secret generic aws-credentials \
  --from-literal=access-key-id="..." \
  --from-literal=secret-access-key="..." \
  -n molam

# Deploy
kubectl apply -f k8s/

# Check status
kubectl get pods -n molam -l app=sira-inference

# View logs
kubectl logs -n molam -l app=sira-inference -f

# Port forward for testing
kubectl port-forward -n molam svc/sira-inference 8080:80
```

## Canary Deployment Workflow

### Step 1: Train New Model
```bash
# Train model with Brique 112
python train.py 2024-01-15
# Output: Model ID = new-model-id, Status = candidate
```

### Step 2: Validate Model
```bash
# Promote to validated status
curl -X POST http://localhost:3000/api/sira/models/new-model-id/promote \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -d '{"target": "validated"}'
```

### Step 3: Start Canary (10%)
```bash
curl -X POST http://localhost:8080/v1/canary \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "fraud_score",
    "canary_model_id": "new-model-id",
    "production_model_id": "current-model-id",
    "canary_percent": 10
  }'
```

### Step 4: Monitor Canary Health
```bash
# Check Grafana dashboard
open http://grafana.molam.com/d/sira-inference

# Query metrics manually
curl -s http://localhost:8080/metrics | grep sira_canary

# Compare performance
psql -d molam -c "SELECT * FROM compare_canary_performance('fraud_score', 'new-model-id', 'current-model-id', 1);"
```

### Step 5: Gradual Rollout
```bash
# If healthy, increase to 25%
curl -X POST http://localhost:8080/v1/canary \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -d '{"product": "fraud_score", "canary_percent": 25, ...}'

# Continue: 10% → 25% → 50% → 100%
```

### Step 6: Promote to Production
```bash
# Once canary at 100% and stable
curl -X POST http://localhost:3000/api/sira/models/new-model-id/promote \
  -H "Authorization: Bearer $ML_OPS_TOKEN" \
  -d '{"target": "production"}'

# Stop canary
curl -X POST http://localhost:8080/v1/canary/fraud_score/stop \
  -H "Authorization: Bearer $ML_OPS_TOKEN"
```

## Performance Tuning

### Latency Optimization

**Target SLOs:**
- P50: < 2ms (cache hit)
- P50: < 10ms (cache miss)
- P95: < 30ms
- P99: < 100ms

**Tuning Levers:**
1. **Cache Size**: Increase `CACHE_MAX_ITEMS` for higher hit rate
2. **Cache TTL**: Adjust `CACHE_TTL_MS` based on feature volatility
3. **Model Format**: Use ONNX for fastest inference
4. **CPU/GPU**: Enable GPU execution providers for large models
5. **Resource Limits**: Increase CPU/memory for pods
6. **HPA**: Scale up replicas during high traffic

### Scaling

**Horizontal Pod Autoscaler:**
- Min: 2 replicas
- Max: 12 replicas
- Target CPU: 60%
- Target Memory: 70%

**Custom Metrics (Optional):**
```yaml
- type: Pods
  pods:
    metric:
      name: sira_inference_requests_per_second
    target:
      type: AverageValue
      averageValue: "100"
```

## Monitoring & Alerts

### Grafana Dashboard

Import [dashboard.json](grafana/dashboard.json) into Grafana.

**Panels:**
1. Requests/sec
2. P95 Latency
3. Error Rate
4. Request Rate by Product
5. Latency Percentiles (P50/P95/P99)
6. Canary vs Production Traffic
7. Decisions Distribution (Allow/Block/Review)

### Alerts (Prometheus + Alertmanager)

```yaml
groups:
  - name: sira-inference
    rules:
      # High error rate
      - alert: SIRAHighErrorRate
        expr: sum(rate(sira_prediction_errors_total[5m])) / sum(rate(sira_inference_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SIRA inference error rate > 1%"

      # High latency
      - alert: SIRAHighLatency
        expr: histogram_quantile(0.95, sum(rate(sira_inference_latency_seconds_bucket[5m])) by (le)) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SIRA P95 latency > 100ms"

      # Canary performance degradation
      - alert: SIRACanaryPerformanceDegraded
        expr: |
          (histogram_quantile(0.95, sum(rate(sira_inference_latency_seconds_bucket{model_role="canary"}[5m])) by (le)) /
           histogram_quantile(0.95, sum(rate(sira_inference_latency_seconds_bucket{model_role="production"}[5m])) by (le))) > 1.3
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Canary latency 30% worse than production"

      # No models loaded
      - alert: SIRANoModelsLoaded
        expr: sira_models_loaded == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "No models loaded in inference service"
```

## Security

### Authentication

**JWT (External Clients):**
```bash
curl -X POST http://localhost:8080/v1/infer \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**Internal Service Token:**
```bash
curl -X POST http://localhost:8080/v1/infer \
  -H "Authorization: Bearer $INTERNAL_SERVICE_TOKEN" \
  -d '{...}'
```

**mTLS (Service-to-Service):**
```bash
curl --cert client.crt --key client.key --cacert ca.crt \
  https://sira-inference.molam.svc.cluster.local/v1/infer \
  -d '{...}'
```

### RBAC Roles

- `sira_service`: Can call inference endpoint
- `ml_ops`: Can manage canary, list models
- `pay_admin`: Can view canary config
- `internal_service`: Full access (bypasses role checks)
- `fraud_analyst`: Can call inference endpoint

### Secrets Management

All secrets stored in Vault/KMS:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT signing key
- `INTERNAL_SERVICE_TOKEN`: Service-to-service auth
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: S3 access

## Troubleshooting

### High Latency

**Diagnosis:**
```bash
# Check metrics
curl -s http://localhost:8080/metrics | grep sira_inference_latency_seconds_bucket

# Check cache hit rate
curl -s http://localhost:8080/metrics | grep sira_inference_cache

# View logs
kubectl logs -n molam -l app=sira-inference --tail=100
```

**Solutions:**
- Increase cache size/TTL
- Scale up replicas
- Upgrade to GPU instances
- Optimize model (quantization, pruning)

### Model Not Loading

**Diagnosis:**
```bash
# Check model manager status
curl http://localhost:8080/readyz

# View logs
kubectl logs -n molam -l app=sira-inference | grep "model"

# Check S3 access
kubectl exec -it -n molam sira-inference-xxx -- aws s3 ls s3://molam-models/
```

**Solutions:**
- Verify S3 bucket permissions
- Check model path in database
- Ensure ONNX model format compatibility

### Canary Auto-Rollback

**Diagnosis:**
```sql
-- Check rollback logs
SELECT * FROM sira_canary_rollback_log
ORDER BY created_at DESC
LIMIT 10;

-- View trigger metrics
SELECT * FROM sira_inference_metrics
WHERE model_role = 'canary'
  AND window_start >= now() - INTERVAL '1 hour'
ORDER BY window_start DESC;
```

**Solutions:**
- Review rollback reason (high_error_rate, high_latency, fp_rate_threshold)
- Retrain model with more data
- Adjust rollback thresholds

## License

MIT License - Molam Engineering

## Support

- GitHub Issues: https://github.com/molam/sira-inference/issues
- Slack: #sira-ml-platform
- Email: ml-ops@molam.com
