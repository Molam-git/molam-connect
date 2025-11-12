# Brique 56 - Chargeback Prevention & Auto-Response Rules Engine

Industrial-grade fraud prevention system with real-time rule evaluation, automated actions, SIRA integration, and evidence template generation.

## Features

### Real-Time Rule Evaluation
- **JSONLogic Engine**: Flexible, safe rule evaluation using JSONLogic expressions
- **Sub-50ms Evaluation**: Optimized for real-time checkout path
- **Priority-Based Execution**: Rules evaluated in priority order with short-circuiting
- **Scope Filtering**: Rules can be scoped by country, merchant, amount ranges

### Automated Actions
- **Challenge**: Send OTP, trigger 3DS, or CAPTCHA verification
- **Hold Payout**: Temporarily freeze merchant payouts pending review
- **Block**: Block suspicious payments or temporarily freeze merchant accounts
- **Notify**: Alert ops team or merchants of suspicious activity
- **Auto-Refute/Accept**: Automatically respond to disputes based on risk assessment

### SIRA ML Integration
- **Fraud Scoring**: ML-based fraud detection for every payment
- **Velocity Tracking**: Automatic calculation of payment velocity signals
- **Risk Assessment**: Combined rule + SIRA scoring for comprehensive fraud detection

### Evidence Templates
- **Auto-Generation**: Generate dispute evidence packages automatically
- **Template Types**: Receipt, tracking, device info, velocity data, conversation logs
- **One-Click Response**: Pre-assembled evidence ready for network submission

### Ops Control
- **Visual Rule Builder**: Create rules with JSONLogic or JSON editor
- **Rule Simulator**: Test rules against sample data before deploying
- **Enable/Disable Toggle**: Instantly activate or deactivate rules
- **Audit Trail**: Complete history of rule evaluations and actions

## Architecture

```
brique-56/
├── migrations/
│   └── 056_radar.sql                 # 5 tables
├── src/
│   ├── utils/
│   │   ├── db.ts                     # PostgreSQL connection
│   │   ├── authz.ts                  # JWT + RBAC
│   │   └── webhooks.ts               # B45 event publishing
│   ├── radar/
│   │   └── evaluator.ts              # JSONLogic rule engine
│   ├── services/
│   │   ├── signalsService.ts         # Payment signals & velocity
│   │   ├── rulesService.ts           # Rule CRUD operations
│   │   └── evidenceService.ts        # Evidence templates
│   ├── workers/
│   │   └── actionWorker.ts           # Execute fraud prevention actions
│   ├── routes/
│   │   └── radarRoutes.ts            # Radar API
│   └── server.ts                     # Express server
└── web/
    └── src/
        └── OpsRadarDashboard.tsx

Port: 8056
Database: molam_radar
```

## Database Schema

### Tables (5)

1. **payment_signals** - Feature store for fraud detection (device, geo, velocity, SIRA)
2. **radar_rules** - Configurable rules with JSONLogic conditions
3. **radar_evaluations** - Audit trail of rule evaluations with explanations
4. **radar_actions** - Actions taken (challenge, hold, block, notify, auto-refute, auto-accept)
5. **evidence_templates** - Auto-generated dispute evidence packages

## API Endpoints

### Evaluation

```
POST   /api/radar/evaluate                      # Real-time payment evaluation
POST   /api/radar/signals                       # Create payment signal
GET    /api/radar/signals/:paymentId            # Get payment signal
```

### Rules Management

```
GET    /api/radar/rules                         # List all rules
GET    /api/radar/rules/:id                     # Get rule by ID
POST   /api/radar/rules                         # Create rule (ops)
PUT    /api/radar/rules/:id                     # Update rule (ops)
DELETE /api/radar/rules/:id                     # Delete rule (ops)
POST   /api/radar/rules/test                    # Test rule with sample data
```

### Actions

```
POST   /api/radar/actions/:id/execute           # Execute pending action (ops)
GET    /api/radar/actions/:paymentId            # Get actions for payment
```

### Evidence Templates

```
GET    /api/radar/templates                     # List templates
POST   /api/radar/templates                     # Create template (ops)
GET    /api/radar/evidence/:templateId/generate # Generate evidence package
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Create Database

```bash
createdb molam_radar
```

### 4. Run Migrations

```bash
npm run migrate
# or
psql molam_radar < migrations/056_radar.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on **http://localhost:8056**

### 6. Start Workers

```bash
# In a separate terminal
npm run worker
```

## Usage Examples

### Create Payment Signal

```typescript
const signal = await fetch("http://localhost:8056/api/radar/signals", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    payment_id: "payment-uuid",
    merchant_id: "merchant-uuid",
    customer_id: "customer-uuid",
    country: "SN",
    currency: "XOF",
    amount: 50000,
    device_fingerprint: {
      id: "device-123",
      type: "mobile",
      os: "android",
    },
    ip_address: "41.203.123.45",
    geo: {
      country_code: "SN",
      city: "Dakar",
      latitude: 14.6937,
      longitude: -17.4441,
    },
    shipping_info: {
      country: "SN",
      city: "Dakar",
    },
    billing_info: {
      country: "SN",
      postal_code: "10000",
    },
  }),
});
```

