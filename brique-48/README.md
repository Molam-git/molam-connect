# Brique 48 - Radar Molam (Fraud & Risk Engine)

**Real-time fraud detection & risk scoring with ML, custom rules, and Ops dashboard**

Production-grade fraud detection system similar to Stripe Radar, enriched with SIRA (internal AI), customizable rules by Ops, ML scoring engine, and real-time decisions (block, review, allow).

## Position in Ecosystem

```
Molam Pay (Main Module)
├── Connect (Brique 41) - Merchant accounts
├── Connect Payments (Brique 42) - Payment processing
├── Checkout (Brique 43) - Orchestration
├── Anti-fraude (Brique 44) - SIRA AI/ML
├── Webhooks (Brique 45) - Event delivery
├── Billing (Brique 46) - Invoicing
├── Disputes (Brique 47) - Chargebacks
└── Radar (Brique 48) - Fraud & Risk Engine ✅ NEW
```

## Features

### Real-time Risk Evaluation
- **Decision Model**: `allow`, `review`, `block`
- **Latency**: p95 < 100ms
- **Inputs**: transaction data, user profile, device fingerprint, geolocation, SIRA history
- **Outputs**: decision + confidence + ML score + matched rules + risk flags

### Ops-Configurable Rules
- **DSL Expression**: `if(amount>1000 && country!=merchant_country) then review`
- **Priority-based**: Rules evaluated in order (block > review > allow)
- **Scoped**: Can target specific modules (wallet, connect, shop, eats)
- **A/B Testing**: Test mode for rule validation without affecting production

### ML Scoring (SIRA Integration)
- **Score Range**: 0-100
- **Thresholds**: Configurable (default: block > 90, review > 70, allow < 70)
- **Factors**: ML model provides explainability (velocity, device, geolocation, pattern)
- **Learning Loop**: Outcomes feed back to SIRA for model improvement

### Fraud Detection Patterns
- **Velocity Checks**: Transactions per hour/day/week per merchant
- **Device Fingerprinting**: Track suspicious devices across merchants
- **IP Geolocation**: Detect VPN/proxy, cross-country anomalies
- **Amount Anomalies**: Flag high-value transactions
- **Pattern Recognition**: Multi-account detection, unusual payment methods

### Alert Management
- **Severity Levels**: low, medium, high, critical
- **Categories**: velocity, amount, geolocation, device, pattern
- **Workflow**: open → acknowledged → resolved / false_positive
- **Notifications**: Slack webhooks for critical alerts

## Architecture

```
brique-48/
├── migrations/
│   └── 001_b48_radar.sql          # 8 tables (rules, decisions, alerts, devices, etc.)
│
├── src/
│   ├── server.ts                   # Express API (port 8048)
│   │
│   ├── radar/
│   │   └── engine.ts               # Core risk evaluation engine
│   │
│   ├── routes/
│   │   ├── radar.ts                # Evaluation + merchant endpoints
│   │   └── ops.ts                  # Rule management + alerts
│   │
│   ├── utils/
│   │   ├── db.ts                   # PostgreSQL connection
│   │   └── authz.ts                # JWT + RBAC
│   │
│   └── workers/
│       └── alert-processor.ts      # Background alert processing
│
└── web/
    └── src/
        ├── MerchantFraud.tsx       # Merchant fraud dashboard
        └── RiskOps.tsx             # Ops rule editor & alerts
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (8 tables)
- **AI/ML**: SIRA integration for risk scoring
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: RBAC (merchant_admin, pay_admin, risk_ops, auditor)
- **Observability**: Prometheus metrics

## Installation

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 2. Install dependencies
```bash
cd brique-48
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - MOLAM_ID_JWT_PUBLIC
# - SIRA_URL (or MOCK_SIRA=true)
# - ML thresholds
```

### 4. Create database
```bash
createdb molam_radar
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start services
```bash
# API Server
npm run dev  # Port 8048

# Alert Processor Worker (in separate terminal)
npm run worker:alerts
```

