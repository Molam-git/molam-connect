# Brique 61 - Industrial ML Platform for Churn Prevention

**Complete Production ML Infrastructure with Feature Store, Model Registry, and SIRA ML**

## Overview

Brique 61 is a **production-grade machine learning platform** for subscription analytics and churn prevention. It implements a full MLOps pipeline including:

- **Feature Store**: Event-driven feature engineering from Kafka
- **ML Training Pipeline**: Automated XGBoost model training with experiment tracking
- **Model Registry**: Version management with staging → canary → production lifecycle
- **Real-Time Scoring**: FastAPI microservice with SHAP explanations
- **Continuous Learning**: Human-in-the-loop feedback for model improvement
- **Safe Deployments**: Canary releases with automatic rollback
- **Analytics Dashboard**: Real-time MRR, ARR, ARPU, CLTV, churn rate

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOLAM CONNECT - BRIQUE 61                     │
│                 Subscription Analytics & Churn ML                │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐        ┌──────────────────┐
│  Kafka Events    │───────▶│ Feature Ingest   │
│  (Subscriptions) │        │     Worker       │
└──────────────────┘        └────────┬─────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│              PostgreSQL Feature Store                        │
│  • subscription_events_raw (raw events)                      │
│  • subscription_features (engineered features)               │
│  • subscription_analytics (MRR, ARR, churn metrics)          │
└────────────────────┬─────────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
┌──────────────────┐      ┌──────────────────┐
│  Python Trainer  │      │  Scoring Service │
│    (XGBoost)     │      │    (FastAPI)     │
│                  │      │   • SHAP explain │
│  • Train model   │      │   • Real-time ML │
│  • S3 upload     │      └─────────┬────────┘
│  • Registry save │                │
└─────────┬────────┘                │
          │                         │
          ▼                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Model Registry                            │
│  staging → canary (5%) → production (100%) → retired         │
│  • Versioning • Metrics tracking • Rollback capability       │
└────────────────────┬─────────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
┌──────────────────┐      ┌──────────────────┐
│  Node.js API     │      │  Feedback Loop   │
│  • Predictions   │      │  • Ops approval  │
│  • Actions       │      │  • Merchant input│
│  • Analytics     │      │  • Retrain signal│
└──────────────────┘      └──────────────────┘
```

## Features Delivered

### ✅ Core Infrastructure

1. **Feature Store** ([migrations/061_subscription_analytics_ml.sql](migrations/061_subscription_analytics_ml.sql))
   - `subscription_events_raw` - Raw event ingestion
   - `subscription_features` - Engineered ML features
   - Automatic daily feature snapshots

2. **Model Registry** ([migrations/061_subscription_analytics_ml.sql](migrations/061_subscription_analytics_ml.sql))
   - `model_registry` - Version control (staging/canary/production/retired)
   - `sira_training_logs` - Experiment tracking and audit
   - S3/KMS encrypted storage for model artifacts

3. **Churn Predictions** ([migrations/061_subscription_analytics_ml.sql](migrations/061_subscription_analytics_ml.sql))
   - `churn_predictions` - Risk scores (0-100) with explanations
   - `sira_feedback` - Human feedback loop
   - Action tracking (suggested/actioned/dismissed)

### ✅ ML Training Pipeline

**Python Training** ([src/sira/trainer/train_churn.py](src/sira/trainer/train_churn.py))
- XGBoost classifier with early stopping
- Feature loading from PostgreSQL
- Automatic train/test split with stratification
- Metrics: AUC, Precision, Recall, F1
- S3 upload with encrypted storage
- Model registry integration

**Run training:**
```bash
npm run python:train
# or directly:
python3 src/sira/trainer/train_churn.py
```

### ✅ Scoring Microservice

**FastAPI Service** ([src/sira/scoring_service.py](src/sira/scoring_service.py))
- Real-time churn prediction endpoint
- SHAP explainability (top 5 features)
- Batch scoring support
- Health check and monitoring

**Endpoints:**
- `POST /v1/score` - Single prediction with explanations
- `POST /v1/batch_score` - Batch predictions
- `GET /health` - Service health check

**Run scorer:**
```bash
npm run python:scorer
# Runs on port 8062
```

### ✅ Feature Engineering

**Kafka Ingestion Worker** ([src/workers/featureIngest.ts](src/workers/featureIngest.ts))
- Consumes subscription events from Kafka
- Computes incremental features
- Updates feature store (upsert by day)

**Feature Computation** ([src/lib/featureUtils.ts](src/lib/featureUtils.ts))
- Payment features: `failed_payment_count_30d`, `payment_success_rate`
- Usage features: `login_count_7d`, `days_since_last_login`
- Subscription features: `plan_age_days`, `subscription_changes_count`
- One-hot encoding for categorical features
- Normalization utilities

**Run worker:**
```bash
npm run worker:features
```

### ✅ Model Orchestration

**Retrain Orchestrator** ([src/workers/retrainOrchestrator.ts](src/workers/retrainOrchestrator.ts))
- Scheduled automatic retraining (daily by default)
- Triggers Python training pipeline
- Promotes models: staging → canary → production
- Automatic rollback on metric drop
- Canary evaluation after 24h

**Run orchestrator:**
```bash
npm run worker:retrain
```

### ✅ API Endpoints

**SIRA Prediction Routes** ([src/routes/siraPredictionsRoutes.ts](src/routes/siraPredictionsRoutes.ts))
- `POST /api/sira/score` - Generate churn prediction
- `GET /api/sira/predictions` - List predictions for merchant
- `POST /api/sira/action/:id/accept` - Accept recommended action
- `POST /api/sira/action/:id/dismiss` - Dismiss prediction
- `POST /api/sira/feedback` - Submit feedback for ML learning

**Analytics Routes** ([src/routes/analyticsRoutes.ts](src/routes/analyticsRoutes.ts))
- `GET /api/analytics/subscriptions/metrics` - MRR, ARR, ARPU, CLTV
- `POST /api/analytics/subscriptions/metrics/calculate` - Trigger calculation
- `GET /api/analytics/subscriptions/churn` - Churn predictions
- `POST /api/analytics/subscriptions/churn/:id/feedback` - Feedback submission

## Setup & Installation

### 1. Prerequisites

- **Node.js** 18+ (TypeScript/Express API)
- **Python** 3.9+ (ML training & scoring)
- **PostgreSQL** 14+ (feature store & registry)
- **Kafka** (event streaming) - optional, can mock
- **AWS S3** (model storage) - optional, local fallback available

### 2. Install Node Dependencies

```bash
npm install
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/molam

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=subscription.events

