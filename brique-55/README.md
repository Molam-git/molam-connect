# Brique 55 - Disputes & Chargebacks Engine

Industrial-grade dispute management system with network ingestion, SIRA fraud detection, ops workflows, and complete audit trails.

## Features

### Automated Network Ingestion
- **Multi-Network Support**: Visa, Mastercard, AMEX, local rails
- **Webhook Ingestion**: Automated callback processing
- **Idempotent Processing**: Duplicate prevention via external IDs
- **Deadline Tracking**: Automatic response deadline calculation

### SIRA Integration
- **Risk Scoring**: ML-based fraud detection for disputes
- **Recommendations**: Auto-accept, auto-refute, or escalate suggestions
- **Evidence Needed**: AI-driven evidence type recommendations
- **Chargeback Pattern Detection**: Identify merchant abuse patterns

### Complete Workflow
- **Evidence Management**: WORM S3 storage with integrity hashing
- **Timeline Tracking**: Immutable audit trail of all actions
- **Multi-Stage Responses**: Support for network escalations
- **SLA Monitoring**: Real-time deadline alerts and breach detection

### Ops Control
- **Assignment System**: Distribute disputes to ops team
- **Priority Management**: Critical, high, normal, low priorities
- **Bulk Operations**: Handle multiple disputes efficiently
- **Approval Workflows**: Multi-level approvals for high-value disputes

### Billing & Ledger Integration
- **Network Fees**: Automatic chargeback fee billing (B46)
- **Credit Notes**: Generate credits when merchant wins (B46)
- **Ledger Adjustments**: Double-entry bookkeeping (B34/35)
- **Revenue Tracking**: Dispute impact on merchant finances

### Security & Compliance
- **WORM Storage**: Immutable evidence with SHA-256 hashing
- **Audit Trail**: Complete timeline of all dispute actions
- **RBAC**: Role-based access control via Molam ID JWT
- **Data Retention**: Configurable retention policies per jurisdiction

## Architecture

```
brique-55/
├── migrations/
│   └── 055_disputes.sql              # 5 tables
├── src/
│   ├── utils/
│   │   ├── db.ts                     # PostgreSQL connection
│   │   ├── authz.ts                  # JWT + RBAC
│   │   └── storage.ts                # WORM S3 storage
│   ├── services/
│   │   ├── disputeService.ts         # Core dispute logic
│   │   └── siraService.ts            # SIRA integration
│   ├── webhooks/
│   │   └── publisher.ts              # B45 event publishing
│   ├── workers/
│   │   ├── callbackProcessor.ts      # Network ingestion
│   │   └── slaMonitor.ts             # Deadline monitoring
│   ├── routes/
│   │   └── disputeRoutes.ts          # Dispute API
│   └── server.ts                     # Express server
└── web/
    └── src/
        ├── MerchantDisputesDashboard.tsx
        └── OpsDisputesDashboard.tsx

Port: 8055
Database: molam_disputes
```

## Database Schema

### Tables (5)

1. **disputes** - Master dispute records
2. **dispute_evidences** - Immutable evidence files (WORM S3)
3. **dispute_timeline** - Audit trail of all actions
4. **dispute_callbacks_raw** - Raw network webhook payloads
5. **dispute_resolutions** - Final outcomes with billing/ledger references

## API Endpoints

### Dispute Management

```
POST   /api/disputes/ingest              # Network webhook ingestion
POST   /api/disputes                     # Create manual dispute
GET    /api/disputes/:id                 # Get dispute details
GET    /api/disputes                     # List disputes (with filters)
POST   /api/disputes/:id/evidence        # Upload evidence
POST   /api/disputes/:id/respond         # Submit response to network
POST   /api/disputes/:id/assign          # Assign to ops user
POST   /api/disputes/:id/resolve         # Resolve dispute (ops)
GET    /api/disputes/:id/audit           # Get audit log
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
createdb molam_disputes
```

### 4. Run Migrations

```bash
npm run migrate
# or
psql molam_disputes < migrations/055_disputes.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on **http://localhost:8055**

### 6. Start Workers

```bash
# In a separate terminal
npm run worker
```

## Usage Examples

### Network Webhook Ingestion

Network providers (Visa, Mastercard, etc.) send webhook callbacks:

```typescript
// Webhook received from network
POST /api/disputes/ingest
{
  "network": "visa",
  "external_id": "VISA-12345",
  "payload": {
    "dispute_id": "VISA-12345",
    "payment_reference": "payment-uuid",
    "amount": 100.00,
    "currency": "USD",
    "reason_code": "fraud",
    "response_due_at": "2025-11-19T00:00:00Z"
  }
}

