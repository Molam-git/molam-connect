# Brique 61 - Subscription Analytics & Churn Prevention

**SIRA-Driven Analytics and Churn Prediction for Molam Connect**

## Overview

Brique 61 provides real-time subscription analytics and AI-powered churn prevention capabilities. It calculates key subscription metrics (MRR, ARR, ARPU, CLTV, churn rate) and uses SIRA ML to predict which customers are at risk of churning, along with recommended retention actions.

## Features Implemented

### ✅ Core Analytics
- **Subscription Metrics Calculation**: MRR, ARR, ARPU, CLTV, churn rate
- **Cohort-Based Analysis**: Track metrics by merchant, date, plan, country, currency
- **Real-Time Updates**: Triggered calculations via API or scheduled workers
- **Database Schema**: Complete SQL migration with indexes and constraints

### ✅ Churn Prediction (SIRA Integration)
- **Risk Scoring**: 0-100 risk score for each subscription
- **Reason Prediction**: Identifies likely churn reasons (failed_payment, low_usage, voluntary)
- **Recommended Actions**: AI-generated retention strategies (discounts, offers, emails)
- **Status Tracking**: pending → applied/rejected workflow
- **Feedback Loop**: Human feedback collection for SIRA learning

### ✅ API Endpoints
- `GET /api/analytics/subscriptions/metrics` - Fetch analytics for merchant
- `POST /api/analytics/subscriptions/metrics/calculate` - Trigger calculation
- `GET /api/analytics/subscriptions/churn` - Get churn predictions
- `POST /api/analytics/subscriptions/churn/:id/feedback` - Submit feedback on predictions

### ✅ Background Workers
- **Analytics Generator**: Periodically calculates metrics for all merchants
- **Churn Predictor**: Runs SIRA predictions on active subscriptions
- **Configurable Intervals**: Environment variable control

### ✅ Security & Compliance
- JWT-based authentication with RBAC
- Role-based access: `merchant_admin`, `billing_ops`
- Audit trail in `molam_audit_logs`
- Transaction safety with BEGIN/COMMIT/ROLLBACK

## Architecture

```
brique-61/
├── migrations/
│   └── 061_subscription_analytics.sql    # Schema: analytics, predictions, feedback
├── src/
│   ├── services/
│   │   ├── analyticsService.ts          # Calculate MRR, ARR, ARPU, CLTV
│   │   └── churnService.ts              # SIRA predictions, feedback
│   ├── routes/
│   │   └── analyticsRoutes.ts           # REST API endpoints
│   ├── workers/
│   │   ├── analyticsGenerator.ts        # Periodic metrics calculation
│   │   └── churnPredictor.ts            # Periodic churn prediction
│   ├── utils/
│   │   ├── db.ts                        # PostgreSQL connection pool
│   │   └── authz.ts                     # JWT + RBAC middleware
│   └── server.ts                        # Express server (port 8061)
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

### subscription_analytics
Stores cohort-based subscription metrics:
- `merchant_id`, `cohort_date`, `plan_id`, `country`, `currency`
- `mrr`, `arr`, `arpu`, `cltv`, `churn_rate`
- `active_count`, `cancelled_count`

### churn_predictions
SIRA-generated churn predictions:
- `subscription_id`, `merchant_id`, `risk_score` (0-100)
- `predicted_reason` (failed_payment, low_usage, voluntary)
- `recommended_action` (JSONB: discount, offer, email)
- `status` (pending, applied, rejected)

### sira_feedback
Human feedback for ML improvement:
- `churn_prediction_id`, `actor_id`, `actor_role` (ops/merchant/system)
- `action` (approve, reject, modify)
- `details` (JSONB)

### molam_audit_logs
Full audit trail for compliance

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create `.env` from `.env.example`:
```bash
NODE_ENV=development
PORT=8061
DATABASE_URL=postgresql://user:password@localhost:5432/molam

# External APIs
SUBSCRIPTIONS_API_URL=http://localhost:8060
SIRA_API_URL=http://localhost:8059
WEBHOOKS_API_URL=http://localhost:8045

# Worker Configuration
ANALYTICS_INTERVAL_MS=3600000          # 1 hour
CHURN_PREDICTION_INTERVAL_MS=86400000  # 24 hours
CHURN_RISK_THRESHOLD=50                # Minimum risk score to create prediction
```

### 3. Run Migrations
```bash
psql $DATABASE_URL -f migrations/061_subscription_analytics.sql
```

### 4. Build
```bash
npm run build
```

## Usage

### Start API Server
```bash
npm start
# or for development:
npm run dev
```

### Start Workers
```bash
# Terminal 1: Analytics Generator
npm run worker:analytics

# Terminal 2: Churn Predictor
npm run worker:churn
```

## API Examples

### Get Subscription Metrics
```bash
curl -X GET http://localhost:8061/api/analytics/subscriptions/metrics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
[
  {
    "id": "uuid",
    "merchant_id": "merchant-123",
    "cohort_date": "2025-11-06",
    "mrr": 15000.00,
    "arr": 180000.00,
    "arpu": 50.00,
    "cltv": 1200.00,
    "churn_rate": 5.2,
    "active_count": 300,
    "cancelled_count": 15,
    "created_at": "2025-11-06T10:00:00Z"
  }
]
```

### Trigger Analytics Calculation
```bash
curl -X POST http://localhost:8061/api/analytics/subscriptions/metrics/calculate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Churn Predictions
```bash
curl -X GET http://localhost:8061/api/analytics/subscriptions/churn \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": "pred-uuid",
    "subscription_id": "sub-123",
    "merchant_id": "merchant-123",
    "risk_score": 85.3,
    "predicted_reason": "failed_payment",
    "recommended_action": {
      "type": "discount",
      "value": 10
    },
    "status": "pending",
    "created_at": "2025-11-06T10:00:00Z"
  }
]
```

