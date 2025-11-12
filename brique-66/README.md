# Brique 66 — Disputes & Chargebacks (Connect)

**Status:** 🚧 In Progress
**Port:** 4066
**Version:** 1.0.0

## Overview

Brique 66 provides a complete disputes and chargebacks management engine for Connect transactions. It handles dispute creation, evidence submission, fee management, and resolution workflows for chargebacks, inquiries, and fraud claims.

## Features

### 🎯 Dispute Management
- **Multiple dispute types** (chargeback, inquiry, retrieval, fraud_claim)
- **Status workflow** (open → evidence_submitted → under_review → won/lost)
- **Network integration** with Visa, Mastercard, Amex
- **Response deadlines** with automatic tracking
- **Customer notes** and dispute reasons

### 📎 Evidence Handling
- **Evidence submission** with structured data
- **Document uploads** (receipts, tracking, signatures)
- **Multiple evidence types** (delivery_proof, communication, photos)
- **Evidence tracking** with timestamps and uploaders

### 💰 Fee Management
- **Automatic bank fees** ($15 for chargebacks)
- **Chargeback loss tracking** (full transaction amount)
- **Fee status** (pending/waived/charged)
- **Fee reversal** on dispute wins

### 📊 Analytics & Reporting
- **Merchant statistics** with win rates
- **Dispute trends** by reason and type
- **Fee calculations** and totals
- **Performance metrics**

### 🤖 Automated Workflows
- **Network polling** for new disputes
- **Deadline monitoring** with alerts
- **Auto-escalation** for expired disputes
- **Report generation**

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               Disputes & Chargebacks Engine                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐      ┌────────────────┐                │
│  │ Dispute Engine │      │ Evidence Mgmt  │                │
│  │                │      │                │                │
│  │ • Create       │      │ • Submit       │                │
│  │ • Update       │      │ • Upload       │                │
│  │ • Resolve      │      │ • Track        │                │
│  └────────────────┘      └────────────────┘                │
│          │                        │                         │
│          ▼                        ▼                         │
│  ┌────────────────────────────────────────┐                │
│  │        Disputes Database               │                │
│  │                                        │                │
│  │  • disputes                           │                │
│  │  • dispute_fees                       │                │
│  │  • dispute_evidence                   │                │
│  │  • dispute_logs                       │                │
│  │  • dispute_templates                  │                │
│  └────────────────────────────────────────┘                │
│          │                                                  │
│          ▼                                                  │
│  ┌────────────────────────────────────────┐                │
│  │      Network Integration Worker        │                │
│  │                                        │                │
│  │  • Poll Visa/MC/Amex APIs             │                │
│  │  • Ingest new disputes                │                │
│  │  • Check deadlines                    │                │
│  │  • Auto-escalate                      │                │
│  │  • Generate reports                   │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables (5 total)

1. **disputes** - Core dispute records
   - Status workflow tracking
   - Network references
   - Response deadlines
   - Resolution outcomes

2. **dispute_fees** - Fee tracking
   - Bank fees ($15 per chargeback)
   - Chargeback losses (full amount)
   - Reversal fees
   - Fee status (pending/waived/charged)

3. **dispute_evidence** - Evidence documents
   - File uploads (PDFs, images)
   - Evidence types
   - Upload tracking

4. **dispute_logs** - Activity audit trail
   - Status changes
   - Evidence submissions
   - Resolutions
   - System actions

5. **dispute_templates** - Pre-configured responses
   - Common dispute reasons
   - Response templates
   - Evidence checklists

### Key Indexes
- Index on `merchant_id` for fast merchant lookup
- Index on `status` for workflow queries
- Index on `respond_by` for deadline monitoring
- Unique index on `network_ref` for deduplication
- Index on `created_at` for reporting

## API Endpoints

### Dispute Management

#### `POST /api/disputes`
Create a new dispute.

**Request:**
```json
{
  "connectTxId": "tx-123",
  "merchantId": "merchant-456",
  "amount": 10000,
  "currency": "USD",
  "reason": "fraud",
  "disputeType": "chargeback",
  "customerNote": "I did not authorize this transaction",
  "networkRef": "CB-VISA-123456"
}
```

**Response:**
```json
{
  "id": "dispute-789",
  "connect_tx_id": "tx-123",
  "merchant_id": "merchant-456",
  "amount": 10000,
  "currency": "USD",
  "reason": "fraud",
  "dispute_type": "chargeback",
  "status": "open",
  "respond_by": "2025-02-01T00:00:00Z",
  "created_at": "2025-01-07T10:00:00Z"
}
```

