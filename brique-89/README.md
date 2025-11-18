# Brique 89 — Payouts & Settlement Engine

**Industrial-grade payout processing system with batch/instant/priority modes, intelligent routing, and comprehensive settlement tracking**

## Overview

Brique 89 is a production-ready payout engine that orchestrates outbound payments to merchants, agents, and beneficiaries across multiple payment rails. It provides:

- **Three Priority Modes**: Instant (real-time), Priority (same-day), Batch (scheduled)
- **Intelligent Routing**: SIRA-powered routing optimization for cost and speed
- **Ledger Integration**: Atomic holds and double-entry bookkeeping (B88)
- **Retry & DLQ**: Exponential backoff with Dead Letter Queue for manual intervention
- **Multi-Currency**: FX-aware routing with currency conversion support
- **Approval Workflows**: Multi-signature approvals for high-value or suspicious payouts
- **Idempotency**: Duplicate-safe with Idempotency-Key enforcement
- **Bank Connectors**: Pluggable connector architecture for multiple banks/providers

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Payout Creation                           │
│  POST /api/payouts (with Idempotency-Key)                    │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │  Fee Calculator│
              │  SIRA Routing │
              │  Ledger Hold  │
              └──────┬────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   [Approval?]                [Created]
        │                         │
        ▼                         ▼
   [Multi-Sig]              ┌──────────┐
        │                   │  Batcher │
        └──────────▶        │  Worker  │
                            └─────┬────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼                           ▼
              [Instant Queue]              [Batch Queue]
                    │                           │
                    ▼                           ▼
              ┌──────────┐              ┌──────────┐
              │  Sender  │              │  Sender  │
              │  Worker  │              │  Worker  │
              │ (Instant)│              │ (Batch)  │
              └─────┬────┘              └─────┬────┘
                    │                         │
                    └─────────┬───────────────┘
                              ▼
                       ┌──────────────┐
                       │Bank Connector│
                       │  (mTLS/HSM)  │
                       └──────┬───────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
            [Success]     [Retry]       [DLQ]
                │             │             │
                ▼             ▼             ▼
         Reconciliation  Retry Worker   Manual
         (B86/B87)       Backoff        Intervention
```

## Key Features

### 1. **Priority-Based Processing**

- **Instant** (`priority: 'instant'`):
  - Real-time processing (< 30 seconds)
  - Higher fees (instant rail costs)
  - Limit: $50k USD equivalent
  - Use case: Urgent merchant payouts, emergency withdrawals

- **Priority** (`priority: 'priority'`):
  - Same-day processing
  - Moderate fees
  - Limit: $100k USD equivalent
  - Use case: High-priority settlements

- **Normal/Batch** (`priority: 'normal'`):
  - Scheduled batches (daily/weekly)
  - Lowest fees (optimized grouping)
  - No limit
  - Use case: Standard merchant payouts, bulk disbursements

### 2. **Intelligent SIRA Routing**

SIRA (AI Risk & Routing) provides:
- **Cost Optimization**: Selects cheapest rail for currency/amount
- **Fraud Detection**: Scores payouts for risk (0-1 scale)
- **Batch Recommendations**: Suggests optimal batch sizes/cutoffs
- **Learning Loop**: Improves routing based on historical performance

### 3. **Ledger Integration**

- **Atomic Operations**: Payout creation + ledger hold in single transaction
- **Double-Entry**: Final settlement creates balanced journal entries
- **Hold/Release**: Funds reserved until confirmation
- **Reconciliation**: Automatic matching with bank statements (B86)

### 4. **Retry & DLQ**

Exponential backoff schedule:
- Attempt 1: 1 minute
- Attempt 2: 5 minutes
- Attempt 3: 15 minutes
- Attempt 4: 1 hour
- Attempt 5: 6 hours
- Attempt 6: 24 hours

After 6 attempts → **Dead Letter Queue** (DLQ) for manual ops intervention.

### 5. **Approval Workflows**

Multi-signature approvals required for:
- High amounts (> $50k USD by default)
- High fraud scores (> 0.7)
- Flagged beneficiaries

Configurable quorum (default: 2 approvers).

## Database Schema

### Core Tables

**payouts** - Main payout records
```sql
- id, external_id (idempotency)
- amount, currency, molam_fee, bank_fee
- beneficiary (JSONB), bank_profile_id, treasury_account_id
- status, priority, scheduled_for
- hold_reason, approval tracking
- ledger_hold_id, ledger_entry_id
```

**payout_batches** - Batch grouping
```sql
- id, batch_ref, provider_batch_ref
- bank_profile_id, currency, batch_date
- status, total_amount, item_count
- file_path (ISO20022/CSV batch file)
```

**payout_attempts** - Immutable attempt log
```sql
- payout_id, attempt_number, attempted_at
- success, provider_ref, error_code
- latency_ms, connector_name
```

**payout_hold_approvals** - Multi-sig approvals
```sql
- payout_id, approver_id, role, action
- comment, approved_at
```

**payout_dlq** - Dead Letter Queue
```sql
- payout_id, reason, error_summary
- status, assigned_to, resolved_at
```

## REST API

### Create Payout

```bash
POST /api/payouts
Idempotency-Key: payout-12345

