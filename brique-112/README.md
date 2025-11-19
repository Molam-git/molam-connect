# Brique 112: SIRA Training & Data Pipeline

Complete ML infrastructure for SIRA (Security Intelligence Risk Analytics) including dataset management, model training, canary deployment, and explainability.

## Overview

Brique 112 provides a production-ready machine learning pipeline for fraud detection:

- **Dataset Storage**: PII-redacted event ingestion with labeling
- **Model Registry**: Full lifecycle management (candidate → validated → canary → production → archived)
- **Canary Deployment**: Traffic splitting with auto-rollback
- **Training Pipeline**: Python-based training with LightGBM
- **Explainability**: SHAP integration for feature importance
- **Metrics Monitoring**: Performance tracking and drift detection

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Ingestion Layer                     │
├─────────────────────────────────────────────────────────────┤
│  • Wallet transactions → Feature extraction → PII redaction │
│  • Auto-labeling based on transaction outcomes              │
│  • Manual labeling via API                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Training Pipeline (Python)                │
├─────────────────────────────────────────────────────────────┤
│  • Load events from PostgreSQL                              │
│  • Feature engineering (bucketing, encoding, time features) │
│  • LightGBM training with early stopping                    │
│  • SHAP explainability                                      │
│  • Model upload to S3                                       │
│  • Register in model registry (status: candidate)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Model Registry API                     │
├─────────────────────────────────────────────────────────────┤
│  • List/Get models                                          │
│  • Promote: candidate → validated → canary → production     │
│  • Record predictions and metrics                           │
│  • Query model performance over time                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Canary Deployment Service                │
├─────────────────────────────────────────────────────────────┤
│  • Deterministic routing (hash-based traffic split)         │
│  • Configurable rollout percentage (0-100%)                 │
│  • Health monitoring with auto-rollback                     │
│  • Gradual promotion to production                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Inference (Production)                   │
├─────────────────────────────────────────────────────────────┤
│  • Route event to production or canary model                │
│  • Record predictions in database                           │
│  • Calculate real-time metrics                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Dataset Tables

**siradata_events**: Event storage with PII redaction
```sql
event_id UUID PRIMARY KEY
source_module TEXT  -- 'wallet', 'transfer', 'payout'
country TEXT
currency TEXT
features JSONB  -- Redacted features (phone/email hashed, cvv removed)
created_at TIMESTAMPTZ
```

**siradata_labels**: Ground truth labels
```sql
event_id UUID
label TEXT  -- 'fraudulent', 'legit', 'chargeback', etc.
labelled_by TEXT  -- 'sira' (auto), 'analyst_john', etc.
confidence NUMERIC(5,4)
review_notes TEXT
created_at TIMESTAMPTZ
```

### Model Registry Tables

**siramodel_registry**: Model lifecycle management
```sql
model_id UUID PRIMARY KEY
name TEXT
version TEXT
product TEXT  -- 'wallet', 'transfer', etc.
algorithm TEXT  -- 'lightgbm', 'pytorch', etc.
storage_s3_key TEXT  -- S3 URI
feature_names TEXT[]
metrics JSONB  -- {auc: 0.95, precision: 0.87, ...}
status TEXT  -- 'candidate', 'validated', 'canary', 'production', 'archived'
training_config JSONB
shap_summary JSONB
created_at TIMESTAMPTZ
```

**sira_canary_config**: Canary deployment configuration
```sql
product TEXT UNIQUE
canary_model_id UUID
production_model_id UUID
canary_percent INT  -- 0-100
rollback_threshold JSONB  -- {error_rate: 0.05, latency_p99: 500}
started_at TIMESTAMPTZ
```

**siramodel_predictions**: Prediction logging
```sql
prediction_id UUID PRIMARY KEY
model_id UUID
event_id UUID
score NUMERIC(10,8)
prediction JSONB
model_version TEXT
created_at TIMESTAMPTZ
```

## API Endpoints

### Data Ingestion

**POST /api/sira/ingest**
```json
{
  "event_id": "123e4567-e89b-12d3-a456-426614174000",
  "source_module": "wallet",
  "features": {
    "amount": 150.50,
    "payment_method": "card",
    "phone": "+33612345678"  // Will be hashed
  },
  "country": "FR",
  "currency": "EUR"
}
```