# AWS S3 (optional)
MODEL_S3_BUCKET=molam-ml-models
AWS_REGION=us-east-1

# SIRA Scoring
SIRA_SCORER_URL=http://localhost:8062
SIRA_MODEL_PATH=/models/sira_churn_v1_latest.joblib

# Training
SIRA_MIN_AUC=0.70
SIRA_CANARY_PERCENT=5
SIRA_MAX_AUC_DROP=0.05
```

### 5. Run Database Migrations

```bash
psql $DATABASE_URL -f migrations/061_subscription_analytics_ml.sql
```

### 6. Build TypeScript

```bash
npm run build
```

## Running the Platform

### Full Production Stack

```bash
# Terminal 1: Main API Server
npm start

# Terminal 2: Feature Ingestion (Kafka consumer)
npm run worker:features

# Terminal 3: Analytics Generator
npm run worker:analytics

# Terminal 4: Churn Predictor
npm run worker:churn

# Terminal 5: Retrain Orchestrator
npm run worker:retrain

# Terminal 6: Python Scoring Service
npm run python:scorer
```

### Development Mode

```bash
# API server with auto-reload
npm run dev

# Run single training
npm run python:train
```

## ML Pipeline Workflow

### 1. Feature Ingestion

```
Subscription Event → Kafka → Feature Ingest Worker
  ↓
Extract features (payments, logins, usage)
  ↓
Update subscription_features table (daily snapshot)
```

### 2. Model Training

```
Training Trigger (scheduled or manual)
  ↓
Load features from PostgreSQL (last 180 days)
  ↓
Train XGBoost model with cross-validation
  ↓
Evaluate on test set (AUC, Precision, Recall)
  ↓
Upload model artifact to S3
  ↓
Register in model_registry (status: staging)
```

### 3. Model Promotion (Canary)

```
Orchestrator detects new staging model
  ↓
Validate metrics (AUC >= threshold)
  ↓