### Evaluate Payment (Real-Time)

```typescript
const evaluation = await fetch("http://localhost:8056/api/radar/evaluate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    payment_id: "payment-uuid",
  }),
});

const result = await evaluation.json();
// {
//   payment_id: "payment-uuid",
//   evaluations: [...],
//   actions: [
//     { type: "challenge", params: { method: "otp" }, ruleId: "rule-uuid" }
//   ],
//   risk_level: "high",
//   total_score: 2.5
// }
```

### Create Radar Rule

```typescript
await fetch("http://localhost:8056/api/radar/rules", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
  },
  body: JSON.stringify({
    name: "High Amount Foreign Transaction",
    description: "Challenge high-value transactions from new devices",
    condition: JSON.stringify({
      and: [
        { ">": [{ var: "amount" }, 100000] },
        { in: [{ var: "country" }, ["SN", "CI", "GH"]] },
        { "<": [{ var: "velocity_count_24h" }, 2] },
      ],
    }),
    action: {
      type: "challenge",
      method: "otp",
      require_approval: false,
    },
    priority: 50,
    scope: {
      countries: ["SN", "CI", "GH"],
      min_amount: 50000,
    },
  }),
});
```

### Test Rule

```typescript
const testResult = await fetch("http://localhost:8056/api/radar/rules/test", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
  },
  body: JSON.stringify({
    condition: '{">":[{"var":"amount"},100000]}',
    sample_data: {
      amount: 150000,
      country: "SN",
      sira_score: 0.3,
      velocity_count_24h: 1,
    },
  }),
});

const result = await testResult.json();
// { triggered: true }
```

## Rule Engine (JSONLogic)

### Basic Operators

```json
// Greater than
{">": [{"var": "amount"}, 100000]}

// In array
{"in": [{"var": "country"}, ["SN", "CI", "GH"]]}

// AND condition
{
  "and": [
    {">": [{"var": "amount"}, 100000]},
    {"<": [{"var": "sira_score"}, 0.3]}
  ]
}

// OR condition
{
  "or": [
    {">": [{"var": "velocity_count_24h"}, 5]},
    {">": [{"var": "velocity_sum_24h"}, 1000000]}
  ]
}
```

### Available Variables

- **amount**: Payment amount
- **country**: Payment country
- **currency**: Payment currency
- **sira_score**: ML fraud score (0-1)
- **velocity_count_1h**: Payment count in last hour
- **velocity_count_24h**: Payment count in last 24 hours
- **velocity_sum_24h**: Total amount in last 24 hours
- **device_id**: Device fingerprint ID
- **device_type**: Device type (mobile, desktop, etc.)
- **shipping_country**: Shipping country
- **billing_country**: Billing country
- **geo_country**: Geolocation country
- **agent_id**: Agent ID (for agent-assisted transactions)

### Example Rules

#### Velocity Abuse Detection
```json
{
  "name": "High Velocity Abuse",
  "condition": {
    "or": [
      {">": [{"var": "velocity_count_1h"}, 10]},
      {">": [{"var": "velocity_sum_24h"}, 5000000]}
    ]
  },
  "action": {
    "type": "hold_payout",
    "params": {
      "hold_duration_hours": 24,
      "reason": "high_velocity_detected"
    }
  }
}
```

#### Country Mismatch
```json
{
  "name": "Shipping Country Mismatch",
  "condition": {
    "and": [
      {">": [{"var": "amount"}, 50000]},
      {"!=": [{"var": "shipping_country"}, {"var": "billing_country"}]}
    ]
  },
  "action": {
    "type": "challenge",
    "method": "otp",
    "require_approval": false
  }
}
```

#### SIRA High Risk
```json
{
  "name": "SIRA High Risk Score",
  "condition": {
    ">": [{"var": "sira_score"}, 0.7]
  },
  "action": {
    "type": "block",
    "immediate": true,
    "params": {
      "reason": "high_fraud_risk"
    }
  }
}
```

## Action Types

### Challenge
Require additional verification from the customer:
- **OTP**: Send one-time password via SMS/email
- **3DS**: Trigger 3D Secure flow for card payments
- **CAPTCHA**: Require CAPTCHA verification

### Hold Payout
Temporarily freeze merchant payout pending manual review:
- Prevents funds from being transferred to merchant
- Configurable hold duration (hours/days)
- Requires ops approval to release

### Block
Immediately block the payment or merchant account:
- Payment marked as blocked in signals
- Optional: freeze merchant account temporarily
- Irreversible without ops intervention

### Notify
Send alert to ops team or merchant:
- Real-time webhook notifications
- Email/SMS alerts (if configured)
- Severity levels: low, medium, high, critical

### Auto-Refute
Automatically respond to disputes:
- Uses evidence templates
- Submits response to B55 Disputes
- Only for low-risk disputes