**POST /api/sira/label**
```json
{
  "event_id": "123e4567-e89b-12d3-a456-426614174000",
  "label": "fraudulent",
  "labelled_by": "analyst_john",
  "confidence": 0.95,
  "review_notes": "High velocity pattern detected"
}
```

**GET /api/sira/dataset/summary**
Response:
```json
{
  "total_events": 125000,
  "labeled_events": 23450,
  "label_distribution": {
    "legit": 20100,
    "fraudulent": 2350,
    "chargeback": 800,
    "review": 200
  }
}
```

### Model Registry

**GET /api/sira/models**
Query params: `product`, `status`, `limit`

**POST /api/sira/models**
```json
{
  "name": "sira-fraud-detector",
  "version": "v20240115_143000",
  "product": "wallet",
  "algorithm": "lightgbm",
  "storage_s3_key": "s3://molam-models/sira-models/wallet/model.txt",
  "feature_names": ["amount_log", "hour_of_day", "is_weekend", ...],
  "metrics": {
    "auc": 0.951,
    "precision": 0.873,
    "recall": 0.892
  }
}
```

**POST /api/sira/models/:modelId/promote**
```json
{
  "target": "production"  // 'validated' | 'canary' | 'production'
}
```
Requires role: `ml_ops` for production promotion

**POST /api/sira/models/:modelId/metrics**
```json
{
  "metric_name": "auc",
  "metric_value": 0.948,
  "metadata": {"dataset": "val_20240115"}
}
```

**GET /api/sira/models/:modelId/metrics**

### Canary Deployment

**GET /api/sira/canary/:product**
Response:
```json
{
  "product": "wallet",
  "canary_model_id": "123e4567-...",
  "production_model_id": "987f6543-...",
  "canary_percent": 10,
  "rollback_threshold": {
    "error_rate": 0.05,
    "latency_p99": 500
  }
}
```

**POST /api/sira/canary/:product**
```json
{
  "canary_model_id": "123e4567-e89b-12d3-a456-426614174000",
  "production_model_id": "987f6543-e21c-34d5-b678-537625285111",
  "canary_percent": 10,
  "rollback_threshold": {
    "error_rate": 0.05
  }
}
```

**POST /api/sira/canary/:product/stop**
Stops canary (sets percent to 0)

**GET /api/sira/canary/:product/health**
Response:
```json
{
  "healthy": true,
  "canary_metrics": {...},
  "production_metrics": {...}
}
```

## Training Pipeline

### Local Development

```bash
# Install dependencies
cd brique-112/training
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/molam"
export S3_BUCKET="molam-models"
export MODEL_NAME="sira-fraud-detector"
export PRODUCT="wallet"

# Run training
python train.py 2024-01-15
```

### Docker Training Job

```bash
# Build image
docker build -t sira-training:latest brique-112/training

# Run training job
docker run --rm \
  -e DATABASE_URL="postgresql://postgres:postgres@db:5432/molam" \
  -e S3_BUCKET="molam-models" \
  -e AWS_ACCESS_KEY_ID="..." \
  -e AWS_SECRET_ACCESS_KEY="..." \
  sira-training:latest \
  python train.py 2024-01-15
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: sira-training
spec:
  schedule: "0 2 * * 0"  # Every Sunday at 2am
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: train
            image: sira-training:latest
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: url
            - name: S3_BUCKET
              value: "molam-models"
            command: ["python", "train.py", "{{ now | date: '%Y-%m-%d' }}"]
          restartPolicy: OnFailure
```

## Canary Deployment Workflow

### 1. Train New Model
```bash
python train.py 2024-01-15
# Output: Model ID = 123e4567-e89b-12d3-a456-426614174000
# Status: candidate
# Metrics: AUC=0.951
```

### 2. Validate Model
```bash
curl -X POST http://localhost:3000/api/sira/models/123e4567.../promote \
  -H "Content-Type: application/json" \
  -d '{"target": "validated"}'
```

### 3. Start Canary (10% traffic)
```bash
curl -X POST http://localhost:3000/api/sira/canary/wallet \
  -H "Content-Type: application/json" \
  -d '{
    "canary_model_id": "123e4567-e89b-12d3-a456-426614174000",
    "production_model_id": "987f6543-e21c-34d5-b678-537625285111",
    "canary_percent": 10,
    "rollback_threshold": {"error_rate": 0.05}
  }'
```

