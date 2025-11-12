# Brique 54 - Refunds & Cancellations Engine

Industrial-grade refund and cancellation management system with merchant and ops dashboards, SIRA fraud detection, and complete audit trails.

## Features

### Merchant-First Refunds
- **Full & Partial Refunds**: Merchants can refund any amount up to payment total
- **Dashboard Integration**: Create refunds via API or web dashboard
- **Reason Tracking**: Track refund reasons for analytics
- **Status Monitoring**: Real-time refund status updates

### Ops Control
- **Configurable Rules**: Per-merchant or global refund policies
- **Approval Workflows**: Multi-level approval for high-value refunds
- **Manual Overrides**: Force refund or cancel pending refunds
- **Fraud Investigation**: Direct SIRA integration for abuse detection

### Complete Workflow
- **Mirror Transactions**: Double-entry ledger integration
- **Bank/Wallet Notifications**: Automated refund processing
- **Webhook Events**: Real-time event notifications
- **Audit Trails**: Immutable logs of all refund actions

### SIRA Integration
- **Abuse Detection**: Flag customers with excessive refunds
- **Risk Scoring**: SIRA scoring before refund approval
- **Threshold Enforcement**: Block refunds above risk threshold

### Multi-Everything
- **Multi-Country**: Support for all payment countries
- **Multi-Currency**: Refund in original payment currency
- **Multi-Language**: Molam ID aware localization
- **Multi-Initiator**: Merchant, ops, system, or customer-initiated

## Architecture

```
brique-54/
├── migrations/
│   └── 054_refunds.sql                # 4 tables
├── src/
│   ├── utils/
│   │   ├── db.ts                      # PostgreSQL connection
│   │   └── authz.ts                   # JWT + RBAC
│   ├── services/
│   │   ├── refundService.ts           # Core refund logic
│   │   └── siraService.ts             # SIRA integration
│   ├── webhooks/
│   │   └── publisher.ts               # B45 event publishing
│   ├── workers/
│   │   └── refundWorker.ts            # Background processing
│   ├── routes/
│   │   └── refundRoutes.ts            # Refund API
│   └── server.ts                      # Express server
└── web/
    └── src/
        ├── MerchantRefundsDashboard.tsx
        └── OpsRefundsDashboard.tsx

Port: 8054
Database: molam_refunds
```

## Database Schema

### Tables (4)

1. **refunds** - Refund transactions
2. **refund_audit_logs** - Immutable audit trail
3. **refund_rules** - Configurable policies
4. **refund_statistics** - Pre-aggregated metrics

## API Endpoints

### Refunds

```
POST   /api/refunds                         # Create refund
GET    /api/refunds/:id                     # Get refund details
GET    /api/merchant/:id/refunds            # List merchant refunds
POST   /api/refunds/:id/approve             # Approve refund (ops)
POST   /api/refunds/:id/cancel              # Cancel refund (ops)
POST   /api/refunds/:id/process             # Process refund (internal)
GET    /api/refunds/:id/audit               # Get audit log
```

### Refund Rules

```
GET    /api/refund-rules                    # Get rules
POST   /api/refund-rules                    # Update rules (ops)
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
createdb molam_refunds
```

### 4. Run Migrations

```bash
npm run migrate
# or
psql molam_refunds < migrations/054_refunds.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on **http://localhost:8054**

### 6. Start Workers

```bash
# In a separate terminal
npm run worker
```

## Usage Examples

### Create Refund

```typescript
const response = await fetch("http://localhost:8054/api/refunds", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
  },
  body: JSON.stringify({
    idempotency_key: "refund_12345",
    payment_id: "payment-uuid",
    merchant_id: "merchant-uuid",
    amount: 50.00,
    currency: "USD",
    reason: "Customer requested refund",
    initiated_by: "merchant",
  }),
});

const refund = await response.json();
// {
//   id: "refund-uuid",
//   status: "pending", // or "processing" if auto-approved
//   amount: 50.00,
//   currency: "USD"
// }
```

### List Refunds

```typescript
const response = await fetch(
  "http://localhost:8054/api/merchant/merchant-uuid/refunds?status=succeeded",
  {
    headers: { Authorization: "Bearer YOUR_JWT_TOKEN" },
  }
);

const data = await response.json();
// {
//   data: [...refunds],
//   total: 42,
//   has_more: true
// }
```

### Approve Refund (Ops)

```typescript
await fetch(`http://localhost:8054/api/refunds/${refundId}/approve`, {
  method: "POST",
  headers: { Authorization: "Bearer OPS_JWT_TOKEN" },
});
```

### Update Refund Rules (Ops)

```typescript
await fetch("http://localhost:8054/api/refund-rules", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer OPS_JWT_TOKEN",
  },
  body: JSON.stringify({
    merchant_id: null, // Global rules
    max_refund_days: 30,
    max_amount_without_approval: 1000,
    require_ops_approval_above: 10000,
    auto_refund_enabled: false,
    max_refund_percentage: 100,
    sira_threshold: 0.5,
  }),
});
```

## Refund Lifecycle

```
Created (with idempotency)
  ↓
Rules Check (days, amount, percentage, SIRA)
  ↓
Approval Decision
  ├─→ Auto-Approved (< $1000) → Processing
  ├─→ Requires Ops (> $10000) → Pending
  └─→ SIRA High Risk → Pending
  ↓
Processing
  ├─→ Payment Provider Refund
  ├─→ Ledger Mirror Transaction
  └─→ Webhook Notification
  ↓