#### `GET /api/disputes/:id`
Get dispute details.

#### `GET /api/disputes`
List disputes (with filters).

**Query Parameters:**
- `merchant_id` (required)
- `status` (optional) - open | evidence_submitted | under_review | won | lost
- `limit` (optional) - default 50
- `offset` (optional) - default 0

#### `POST /api/disputes/:id/evidence`
Submit evidence for a dispute.

**Request:**
```json
{
  "actor": "merchant-support",
  "evidence": {
    "tracking_number": "TRACK123",
    "delivery_date": "2025-01-05",
    "signature": "Customer signed on delivery",
    "ip_address": "192.168.1.1"
  }
}
```

#### `POST /api/disputes/:id/evidence/upload`
Upload evidence document.

**Request:**
```json
{
  "evidence_type": "delivery_proof",
  "file_url": "https://s3.amazonaws.com/evidence/proof.pdf",
  "file_name": "delivery_proof.pdf",
  "mime_type": "application/pdf",
  "uploaded_by": "merchant-support",
  "notes": "Signed delivery receipt"
}
```

#### `POST /api/disputes/:id/resolve`
Resolve a dispute.

**Request:**
```json
{
  "actor": "admin",
  "outcome": "won",
  "notes": "Valid tracking and delivery proof provided"
}
```

**Outcomes:**
- `won` - Merchant wins, bank fee waived
- `lost` - Merchant loses, fees charged

#### `PATCH /api/disputes/:id/status`
Update dispute status.

**Request:**
```json
{
  "status": "under_review",
  "actor": "admin"
}
```

### Evidence & Logs

#### `GET /api/disputes/:id/evidence`
Get all evidence for a dispute.

#### `GET /api/disputes/:id/logs`
Get activity logs for a dispute.

#### `GET /api/disputes/:id/fees`
Get all fees for a dispute.

### Analytics

#### `GET /api/disputes/stats/:merchant_id`
Get dispute statistics for a merchant.

**Response:**
```json
{
  "total_disputes": 45,
  "open": 12,
  "won": 20,
  "lost": 13,
  "win_rate": 60.61,
  "total_fees": 405.00
}
```

#### `GET /api/disputes/templates`
Get all dispute templates.

## Installation

```bash
cd brique-66
npm install
```

## Configuration

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password

# Server
PORT=4066
NODE_ENV=development

# Card Networks (optional)
VISA_API_KEY=your_visa_key
MASTERCARD_API_KEY=your_mc_key
AMEX_API_KEY=your_amex_key

# S3 for Evidence Storage (optional)
AWS_REGION=us-east-1
S3_BUCKET_NAME=molam-dispute-evidence
```

## Usage

### 1. Apply Database Migration

```bash
psql -U postgres -d molam_connect -f migrations/066_disputes.sql
```

### 2. Start API Server

```bash
npm run dev
```

Server runs on http://localhost:4066

### 3. Start Worker (Background Tasks)

```bash
npm run worker
```

### 4. Test API

```bash
# Health check
curl http://localhost:4066/api/health

# Create dispute
curl -X POST http://localhost:4066/api/disputes \
  -H "Content-Type: application/json" \
  -d '{
    "connectTxId": "tx-test-1",
    "merchantId": "merchant-test",
    "amount": 10000,
    "currency": "USD",
    "reason": "fraud",
    "disputeType": "chargeback"
  }'

# Get dispute
curl http://localhost:4066/api/disputes/DISPUTE_ID

# Submit evidence
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/evidence \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "merchant-user",
    "evidence": {
      "tracking": "TRACK123",
      "delivery_date": "2025-01-05"
    }
  }'

# Resolve dispute
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "admin",
    "outcome": "won",
    "notes": "Valid evidence provided"
  }'

# Get merchant stats
curl http://localhost:4066/api/disputes/stats/merchant-test
```

## Dispute Workflow

### Standard Chargeback Flow

```
1. Dispute Created (open)
   ↓
   • Bank fee ($15) created as 'pending'
   • Response deadline set (7-21 days)
   • Merchant notified
   ↓
2. Merchant Submits Evidence (evidence_submitted)
   ↓
   • Evidence stored
   • Status updated
   • Submitted to card network
   ↓
3. Card Network Reviews (under_review)
   ↓
   • Network adjudicates
   • May request additional evidence
   ↓
4. Resolution (won or lost)
   ↓
   If WON:
   • Status → 'won'
   • Bank fee → 'waived'
   • No chargeback loss

   If LOST:
   • Status → 'lost'
   • Bank fee → 'charged' ($15)
   • Chargeback loss → 'charged' (full amount)