### Submit Feedback on Prediction
```bash
curl -X POST http://localhost:8061/api/analytics/subscriptions/churn/pred-uuid/feedback \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "details": {
      "note": "Good prediction, applying discount",
      "modified_action": null
    }
  }'
```

## Key Metrics Explained

- **MRR (Monthly Recurring Revenue)**: `active_count × ARPU`
- **ARR (Annual Recurring Revenue)**: `MRR × 12`
- **ARPU (Average Revenue Per User)**: Average subscription value
- **CLTV (Customer Lifetime Value)**: `ARPU × 24` (2-year average)
- **Churn Rate**: `(cancelled_count / total_count) × 100`

## Churn Risk Scoring

| Risk Score | Severity | Action Priority |
|-----------|----------|-----------------|
| 0-30 | Low | Monitor |
| 31-60 | Medium | Engagement email |
| 61-80 | High | Special offer |
| 81-100 | Critical | Urgent retention discount |

## SIRA Integration

### Current Status: Mock Implementation

The `predictChurnRisk()` function in [churnService.ts:111](src/services/churnService.ts#L111) currently uses a mock implementation. To integrate real SIRA ML:

```typescript
// Replace mock with actual SIRA API call
export async function predictChurnRisk(subscription: any): Promise<{
  risk_score: number;
  predicted_reason: string;
  recommended_action: any;
}> {
  const response = await fetch(`${process.env.SIRA_API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription_id: subscription.id,
      customer_id: subscription.customer_id,
      plan_id: subscription.plan_id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      quantity: subscription.quantity,
      metadata: subscription.metadata,
    }),
  });

  return await response.json();
}
```

## What Remains to Be Implemented

### 🔲 React UI Components
Create `web/src/AnalyticsDashboard.tsx`:
- Real-time metrics dashboard (MRR, ARR, churn trends)
- Churn predictions table with risk badges
- Feedback submission interface
- Charts: MRR over time, churn rate trends, cohort analysis

Example structure:
```typescript
import { useEffect, useState } from 'react';

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState([]);
  const [churnPredictions, setChurnPredictions] = useState([]);

  // Fetch data, render charts, handle feedback submission
}
```

### 🔲 Advanced Analytics
- **Cohort Retention Analysis**: Track subscription cohorts over time
- **Segmentation**: Analytics by plan, country, currency
- **Trends & Forecasting**: Predict future MRR/churn trends
- **Benchmarking**: Industry comparisons

### 🔲 Enhanced SIRA Features
- **Custom ML Models**: Train on merchant-specific data
- **A/B Testing**: Test different retention strategies
- **Real-Time Scoring**: Update risk scores on customer actions
- **Multi-Factor Analysis**: Combine usage, payment, support data

### 🔲 Integration with Other Briques
- **Brique 60 (Subscriptions)**: Real-time subscription events
- **Brique 45 (Webhooks)**: Send churn alerts to merchants
- **Brique 46 (Billing)**: Apply recommended actions (discounts, retries)
- **Brique 59 (SIRA Analytics)**: Send feedback for ML training

### 🔲 Testing
- Unit tests for services (Jest)
- Integration tests for API routes (Supertest)
- Worker tests with mock database
- End-to-end tests for feedback loop

### 🔲 Observability
- Prometheus metrics (prediction accuracy, feedback rates)
- Grafana dashboards for analytics trends
- Alerting for high churn risk cohorts
- Performance monitoring (P95, P99 latency)

## Performance Targets

- **API Response Time**: P95 < 200ms
- **Analytics Calculation**: < 5 seconds per merchant
- **Churn Prediction**: < 2 seconds per subscription
- **Database Queries**: All queries use indexes

## Security Considerations

- All endpoints require valid JWT
- Role-based access control (RBAC)
- Audit logs for all feedback actions
- No PII in prediction metadata
- Merchant data isolation

## Troubleshooting

### Workers not running
- Check `DATABASE_URL` environment variable
- Ensure subscriptions table exists (run Brique 60 migrations first)
- Verify workers have database access

### No predictions generated
- Check `CHURN_RISK_THRESHOLD` (default: 50)
- Ensure active subscriptions exist
- Verify SIRA API is reachable (when integrated)

### Analytics showing 0 values
- Run `POST /api/analytics/subscriptions/metrics/calculate` manually
- Check that subscriptions have valid `plan_id` references
- Verify `plans` table has correct amounts

## Build Status

✅ **Compilation**: 0 errors
✅ **Services**: Analytics, Churn
✅ **API Routes**: 4 endpoints
✅ **Workers**: 2 background jobs
✅ **Database Schema**: Complete with indexes and triggers

## Next Steps

1. Implement React UI dashboard
2. Replace mock SIRA with real ML API
3. Add integration tests
4. Connect to Brique 45 (Webhooks) for alerts
5. Add Grafana dashboards for ops monitoring

---

**Port**: 8061
**Dependencies**: PostgreSQL, Brique 60 (Subscriptions)
**External APIs**: SIRA (Brique 59), Webhooks (Brique 45)

Built with ❤️ for Molam Connect