## API Endpoints

### Risk Evaluation (Internal)

- `POST /api/radar/evaluate` - Evaluate transaction risk

**Request**:
```json
{
  "id": "tx_abc123",
  "type": "payment",
  "merchant_id": "merchant-uuid",
  "user_id": "user-uuid",
  "amount": 1500.00,
  "currency": "USD",
  "country": "FR",
  "merchant_country": "US",
  "payment_method": "card",
  "device_id": "device_fingerprint",
  "ip_address": "203.0.113.42"
}
```

**Response**:
```json
{
  "decision": "review",
  "confidence": 75,
  "ml_score": 82.5,
  "matched_rules": ["High Amount Review", "Cross-Country Review"],
  "reason": "High Amount Review",
  "risk_flags": ["high_velocity_1h", "vpn_or_proxy"],
  "processing_time_ms": 45
}
```

### Merchant Portal

- `GET /api/radar/merchants/:id/decisions` - List fraud decisions
- `GET /api/radar/merchants/:id/profile` - Risk profile
- `GET /api/radar/decisions/:id` - Decision details

### Ops Dashboard

#### Rules Management
- `GET /api/ops/radar/rules` - List rules
- `POST /api/ops/radar/rules` - Create rule
- `PUT /api/ops/radar/rules/:id` - Update rule
- `DELETE /api/ops/radar/rules/:id` - Delete rule

#### Alerts
- `GET /api/ops/radar/alerts` - List alerts
- `POST /api/ops/radar/alerts/:id/acknowledge` - Acknowledge alert
- `POST /api/ops/radar/alerts/:id/resolve` - Resolve alert

#### Statistics
- `GET /api/ops/radar/stats` - Radar statistics

## Workflow

### 1. Transaction Evaluation

```bash
POST /api/radar/evaluate
```

**Process**:
1. Load active risk rules (priority ASC)
2. Evaluate each rule against transaction
3. Calculate velocity (transactions per hour/day)
4. Check device fingerprint risk
5. Check IP geolocation (VPN/proxy detection)
6. Call SIRA ML model for scoring
7. Apply thresholds (block > 90, review > 70)
8. Store decision in database
9. Create alert if high risk
10. Return decision (< 100ms)

### 2. Rule Evaluation (DSL)

```javascript
// Example rule
if(amount>1000 && country!=merchant_country) then review

// Evaluation
- Extract condition: amount>1000 && country!=merchant_country
- Replace variables: 1500>1000 && "FR"!="US"
- Evaluate: true
- Action: review
```

### 3. Alert Creation

**Triggers**:
- Decision = block
- ML score > 90
- Velocity > threshold
- Device flagged as suspicious

**Workflow**:
```
Transaction blocked → Alert created (severity: critical)
  ↓
Ops sees alert in dashboard
  ↓
Ops investigates (view decision details, merchant profile)
  ↓
Ops acknowledges alert
  ↓
Ops resolves (mark as fraud / false positive)
  ↓
Feedback to SIRA for model improvement
```

## Database Schema

### risk_rules (10 fields)
- Ops-configurable rules with DSL expressions
- Priority-based evaluation
- Scoped to specific modules

### risk_decisions (20 fields)
- Every transaction evaluation
- Decision, confidence, ML score, matched rules
- Velocity metrics, risk flags
- Processing time tracking

### risk_alerts (11 fields)
- High-priority fraud alerts
- Severity levels, categories
- Alert management workflow

### device_fingerprints (11 fields)
- Device tracking across merchants
- Suspicious device detection
- Transaction count, risk score

### merchant_risk_profiles (11 fields)
- Historical risk metrics per merchant
- Fraud rate, average ML score
- Risk tier classification

## Security & Compliance

### RBAC Roles
- **merchant_admin**: View own decisions and profile
- **pay_admin**: Full access to decisions and alerts
- **risk_ops**: Manage rules, alerts, and configurations
- **auditor**: Read-only access to all data