```

### Auto-Escalation

If merchant doesn't submit evidence by `respond_by`:
- Status automatically set to 'lost'
- All fees charged
- Merchant notified

## Fee Breakdown

### Bank Fee
- **Amount:** $15.00 USD (or equivalent)
- **When:** Created on chargeback disputes
- **Status:**
  - `pending` - Not yet charged
  - `charged` - Merchant loses dispute
  - `waived` - Merchant wins dispute

### Chargeback Loss
- **Amount:** Full transaction amount
- **When:** Merchant loses dispute
- **Status:**
  - `charged` - Added to merchant's negative balance

### Reversal Fee
- **Amount:** Varies by network
- **When:** Dispute reversed/canceled

## React Dashboard

### DisputeWorkbench

```tsx
import DisputeWorkbench from './web/DisputeWorkbench';

function App() {
  return <DisputeWorkbench />;
}
```

**Features:**
- View all disputes for a merchant
- Filter by status
- See win rate and statistics
- Quick access to dispute details
- Deadline alerts

### DisputeDetail

```tsx
import DisputeDetail from './web/DisputeDetail';

function DisputePage({ disputeId }: { disputeId: string }) {
  return <DisputeDetail disputeId={disputeId} />;
}
```

**Features:**
- View complete dispute information
- Submit evidence
- Upload documents
- View activity logs
- Track fees
- Resolve disputes

## Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- disputes.test.ts

# Run with coverage
npm test -- --coverage
```

## Operational Runbook

See [disputes_runbook.md](docs/disputes_runbook.md) for:
- Emergency procedures
- Common operations
- Investigating disputes
- Fee management
- Monitoring and alerts
- Worker operations
- Escalation procedures

## Integration Points

### With Connect (Payment Processing)
```typescript
// When a chargeback is received from card network
const dispute = await createDispute({
  connectTxId: payment.id,
  merchantId: payment.merchant_id,
  amount: payment.amount,
  currency: payment.currency,
  reason: chargeback.reason,
  disputeType: 'chargeback',
  networkRef: chargeback.network_ref,
});

// Notify merchant
await sendDisputeNotification(dispute);
```

### With Wallet/Payouts
```typescript
// Deduct fees from merchant payout
const fees = await getDisputeFees(merchantId, 'charged');
const totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);

// Reduce payout by fee amount
payout.amount -= totalFees;
```

### With Notifications
```typescript
// Send deadline reminder
if (daysUntilDeadline <= 3) {
  await sendEmail(merchant.email, 'Dispute deadline approaching', {
    disputeId: dispute.id,
    daysRemaining: daysUntilDeadline,
    amount: dispute.amount,
  });
}
```

## Key Files

```
brique-66/
├── migrations/
│   └── 066_disputes.sql           # Database schema
├── src/
│   ├── utils/
│   │   └── db.ts                  # PostgreSQL connection
│   ├── disputes/
│   │   ├── engine.ts              # Dispute management engine
│   │   ├── routes.ts              # API routes
│   │   └── worker.ts              # Background tasks
│   └── server.ts                  # Express server
├── tests/
│   └── disputes.test.ts           # Unit tests
├── web/
│   ├── DisputeWorkbench.tsx       # Merchant dispute dashboard
│   └── DisputeDetail.tsx          # Single dispute view
├── docs/
│   └── disputes_runbook.md        # Operational runbook
└── README.md
```

## Monitoring

### Key Metrics

1. **Dispute Rate**
   - Target: < 1% of transactions
   - Alert: > 1.5%

2. **Win Rate**
   - Target: > 50%
   - Alert: < 30%

3. **Evidence Submission Rate**
   - Target: > 80%
   - Alert: < 50%

4. **Response Time**
   - Target: < 48 hours
   - Alert: > 72 hours

5. **Expired Disputes**
   - Target: < 5% auto-escalated
   - Alert: > 10%

## Next Steps

- [ ] Add comprehensive unit tests
- [ ] Integrate with real card network APIs (Visa, Mastercard, Amex)
- [ ] Add S3 upload for evidence documents
- [ ] Implement email notifications
- [ ] Add dispute preview before submission
- [ ] Support bulk evidence uploads
- [ ] Add dispute analytics dashboard
- [ ] Implement ML for dispute outcome prediction
- [ ] Add automated evidence suggestions
- [ ] Support multi-language templates
- [ ] Prometheus metrics
- [ ] Grafana dashboards

## License

MIT