### Auto-Accept
Automatically accept dispute/refund:
- For very low-risk disputes where cost of fighting exceeds refund amount
- Creates credit note via B46 Billing
- Posts ledger adjustment via B34 Treasury

## Evidence Templates

### Template Structure

```json
{
  "name": "Full Transaction Evidence",
  "template_type": "full_package",
  "template_json": {
    "sections": [
      {
        "type": "receipt",
        "title": "Payment Receipt",
        "includes": ["amount", "currency", "payment_id", "date"]
      },
      {
        "type": "tracking",
        "title": "Shipping Tracking",
        "includes": ["tracking_number", "shipping_country", "shipping_city"]
      },
      {
        "type": "device",
        "title": "Device Information",
        "includes": ["device_id", "device_type", "ip_address", "geo"]
      },
      {
        "type": "velocity",
        "title": "Transaction Velocity",
        "includes": ["count_24h", "sum_24h"]
      }
    ]
  }
}
```

## Monitoring & Alerts

### Prometheus Metrics

Exported at `/metrics`:

- `molam_radar_rules_triggered_total{rule_id, rule_name}` - Rules triggered by ID
- `molam_radar_actions_executed_total{action_type}` - Actions executed by type
- `molam_radar_action_failures_total{action_type}` - Action failures by type
- `molam_radar_evaluation_time_seconds` - Evaluation latency histogram

### Recommended Alerts

1. **High Evaluation Latency**: Alert if P95 > 100ms
2. **Action Failures**: Alert if failure rate > 5%
3. **Block Spike**: Alert if blocks increase 2x in 1 hour
4. **Rule Never Triggered**: Alert if enabled rule hasn't triggered in 7 days (may be misconfigured)

## Security & Compliance

### Rule Validation
- All JSONLogic conditions validated before storage
- Malformed rules rejected at creation time
- Test mode available for safe rule development

### Audit Trail
- Every rule evaluation logged in `radar_evaluations`
- Includes full explanation and feature vector
- Immutable for compliance and appeals

### RBAC
- Rule creation/update: `pay_admin`, `ops_radar` roles
- Real-time evaluation: Public endpoint (for checkout performance)
- Action execution: `pay_admin`, `ops_radar` roles

### Explainability
Each evaluation includes:
- Matched rules and their scores
- Feature values used in evaluation
- Recommended actions with justification
- Complete audit trail for compliance

## Integrations

### B44 SIRA (ML Fraud Detection)
Fetch ML-based fraud scores for payments:
```typescript
const siraScore = await fetch(`${SIRA_URL}/api/score`, {...});
```

### B55 Disputes (Auto-Response)
Auto-refute or auto-accept disputes:
```typescript
await fetch(`${DISPUTES_URL}/api/disputes/${disputeId}/respond`, {...});
```

### B34 Treasury (Hold Payouts)
Freeze merchant payouts pending review:
```typescript
await fetch(`${TREASURY_URL}/api/payouts/hold`, {...});
```

### B45 Webhooks (Event Publishing)
Publish fraud alerts and action events:
```typescript
await publishEvent("merchant", merchantId, "radar.alert", {...});
```

### B47 Notifications (OTP/3DS)
Send OTP or trigger 3DS verification:
```typescript
await fetch(`${NOTIFICATIONS_URL}/api/otp/send`, {...});
```

## Deployment

### Production Checklist

- [ ] Configure DATABASE_URL
- [ ] Set JWT_PUBLIC_KEY_PATH
- [ ] Configure SERVICE_TOKEN for inter-service communication
- [ ] Set external service URLs (SIRA_URL, DISPUTES_URL, TREASURY_URL, etc.)
- [ ] Create initial seed rules (start conservative)
- [ ] Deploy action workers with HPA (k8s)
- [ ] Configure monitoring (Prometheus, Grafana)
- [ ] Set up alerting for high block rates
- [ ] Test rule simulator with production-like data
- [ ] Enable rules gradually with monitoring

### Emergency Rollback

Instantly disable all rules:
```sql
UPDATE radar_rules SET enabled = false;
```

Or disable specific high-impact rules:
```sql
UPDATE radar_rules SET enabled = false WHERE action->>'type' IN ('block', 'hold_payout');
```

## Troubleshooting

### Rule Not Triggering

Check scope match:
```sql
SELECT * FROM radar_rules WHERE id = 'rule-uuid';
-- Verify scope.countries, scope.merchants, scope.min_amount
```

### Evaluation Taking Too Long

Check rule complexity:
```sql
SELECT id, name, LENGTH(condition) as condition_size
FROM radar_rules WHERE enabled = true
ORDER BY condition_size DESC;
```

Consider breaking complex rules into multiple simpler rules.

### Action Failed

Check action worker logs and retry:
```sql
SELECT * FROM radar_actions WHERE status = 'failed';
UPDATE radar_actions SET status = 'pending' WHERE id = 'action-uuid';
```

## License

Proprietary - Molam Inc.