// Response
{
  "ok": true,
  "message": "callback_queued"
}
```

### Create Manual Dispute

Merchants or ops can create disputes manually:

```typescript
const response = await fetch("http://localhost:8055/api/disputes", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Idempotency-Key": "dispute_12345",
  },
  body: JSON.stringify({
    payment_id: "payment-uuid",
    amount: 50.00,
    currency: "USD",
    reason_code: "product_not_received",
    origin: "customer_claim",
    metadata: { customer_notes: "Never received the product" },
  }),
});

const dispute = await response.json();
// {
//   id: "dispute-uuid",
//   status: "open",
//   payment_id: "payment-uuid",
//   amount: 50.00,
//   currency: "USD"
// }
```

### Upload Evidence

```typescript
const formData = new FormData();
formData.append("file", fileBlob);
formData.append("type", "receipt");

const response = await fetch(`http://localhost:8055/api/disputes/${disputeId}/evidence`, {
  method: "POST",
  headers: { Authorization: "Bearer YOUR_JWT_TOKEN" },
  body: formData,
});

const result = await response.json();
// {
//   ok: true,
//   s3_key: "s3://molam-disputes-evidence/disputes/...",
//   hash: "abc123..."
// }
```

### Resolve Dispute (Ops)

```typescript
await fetch(`http://localhost:8055/api/disputes/${disputeId}/resolve`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer OPS_JWT_TOKEN",
  },
  body: JSON.stringify({
    outcome: "merchant_won", // or "merchant_lost", "voided", "cancelled"
    network_fee: 15.00, // if merchant lost
    details: { reason: "Provided sufficient evidence" },
  }),
});
```

## Dispute Lifecycle

```
Network Callback / Manual Creation
  ↓
Ingestion & SIRA Scoring
  ↓
Assignment & Priority Setting
  ↓
Evidence Collection
  ├─→ Upload receipts, invoices, conversations
  ├─→ Upload tracking, proof of delivery
  └─→ Upload photos, videos, signatures
  ↓
Response Preparation
  ├─→ Select evidences to include
  ├─→ Generate response package
  └─→ Submit to network
  ↓
Resolution
  ├─→ Merchant Won → Credit Note (B46) + Ledger Credit (B34)
  ├─→ Merchant Lost → Dispute Fee Charge (B46) + Ledger Debit (B34)
  ├─→ Voided → Close without action
  └─→ Cancelled → Close without action
  ↓
Audit Trail Complete
```

## SIRA Integration

### Risk Scoring

Before any automated decisions, SIRA scores the dispute:

```typescript
const siraScore = await requestSiraScore({
  payment_id: paymentId,
  merchant_id: merchantId,
  customer_id: customerId,
  amount: 100.00,
  currency: "USD",
  reason_code: "fraud",
});