### Compliance Features
1. **Audit Trail**: Immutable logs for all decisions
2. **Explainability**: Every decision has matched rules + ML factors
3. **Privacy**: Device fingerprints anonymized
4. **Data Retention**: Configurable retention policies
5. **GDPR**: Support for data export and deletion

## Metrics (Prometheus)

```
b48_risk_decisions_total{decision,reason}
b48_risk_evaluation_duration_ms
b48_fraud_rate{merchant_id}
b48_false_positive_rate{merchant_id}
b48_rule_hits_total{rule_name}
b48_ml_score_avg{merchant_id}
b48_alerts_total{severity,category}
b48_sira_call_duration_ms
```

## SLO Targets

- **Evaluation latency**: p95 < 100ms
- **Availability**: 99.99%
- **False positive rate**: < 1%
- **SIRA scoring**: < 50ms
- **Alert response time**: Critical alerts < 5 minutes

## Integration Points

### Brique 42 (Connect Payments)
```typescript
// Before payment authorization
const riskDecision = await fetch(`${RADAR_URL}/api/radar/evaluate`, {
  method: "POST",
  body: JSON.stringify(payment)
});

if (riskDecision.decision === "block") {
  return { error: "Transaction blocked due to fraud risk" };
} else if (riskDecision.decision === "review") {
  // Hold payment for manual review
}
```

### Brique 44 (SIRA)
```typescript
// ML scoring
POST /sira/score_tx
{
  "transaction_id": "tx_123",
  "merchant_id": "merchant-uuid",
  "amount": 1500,
  // ... transaction data
}

// Response
{
  "score": 82.5,
  "confidence": 0.92,
  "factors": [
    { "name": "velocity", "weight": 0.3 },
    { "name": "geolocation", "weight": 0.25 }
  ]
}
```

### Brique 45 (Webhooks)
```typescript
// Events emitted
await publishEvent("merchant", merchantId, "fraud.decision.created", decision);
await publishEvent("ops", opsTeam, "fraud.alert.created", alert);
```

## Testing

### Unit Tests
```bash
npm test
```

Tests include:
- Rule evaluation (DSL parsing)
- ML scoring with mocks
- Velocity calculations
- Decision logic

### Integration Tests
```typescript
// Test: High velocity block
test("blocks after 50 transactions in 1 hour", async () => {
  // Create 50 transactions
  for (let i = 0; i < 50; i++) {
    await evaluateTransaction({ merchant_id: "test", amount: 100 });
  }

  // 51st transaction should be blocked
  const decision = await evaluateTransaction({ merchant_id: "test", amount: 100 });
  expect(decision.decision).toBe("block");
  expect(decision.reason).toBe("High Velocity Block");
});
```

## Deployment

### 1. Database Migration
```bash
npm run migrate
```

### 2. Deploy Service
```bash
# Build
npm run build

# Start API server
npm start

# Start worker
npm run worker:alerts
```

### 3. Configure SIRA Integration
- Set SIRA_URL in .env
- Configure ML thresholds
- Test with sample transactions

### 4. Create Initial Rules
- Use seed data or create via Ops UI
- Test rules with A/B testing mode
- Activate rules for production

### 5. Set Up Monitoring
- Configure Prometheus scraping
- Set up Grafana dashboards
- Configure Slack alerts for critical events

## Edge Cases & Policies

### False Positives
- Ops can mark alerts as false_positive
- Feedback loop to SIRA for model improvement
- Rule adjustment based on false positive rate

### High-Value Transactions
- Always review transactions > $10,000
- Require 2FA for high-risk merchants
- Manual approval for critical decisions

### VPN/Proxy Detection
- Review but don't block (legitimate use cases)
- Combine with other risk factors
- Whitelist known corporate VPNs

### Cross-Border Transactions
- Review if merchant country != IP country
- Allow if merchant has international business
- Consider payment history and velocity

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