### 4. Monitor Health
```bash
# Check canary health
curl http://localhost:3000/api/sira/canary/wallet/health

# If healthy, increase to 25%
curl -X POST http://localhost:3000/api/sira/canary/wallet \
  -d '{"canary_percent": 25, ...}'

# Continue gradual rollout: 10% → 25% → 50% → 100%
```

### 5. Promote to Production
```bash
# Once canary reaches 100% and is stable
curl -X POST http://localhost:3000/api/sira/models/123e4567.../promote \
  -d '{"target": "production"}'

# Stop canary
curl -X POST http://localhost:3000/api/sira/canary/wallet/stop
```

## Explainability with SHAP

SHAP values are computed during training and stored in `siramodel_registry.shap_summary`:

```json
{
  "feature_importance": {
    "amount_log": 0.234,
    "hour_of_day": 0.189,
    "is_international": 0.156,
    ...
  },
  "top_features": ["amount_log", "hour_of_day", "is_international", ...]
}
```

Access via API:
```bash
curl http://localhost:3000/api/sira/models/:modelId
```

## Monitoring & Observability

### Key Metrics to Track

1. **Model Performance**
   - AUC, Precision, Recall
   - False Positive Rate
   - Precision @ 90% Recall

2. **Canary Health**
   - Error rate (canary vs production)
   - Latency (p50, p95, p99)
   - Prediction distribution drift

3. **Dataset Quality**
   - Label distribution over time
   - Feature completeness
   - Data freshness

### Alerts

Configure alerts for:
- Canary error rate > threshold → Auto-rollback
- AUC drop > 5% → Retrain model
- Label imbalance > 95% → Review auto-labeling
- Prediction latency > 500ms → Investigate

## CI/CD Integration

### GitOps Example

```yaml
# .github/workflows/train-model.yml
name: Train SIRA Model

on:
  schedule:
    - cron: '0 2 * * 0'  # Weekly
  workflow_dispatch:
    inputs:
      as_of_date:
        description: 'Training date (YYYY-MM-DD)'
        required: true

jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build training image
        run: docker build -t sira-training brique-112/training

      - name: Run training
        run: |
          docker run --rm \
            -e DATABASE_URL="${{ secrets.DATABASE_URL }}" \
            -e S3_BUCKET="molam-models" \
            -e AWS_ACCESS_KEY_ID="${{ secrets.AWS_ACCESS_KEY_ID }}" \
            -e AWS_SECRET_ACCESS_KEY="${{ secrets.AWS_SECRET_ACCESS_KEY }}" \
            sira-training \
            python train.py ${{ github.event.inputs.as_of_date }}

      - name: Notify on completion
        run: echo "Model trained and registered in registry"
```

## Testing

```bash
# Run all tests
npm test brique-112/tests/dataIngestion.test.js
npm test brique-112/tests/canary.test.js

# Run with coverage
npm test -- --coverage
```

## Security Considerations

1. **PII Redaction**: All sensitive fields (phone, email, PAN) are hashed before storage
2. **Role-Based Access**: Production promotion requires `ml_ops` role
3. **Immutable Audit Trail**: All model promotions logged in `siramodel_registry`
4. **Signature Verification**: Future enhancement for model signing
5. **Data Retention**: Consider GDPR compliance for event retention

## Troubleshooting

### Training fails with "insufficient data"
- Check dataset summary: `GET /api/sira/dataset/summary`
- Ensure enough labeled events (recommended: >10,000)
- Adjust training window: increase `train_window_days`

### Canary auto-rollback triggered
- Review canary health: `GET /api/sira/canary/:product/health`
- Check rollback threshold settings
- Investigate recent predictions for errors

### Model promotion rejected
- Verify user has `ml_ops` role
- Check model status (must be `validated` → `canary` → `production`)
- Ensure current production model exists

## Future Enhancements

- [ ] PyTorch deep learning support
- [ ] Real-time feature store integration
- [ ] A/B testing framework (beyond canary)
- [ ] Drift detection alerts
- [ ] Model versioning with Git SHA
- [ ] Explainability API (SHAP on-demand)
- [ ] Multi-model ensembles
- [ ] AutoML hyperparameter tuning

## References

- [LightGBM Documentation](https://lightgbm.readthedocs.io/)
- [SHAP Documentation](https://shap.readthedocs.io/)
- [Canary Deployment Best Practices](https://martinfowler.com/bliki/CanaryRelease.html)
- Molam Brique 111-2: AI Config Advisor (upstream)