// {
//   score: 0.75,
//   risk_level: "high",
//   recommendation: "escalate",
//   evidence_needed: ["receipt", "invoice", "conversation"],
//   reasons: ["multiple_disputes_7_days", "high_value_transaction"]
// }
```

### Recommendations

- **auto_accept**: Low-risk, likely friendly fraud, accept chargeback
- **auto_refute**: Strong evidence available, fight the dispute
- **escalate**: High-risk or uncertain, require ops review

## Webhook Events

Emitted via B45 Webhooks:

### dispute.created

```json
{
  "event": "dispute.created",
  "data": {
    "dispute_id": "uuid",
    "payment_id": "uuid",
    "external_dispute_id": "VISA-12345",
    "network": "visa",
    "amount": 100.00,
    "response_due_at": "2025-11-19T00:00:00Z"
  },
  "timestamp": "2025-11-05T01:00:00Z"
}
```

### dispute.evidence.uploaded

```json
{
  "event": "dispute.evidence.uploaded",
  "data": {
    "dispute_id": "uuid",
    "evidence_type": "receipt"
  },
  "timestamp": "2025-11-05T02:00:00Z"
}
```

### dispute.responded

```json
{
  "event": "dispute.responded",
  "data": {
    "dispute_id": "uuid",
    "evidence_count": 3
  },
  "timestamp": "2025-11-05T03:00:00Z"
}
```

### dispute.resolved

```json
{
  "event": "dispute.resolved",
  "data": {
    "dispute_id": "uuid",
    "outcome": "merchant_won",
    "network_fee": 0
  },
  "timestamp": "2025-11-05T04:00:00Z"
}
```

### dispute.deadline.approaching

```json
{
  "event": "dispute.deadline.approaching",
  "data": {
    "dispute_id": "uuid",
    "hours_remaining": 12,
    "response_due_at": "2025-11-06T00:00:00Z"
  },
  "timestamp": "2025-11-05T12:00:00Z"
}
```

## SLA Monitoring

The SLA monitor worker runs every minute and:

1. **Checks approaching deadlines** (within 24 hours)
   - Sends `dispute.deadline.approaching` webhook
   - Alerts assigned ops user

2. **Detects overdue disputes**
   - Updates priority to CRITICAL
   - Sends `dispute.deadline.missed` webhook
   - Sends `dispute.sla.breached` alert to ops

## Metrics

Prometheus metrics at `/metrics`:

- `molam_disputes_created_total{origin, reason_code}` - Disputes created by source
- `molam_disputes_resolved_total{outcome}` - Disputes resolved by outcome
- `molam_dispute_processing_time_seconds` - Time to resolution

## Evidence Storage (WORM)

### Storage Process

1. **Upload**: File uploaded via multipart/form-data
2. **Hash**: SHA-256 hash computed
3. **Store**: Saved to S3 with Object Lock (immutable)
4. **Record**: S3 key and hash stored in database
5. **Verify**: Integrity check via hash comparison

### Supported Evidence Types

- `receipt` - Purchase receipts
- `invoice` - Invoices and billing documents
- `conversation` - Chat logs, emails
- `tracking` - Shipping tracking info
- `photo` - Product photos
- `video` - Video evidence
- `signature` - Customer signatures
- `proof_of_delivery` - Delivery confirmations

## Dashboards

### Merchant Dashboard

Features:
- View all disputes (filterable by status)
- Upload evidence for disputes
- View response deadlines with countdown
- Timeline of dispute actions
- Statistics cards (total, won, lost, responding)

### Ops Dashboard

Features:
- Advanced filtering and search
- Priority-based sorting
- SIRA score and recommendations display
- Bulk assignment capabilities
- Resolution workflow with outcome selection
- Network fee tracking
- Metrics overview (pending, high priority, responding, won, lost)

## Integrations

### B41 Connect (Payments)

Fetch payment details for dispute validation:

```typescript
const payment = await fetch(`${PAYMENTS_URL}/api/payments/${paymentId}`);
```

### B46 Billing

Create charges for dispute fees and credit notes for wins:

```typescript
// Merchant lost -> charge fee
await createBillingCharge(merchantId, disputeId, networkFee, currency);

// Merchant won -> issue credit
await createCreditNote(merchantId, disputeId, amount, currency);
```

### B34/35 Treasury

Post ledger entries for financial tracking (future integration).

### B45 Webhooks

Publish all dispute events to merchant endpoints.

### B44 SIRA

Request risk scoring and recommendations for disputes.

## Deployment

### Production Checklist

- [ ] Configure DATABASE_URL
- [ ] Set JWT_PUBLIC_KEY_PATH
- [ ] Configure SERVICE_TOKEN for inter-service communication
- [ ] Set AWS credentials and WORM_BUCKET
- [ ] Configure network webhook secrets (VISA_WEBHOOK_SECRET, etc.)
- [ ] Set external service URLs (PAYMENTS_URL, BILLING_URL, LEDGER_URL, WEBHOOKS_URL, SIRA_URL)
- [ ] Deploy workers (callback processor, SLA monitor)
- [ ] Configure monitoring (Prometheus, Grafana)
- [ ] Set up alerting for SLA breaches
- [ ] Configure S3 Object Lock for WORM compliance

## Troubleshooting

### Dispute Not Ingested

Check callback processor logs:

```bash
# View unprocessed callbacks
psql molam_disputes -c "SELECT * FROM dispute_callbacks_raw WHERE NOT processed;"
```

### Evidence Upload Failed

Verify AWS credentials and S3 bucket permissions:

```bash
# Test S3 access
aws s3 ls s3://molam-disputes-evidence/
```

### SIRA Scoring Unavailable

Disputes will default to "escalate" recommendation if SIRA is down. Check SIRA service health.

### Deadline Missed

SLA monitor automatically escalates overdue disputes to CRITICAL priority and sends alerts.

## Security & Compliance

### Data Retention

Configure retention policies per jurisdiction. Evidence stored in WORM S3 with 7-year retention by default.

### PCI-DSS

- No raw card PANs stored
- Payment references only
- All communication over HTTPS

### Audit Trail

Every action logged in `dispute_timeline` with:
- Actor ID and type
- Action performed
- Details (JSONB)
- Timestamp

## License

Proprietary - Molam Inc.