Promote to canary (5% traffic)
  ↓
Wait 24 hours
  ↓
Evaluate canary vs production metrics
  ↓
Decision:
  • AUC drop < 0.05 → Promote to production
  • AUC drop >= 0.05 → Rollback (mark retired)
```

### 4. Real-Time Scoring

```
API Request: POST /api/sira/score
  ↓
Fetch features for user from feature store
  ↓
Call Python scoring service
  ↓
Model predicts churn probability (0-100)
  ↓
SHAP explains top 5 contributing features
  ↓
Map to recommended action
  ↓
Persist prediction to churn_predictions table
  ↓
Return to API caller
```

### 5. Feedback Loop

```
Merchant/Ops reviews prediction
  ↓
Accept or Dismiss action
  ↓
Submit feedback via POST /api/sira/feedback
  ↓
Store in sira_feedback table
  ↓
If feedback count > threshold → Trigger retrain
```

## API Examples

### Generate Churn Prediction

```bash
curl -X POST http://localhost:8061/api/sira/score \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "merchant_id": "merchant-456",
    "features": {
      "failed_payment_count_30d": 2,
      "successful_payment_count_30d": 8,
      "login_count_7d": 3,
      "days_since_last_login": 5,
      "plan_age_days": 180
    }
  }'
```

**Response:**
```json
{
  "id": "pred-uuid",
  "user_id": "user-123",
  "merchant_id": "merchant-456",
  "model_version": "v20251106123000",
  "risk_score": 73.5,
  "predicted_reason": "failed_payment",
  "recommended_action": "retry_payment",
  "decision_context": [
    {"feature": "failed_payment_count_30d", "value": 2, "contribution": 0.15},
    {"feature": "days_since_last_login", "value": 5, "contribution": 0.08}
  ],
  "status": "suggested",
  "predicted_at": "2025-11-06T10:00:00Z"
}
```

### Accept Recommendation

```bash
curl -X POST http://localhost:8061/api/sira/action/pred-uuid/accept \
  -H "Authorization: Bearer YOUR_JWT"
```

### Submit Feedback

```bash
curl -X POST http://localhost:8061/api/sira/feedback \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "churn_prediction_id": "pred-uuid",
    "feedback": {
      "accepted": true,
      "notes": "Customer responded well to discount offer",
      "actual_outcome": "retained"
    }
  }'
```

## Model Performance Metrics

### Training Metrics

- **AUC (Area Under ROC Curve)**: Target ≥ 0.70
- **Precision**: % of predicted churns that actually churned
- **Recall**: % of actual churns that were predicted
- **F1 Score**: Harmonic mean of precision and recall

### Production Monitoring

Query model registry for active production model:

```sql
SELECT model_name, version, status, metrics, created_at
FROM model_registry
WHERE status = 'production'
ORDER BY created_at DESC;
```

Check prediction accuracy:

```sql
SELECT
  COUNT(*) as total_predictions,
  AVG(risk_score) as avg_risk,
  COUNT(*) FILTER (WHERE status = 'actioned') as accepted,
  COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed
FROM churn_predictions
WHERE predicted_at >= NOW() - INTERVAL '7 days';
```

## Security & Compliance

### Authentication & Authorization

- All API endpoints require JWT authentication
- Role-based access control (RBAC): `billing_ops`, `merchant_admin`
- Audit logs for all predictions and actions

### Data Privacy

- Feature store contains only aggregated metrics, not raw PII
- Model artifacts encrypted at rest (S3 KMS)
- Database connections encrypted (SSL/TLS)

### Compliance

- Full audit trail in `molam_audit_logs`
- GDPR: User can request deletion of all predictions
- Model versioning enables regulatory review

## Troubleshooting

### Training Fails

**Error:** "No labeled data found"

**Solution:** Ensure `subscription_features` table has rows with `label` column populated (`churned` or `active`)

```sql
SELECT COUNT(*) FROM subscription_features WHERE label IS NOT NULL;
```

### Scoring Service Unavailable

**Error:** "Connection refused to localhost:8062"

**Solution:** Start the Python scoring service:

```bash
npm run python:scorer
```

### Canary Rollback

**Alert:** "Canary rollback triggered"

**Cause:** New model's AUC dropped > 5% compared to production

**Action:** Review training logs and feature distribution drift

```sql
SELECT * FROM sira_training_logs ORDER BY created_at DESC LIMIT 5;
```

### Kafka Consumer Not Processing

**Error:** "No messages received"

**Solution:**
1. Check Kafka broker connectivity: `telnet localhost 9092`
2. Verify topic exists: `kafka-topics --list --bootstrap-server localhost:9092`
3. Check consumer group lag

## Observability

### Prometheus Metrics

- `sira_predictions_total{model_version}` - Total predictions generated
- `sira_predictions_accepted` - Accepted actions
- `sira_model_training_duration_seconds` - Training time
- `sira_canary_auc_score` - Canary model AUC (gauge)

### Grafana Dashboards

1. **Churn Risk Overview**
   - Risk score distribution (histogram)
   - Predictions per day (time series)
   - Acceptance rate (%)

2. **Model Performance**
   - AUC over time
   - Precision/Recall curves
   - Canary vs Production comparison

3. **Feature Drift**
   - Feature value distributions
   - Missing feature rates
   - Outlier detection

## Advanced Configuration

### Custom Feature Engineering

Edit [src/lib/featureUtils.ts](src/lib/featureUtils.ts) to add new features:

```typescript
// Example: Add card expiry feature
const { rows: cardInfo } = await client.query(
  `SELECT card_expiry_date FROM payment_methods WHERE user_id = $1`,
  [event.user_id]
);

if (cardInfo.length > 0) {
  const expiryDate = new Date(cardInfo[0].card_expiry_date);
  features.card_expiry_delta_days = Math.floor(
    (expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24)
  );
}
```

### Model Hyperparameter Tuning

Edit [src/sira/trainer/train_churn.py](src/sira/trainer/train_churn.py):

```python
model = XGBClassifier(
    n_estimators=300,      # Increase trees
    max_depth=8,           # Deeper trees
    learning_rate=0.03,    # Lower learning rate
    subsample=0.7,         # More aggressive sampling
    colsample_bytree=0.7,
    use_label_encoder=False,
    eval_metric='auc',     # Optimize for AUC directly
    random_state=42
)
```

### SHAP Deep Dive

To get detailed SHAP waterfall plots:

```python
import shap
import matplotlib.pyplot as plt

explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)

# Plot waterfall for first prediction
shap.waterfall_plot(shap.Explanation(
    values=shap_values[0],
    base_values=explainer.expected_value,
    data=X_test.iloc[0]
))
plt.savefig('shap_waterfall.png')
```

## Roadmap & Future Enhancements

### Phase 2 (Future)

- [ ] React UI Dashboard ([web/src/SiraAnalyticsDashboard.tsx](web/src/))
- [ ] Real-time streaming predictions (WebSockets)
- [ ] Multi-model ensemble (XGBoost + LightGBM + Neural Net)
- [ ] AutoML hyperparameter tuning (Optuna)
- [ ] Feature importance tracking over time
- [ ] A/B testing framework for retention strategies
- [ ] External benchmark integration (competitor data)

### Phase 3 (Future)

- [ ] Deep learning models (LSTM for time-series)
- [ ] Real-time feature serving (Redis cache)
- [ ] Multi-tenant model isolation
- [ ] Federated learning (privacy-preserving)
- [ ] Automated feature discovery
- [ ] Explainability UI (SHAP force plots)

## Performance Targets

- **API Response Time**: P95 < 200ms
- **Scoring Latency**: < 50ms per prediction
- **Training Time**: < 10 minutes for 1M samples
- **Feature Ingestion**: < 1 second lag from event to feature store

## Testing

### Unit Tests

```bash
# TypeScript tests
npm test

# Python tests
pytest src/sira/trainer/test_train_churn.py
```

### Integration Tests

```bash
# End-to-end ML pipeline
npm run test:e2e
```

## Contributing

See main [GUIDE-BRIQUES.md](../GUIDE-BRIQUES.md) for development guidelines.

## License

Proprietary - Molam Connect

---

**Build Status:** ✅ 0 TypeScript errors | ✅ Python dependencies ready | ✅ SQL migrations complete

**Port:** 8061 (Node.js API) | 8062 (Python Scorer)

**Dependencies:** PostgreSQL, Kafka, AWS S3, Python 3.9+

Built with ❤️ for Molam Connect