{
  "origin_module": "wallet",
  "origin_entity_id": "merchant-uuid",
  "amount": 1000.00,
  "currency": "USD",
  "beneficiary": {
    "account_number": "1234567890",
    "account_name": "John Doe",
    "bank_code": "BOA",
    "routing_number": "021000021"
  },
  "priority": "instant",
  "metadata": {
    "invoice_id": "inv-123"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "external_id": "payout-12345",
  "status": "created",
  "amount": 1000.00,
  "currency": "USD",
  "molam_fee": 2.00,
  "bank_fee": 5.00,
  "total_debited": 1007.00,
  "priority": "instant",
  "hold_id": "hold-uuid"
}
```

### List Payouts

```bash
GET /api/payouts?status=created&currency=USD&limit=50&offset=0
```

### Get Payout

```bash
GET /api/payouts/:id
```

### Approve Payout

```bash
POST /api/payouts/:id/approve

{
  "approver_id": "user-uuid",
  "approver_role": "finance_ops",
  "comment": "Verified beneficiary details"
}
```

### Cancel Payout

```bash
POST /api/payouts/:id/cancel

{
  "reason": "Duplicate payout detected",
  "cancelled_by": "ops-user-uuid"
}
```

## Bank Connectors

### Base Connector Interface

```typescript
interface PayoutRequest {
  payout_id: string;
  external_id: string;
  amount: number;
  currency: string;
  beneficiary: BeneficiaryDetails;
  reference?: string;
  urgency?: 'normal' | 'priority' | 'instant';
}

interface PayoutResponse {
  success: boolean;
  provider_ref: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  estimated_settlement_date?: string;
  fee_charged?: number;
  error_code?: string;
  error_message?: string;
}
```

### Included Connectors

- **Sandbox Connector**: Mock connector for testing
  - Simulates success/failure (configurable failure rate)
  - Auto-settlement after delay
  - Supports instant and batch modes

### Adding New Connectors

1. Extend `BaseBankConnector` class
2. Implement required methods:
   - `sendPayment()` - Single instant payout
   - `sendBatch()` - Batch submission
   - `getPayoutStatus()` - Status query
   - `healthCheck()` - Connector health

3. Register in `connector-registry.ts`

## Workers

### 1. Batcher Worker

**Purpose**: Groups payouts into batches per bank/currency

```bash
npm run worker:batcher
```

**Logic**:
1. Fetch `created` payouts ready for processing
2. Call SIRA for routing recommendations
3. Group by `bank_profile_id` + `currency` + `routing_method`
4. Create `payout_batches` records
5. Update payouts to `queued` status

**Config**:
- `BATCHER_POLL_INTERVAL_MS`: Poll frequency (default: 30s)
- `BATCH_SIZE_LIMIT`: Max payouts per batch (default: 100)

### 2. Sender Worker

**Purpose**: Sends instant payouts and batches to bank connectors

```bash
npm run worker:sender
```

**Logic**:
1. Fetch `queued` instant payouts
2. Call `connector.sendPayment()`
3. Log attempt in `payout_attempts`
4. Update status to `sent` or `failed`
5. Fetch `open` batches
6. Call `connector.sendBatch()`
7. Update batch status to `submitted`

**Config**:
- `SENDER_POLL_INTERVAL_MS`: Poll frequency (default: 10s)
- `INSTANT_BATCH_SIZE`: Concurrent instant payouts (default: 50)

### 3. Retry Dispatcher

**Purpose**: Handles retry logic and DLQ

```bash
npm run worker:retry
```

**Logic**:
1. Fetch `failed` payouts where `next_retry_at` <= now
2. Reset status to `queued` for retry
3. If `attempt_count` >= `max_attempts` → move to DLQ
4. Notify ops team

**Config**:
- `RETRY_POLL_INTERVAL_MS`: Poll frequency (default: 60s)

## Deployment

### 1. Database Setup

```bash
# Run migrations
psql -d molam_connect -f migrations/001_b89_payouts_engine.sql
```

### 2. Configuration

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Install & Build

```bash
npm install
npm run build
```

### 4. Start Services

```bash
# Terminal 1: API Server
npm start

# Terminal 2: Batcher
npm run worker:batcher

# Terminal 3: Sender
npm run worker:sender

# Terminal 4: Retry Dispatcher
npm run worker:retry
```

### 5. Health Check

```bash
curl http://localhost:3089/api/payouts/health
```

## Integration Points

### With Brique 88 (Ledger)

- Creates ledger holds on payout creation
- Releases holds on settlement
- Posts final journal entries (double-entry)

### With Brique 86/87 (Reconciliation)

- Payouts matched with bank statement lines via `provider_ref`
- Automatic settlement status updates
- Variance adjustments for fee differences

### With SIRA (Routing & Risk)

- Routing recommendations (cheapest/fastest bank)
- Fraud scoring (0-1 scale)
- Batch optimization suggestions

## Monitoring

### Prometheus Metrics (Ready)

```
payouts_created_total
payouts_sent_total
payouts_settled_total
payouts_failed_total
batch_creation_latency_seconds
payout_processing_time_seconds
dlq_size
approval_queue_size
```

### SLOs

- **Instant Payouts**: P95 < 30 seconds from creation to sent
- **Batch Payouts**: P95 < cutoff + 15 minutes
- **Retry Success Rate**: > 80% within 24 hours
- **DLQ Rate**: < 0.1% of total payouts

## Security

### mTLS for Bank Connectors

```typescript
// Example connector config
{
  "cert_path": "/path/to/client-cert.pem",
  "key_path": "/path/to/client-key.pem",
  "ca_path": "/path/to/ca-cert.pem"
}
```

### HSM Signing (Optional)

For ISO20022 batch files requiring digital signatures:
```typescript
const signedBatch = await hsm.sign(batchFile, keyId);
```

### Secrets Management

- Store API keys/credentials in HashiCorp Vault
- Environment variables for non-sensitive config
- Rotate keys regularly

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:coverage
```

### Test Scenarios

- Idempotency (duplicate `external_id`)
- Approval workflow (multi-sig)
- Retry logic (exponential backoff)
- DLQ triggering (max attempts exceeded)
- Batch grouping (routing optimization)
- Fee calculation (instant vs batch)

## Troubleshooting

### Payout Stuck in `held` Status

**Cause**: Requires approval

**Solution**:
```sql
SELECT * FROM payouts WHERE id = '{payout_id}';
-- Check approval_count vs approval_required
-- Submit approvals via API
```

### Payout in DLQ

**Query**:
```sql
SELECT * FROM payout_dlq WHERE status = 'pending';
```

**Resolution**:
1. Investigate error in `payout_attempts`
2. Fix issue (e.g., invalid beneficiary)
3. Retry manually or cancel

### Batch Not Submitting

**Possible Issues**:
- No payouts in batch (`item_count = 0`)
- Connector unavailable
- Bank API down

**Check**:
```sql
SELECT * FROM payout_batches WHERE status = 'open';
-- Check connector health
-- Review sender worker logs
```

## Best Practices

1. **Always Use Idempotency Keys**: Prevents duplicate payouts
2. **Monitor DLQ**: Set up alerts for DLQ > 0
3. **Test Connectors**: Use sandbox connector for development
4. **Review Approvals**: Don't let approval queue grow indefinitely
5. **Batch Optimization**: Use SIRA recommendations for cutoff times
6. **Reconcile Daily**: Match payouts with bank statements (B86)
7. **Audit Regularly**: Review `payout_attempts` for patterns
8. **Rotate Keys**: Update bank API credentials quarterly

## Support

- **Documentation**: `/docs/payouts`
- **Slack**: #brique-89-payouts
- **On-call**: treasury-oncall@molam.com

---

**Status**: ✅ **PRODUCTION-READY**
**Version**: 1.0.0
**Dependencies**: Brique 88 (Ledger), Brique 86/87 (Reconciliation), SIRA (Routing)