Completed (succeeded | failed | cancelled)
```

## Refund Rules

### Global Default Rules

```json
{
  "max_refund_days": 30,
  "max_amount_without_approval": 1000,
  "require_ops_approval_above": 10000,
  "auto_refund_enabled": false,
  "max_refund_percentage": 100,
  "sira_threshold": 0.5
}
```

### Per-Merchant Override

Merchants can have custom rules that override global defaults:

```sql
INSERT INTO refund_rules (merchant_id, max_refund_days, auto_refund_enabled)
VALUES ('merchant-uuid', 60, true);
```

## SIRA Integration

### Abuse Detection

Before refund approval, SIRA scores customer refund behavior:

```typescript
const siraScore = await pickSiraScore(customerId, {
  payment_id: paymentId,
  refund_amount: amount,
  merchant_id: merchantId,
});

// {
//   score: 0.75,
//   risk_level: "high",
//   reasons: ["multiple_refunds_7_days", "total_refunds_exceeds_threshold"]
// }

if (siraScore.score > rules.sira_threshold) {
  // Block or require ops approval
}
```

## Webhook Events

Emitted via B45 Webhooks:

### refund.created

```json
{
  "event": "refund.created",
  "data": {
    "refund_id": "uuid",
    "payment_id": "uuid",
    "amount": 50.00,
    "currency": "USD",
    "status": "pending"
  },
  "timestamp": "2025-11-05T01:00:00Z"
}
```

### refund.succeeded

```json
{
  "event": "refund.succeeded",
  "data": {
    "refund_id": "uuid",
    "payment_id": "uuid",
    "amount": 50.00,
    "currency": "USD"
  },
  "timestamp": "2025-11-05T01:05:00Z"
}
```

### refund.failed

```json
{
  "event": "refund.failed",
  "data": {
    "refund_id": "uuid",
    "payment_id": "uuid",
    "reason": "payment_processor_rejected"
  },
  "timestamp": "2025-11-05T01:05:00Z"
}
```

### refund.cancelled

```json
{
  "event": "refund.cancelled",
  "data": {
    "refund_id": "uuid",
    "payment_id": "uuid",
    "reason": "cancelled_by_ops"
  },
  "timestamp": "2025-11-05T01:05:00Z"
}
```

## Audit Logging

All refund actions logged immutably:

```sql
SELECT * FROM refund_audit_logs WHERE refund_id = 'refund-uuid';

-- Results:
-- | actor        | action    | details                         | created_at          |
-- |--------------|-----------|----------------------------------|---------------------|
-- | merchant-123 | created   | {"amount": 50, "reason": "..."}  | 2025-11-05 01:00:00 |
-- | system       | processed | {"status": "succeeded"}          | 2025-11-05 01:05:00 |
```

## Metrics

Prometheus metrics at `/metrics`:

- `b54_refunds_created_total` - Refunds created by merchant/initiator
- `b54_refunds_succeeded_total` - Successful refunds
- `b54_refunds_failed_total` - Failed refunds by reason
- `b54_refund_rate` - Refund rate as % of payments
- `b54_refund_processing_time_seconds` - Processing time distribution

## Dashboards

### Merchant Dashboard

Features:
- Refund list with filtering (all, pending, succeeded, failed)
- Create refund button
- Statistics cards (total, succeeded, pending, refund rate)
- Apple-inspired design

### Ops Dashboard

Features:
- Refund rules configuration
- Metrics overview (pending approvals, high risk, processing time)
- Abuse detection alerts
- Rule editing modal

## Security & Compliance

### Idempotency

All refund creation requires idempotency key:

```typescript
{
  "idempotency_key": "refund_unique_12345"
}

// Second request with same key returns existing refund
```

### Audit Trails

Immutable logs in `refund_audit_logs`:

- Who created the refund
- Who approved it
- When it was processed
- Why it failed/cancelled

### PCI-DSS Compliance

- No raw payment data stored
- Refunds reference payment IDs only
- All communication encrypted (HTTPS)

### KYC/AML

- SIRA scoring for abuse detection
- Merchant flagging for excessive refunds
- Ops review for high-risk refunds

## Integrations

### B41 Connect (Payments)

Fetch payment details and process refunds:

```typescript
const payment = await fetch(`${PAYMENTS_URL}/api/payments/${paymentId}`);
```

### B34/35 Treasury (Ledger)

Create mirror transactions for double-entry accounting:

```typescript
await createLedgerRefund({
  refund_id: refundId,
  payment_id: paymentId,
  amount: 50.00,
  currency: "USD",
});
```

### B45 Webhooks

Publish refund events to merchant endpoints.

### B44 SIRA

Fraud detection and abuse scoring.

## Deployment

### Production Checklist

- [ ] Configure DATABASE_URL
- [ ] Set JWT_PUBLIC_KEY_PATH
- [ ] Configure SERVICE_TOKEN
- [ ] Set PAYMENTS_URL, LEDGER_URL, WEBHOOKS_URL, SIRA_URL
- [ ] Configure refund rules (global defaults)
- [ ] Start refund worker process
- [ ] Configure monitoring (Prometheus, Grafana)
- [ ] Set up alerting for high refund rates

## Troubleshooting

### Refund Stuck in Pending

Check if approval required:

```sql
SELECT * FROM refunds WHERE id = 'refund-uuid';
-- If metadata.approval_required = true, ops must approve
```

### SIRA Score Too High

Adjust SIRA threshold in refund rules:

```sql
UPDATE refund_rules
SET sira_threshold = 0.7
WHERE merchant_id IS NULL; -- Global rules
```

## License

Proprietary - Molam Inc.
