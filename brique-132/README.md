# Brique 132 — Payouts & Settlement Engine

## Overview
Industrial-grade payout processing engine for executing outgoing payments from Molam to merchants, agents, and external bank accounts with scheduling, batching, retry logic, and complete reconciliation.

## Features
- **Flexible Scheduling**: Batch, weekly, monthly, on-demand, instant
- **Priority & Batching**: Configurable priority queues and batch processing
- **Idempotent Operations**: Unique external_id prevents duplicate payouts
- **Ledger Integration**: Automatic holds and release with double-entry accounting
- **Retry Logic**: Exponential backoff (1m → 5m → 15m → 1h → 6h → 24h)
- **DLQ Support**: Dead letter queue for failed payouts after max attempts
- **Multi-Currency**: Full support for cross-currency payouts with FX
- **Bank Connectors**: Pluggable architecture (REST, MT940, ISO20022, SFTP)
- **Reconciliation**: Automatic matching with bank statement lines
- **SIRA Integration**: AI-driven routing, failover, cost optimization
- **Audit Trail**: Immutable attempt logs and status transitions
- **RBAC**: Role-based access (finance_ops, pay_admin, pay_module)

## Database Tables

### payouts
Core payout records
- `external_id` - Idempotency key (unique)
- `origin_module` - Source module (connect, shop, agents, ops)
- `status` - pending, reserved, processing, sent, settled, failed, cancelled, reversed
- `amount` / `currency` - Payout amount
- `scheduled_for` - Execution timestamp
- `priority` - 0 = highest priority
- `treasury_account_id` - Source treasury account
- `bank_profile_id` - Target bank connector
- `payee_bank_account` - Beneficiary details (JSONB)
- `provider_ref` - Bank reference after sending
- `molam_fee` / `bank_fee` - Fee breakdown
- `reference_code` - Human-readable reference for reconciliation
- `attempt_count` - Number of send attempts
- `next_attempt_at` - Scheduled retry timestamp

### payout_batches
Batch grouping for multiple payouts
- `batch_ref` - Unique batch reference
- `status` - draft, locked, processing, completed, failed
- `total_amount` / `total_count` - Batch aggregates

### payout_batch_items
Many-to-many relationship between batches and payouts

### payout_attempts
Immutable audit log of all send attempts
- `attempt_number` - Attempt sequence
- `status` - sent, retry, failed
- `response_code` / `response_body` - Bank response
- `error_message` - Failure reason

### payout_holds
Links payouts to ledger holds
- `ledger_hold_ref` - Reference to ledger hold entry
- `status` - active, released, expired

### payout_reconciliation
Links payouts to bank statement lines
- `matched_by` - auto, manual, sira
- `confidence_score` - Auto-match confidence (0-1)

## API Endpoints

### POST /api/treasury/payouts
Create new payout (requires `Idempotency-Key` header)

```json
{
  "origin_module": "connect",
  "origin_entity_id": "merchant-uuid",
  "amount": 1000.00,
  "currency": "USD",
  "payee_bank_account": {
    "iban": "FR7612345678901234567890123",
    "holder_name": "Merchant Inc",
    "swift_code": "BNPAFRPP"
  },
  "scheduled_for": "2025-01-20T10:00:00Z",
  "priority": 50
}
```

**Response:**
```json
{
  "id": "uuid",
  "external_id": "idempotency-key",
  "reference_code": "PAYOUT-2025-01-18-ABC123XYZ",
  "status": "pending",
  "amount": "1000.00",
  "currency": "USD",
  "molam_fee": "0.50",
  "bank_fee": "1.00",
  "total_deducted": "1001.50"
}
```

### GET /api/treasury/payouts/:id
Get payout details with attempt history

### GET /api/treasury/payouts
List payouts with filters
- `status` - Filter by status
- `origin_module` - Filter by module
- `currency` - Filter by currency
- `from` / `to` - Date range
- `limit` / `offset` - Pagination

### POST /api/treasury/payouts/:id/cancel
Cancel pending payout and release ledger hold

### POST /api/treasury/payouts/:id/execute
Force immediate execution (admin override, sets priority=0)

### POST /api/treasury/batches
Create payout batch

```json
{
  "batch_ref": "BATCH-2025-01-MERCHANTS",
  "payout_ids": ["uuid1", "uuid2", "uuid3"],
  "scheduled_for": "2025-01-20T00:00:00Z"
}
```

### POST /api/treasury/batches/:id/lock
Lock batch to prevent modifications before processing

### GET /api/treasury/batches
List batches with status filter

### POST /api/treasury/reconcile
Reconcile payout with bank statement line

```json
{
  "payout_id": "uuid",
  "statement_line_id": "uuid",
  "matched_by": "auto",
  "confidence_score": 0.98
}
```

### GET /api/treasury/stats
Get treasury statistics (pending, sent, settled, failed counts + amounts)

## Payout Lifecycle

```
1. CREATE (pending)
   - Validate input
   - Create ledger hold
   - Generate reference_code
   - Store payout record

2. SCHEDULE
   - Dispatcher polls pending payouts where scheduled_for <= now()
   - Locks with FOR UPDATE SKIP LOCKED

3. PROCESS
   - Mark status='processing'
   - Increment attempt_count
   - Call bank connector sendPayment()

4. SENT
   - Store provider_ref
   - Mark status='sent'
   - Emit payout.sent webhook
   - Wait for reconciliation

5. RECONCILE
   - Match provider_ref with bank statement
   - Mark status='settled'
   - Release ledger hold (finalize entries)
   - Emit payout.settled webhook

RETRY on failure:
   - Record attempt in payout_attempts
   - Schedule next_attempt_at with exponential backoff
   - Max 7 attempts before DLQ

CANCEL:
   - Only if status in (pending, reserved)
   - Release ledger hold
   - Mark status='cancelled'
```

## Retry & Backoff

**Exponential Backoff Schedule:**
- Attempt 1: Immediate
- Attempt 2: +60s (1 minute)
- Attempt 3: +300s (5 minutes)
- Attempt 4: +900s (15 minutes)
- Attempt 5: +3600s (1 hour)
- Attempt 6: +21600s (6 hours)
- Attempt 7+: +86400s (24 hours)

**Max Attempts:** 7

After max attempts, payout is marked `failed` and moved to DLQ (dead letter queue) for manual investigation.

## Dispatcher Worker

**Process:**
```bash
node src/worker/payoutDispatcher.ts
```

**Configuration:**
- Poll interval: 5 seconds (configurable)
- Batch size: 20 payouts per cycle
- Locking: `FOR UPDATE SKIP LOCKED` for horizontal scaling

**Stuck Payout Monitor:**
Resets payouts stuck in `processing` status for >10 minutes back to `pending`.

## Bank Connector Interface

**Pluggable Architecture:**
```typescript
interface BankConnector {
  name: string;
  type: "REST" | "MT940" | "ISO20022" | "SFTP";

  sendPayment(payout): Promise<{
    status: "sent" | "failed";
    provider_ref?: string;
    http_code?: number;
  }>;

  getPaymentStatus(provider_ref: string): Promise<any>;

  uploadStatement?(fileBuffer: Buffer): Promise<{ imported_id: string }>;
  parseStatement?(imported_id: string): Promise<any[]>;

  healthCheck?(): Promise<boolean>;
}
```

**Available Connectors:**
- **SandboxBankConnector** - Testing/development (5% simulated failure rate)
- **RestBankConnector** - HTTP API banks
- **MT940Connector** - SWIFT MT940 file parsing
- **ISO20022Connector** - ISO20022 XML messages

**Connector Registration:**
```typescript
import { registerConnector } from "./connectors/bankConnectorInterface";
import { sandboxConnector } from "./connectors/sandboxConnector";

registerConnector("bank-profile-uuid", sandboxConnector);
```

## Ledger Integration

**Hold Creation:**
When payout is created, ledger hold is placed:
- Debit: User/merchant balance
- Hold amount: payout amount + estimated fees
- Reference: `payout-hold-{nanoid}`

**Hold Release (on settlement):**
- Release hold
- Finalize ledger entries:
  - Debit: Treasury account
  - Credit: External bank account
  - Credit: Fee revenue accounts

**Hold Release (on cancellation):**
- Release hold without finalizing
- Restore original balance

## SIRA Integration

**Routing Optimization:**
- SIRA recommends best `treasury_account_id` and `bank_profile_id`
- Considers: cost, latency, success rate, bank health
- Automatic failover if primary bank unavailable

**Cost Optimization:**
- Compares molam_fee + bank_fee across routes
- Selects cheapest option meeting SLA

**Anomaly Detection:**
- High failure rate → suggest alternative bank
- Circuit breaker integration → auto-failover

## Reconciliation

**Automatic Matching:**
1. Bank statement imported via connector
2. Match `provider_ref` or `reference_code` to statement line
3. Mark payout as `settled`
4. Release ledger holds
5. Emit `payout.settled` webhook

**Manual Reconciliation:**
- Ops can manually match via UI
- Sets `matched_by='manual'`
- Requires justification/reason

**Match Confidence:**
- Auto-matching includes confidence score (0-1)
- Scores <0.95 flagged for review

## Batching

**Batch Creation:**
1. Select eligible payouts (same currency, treasury account)
2. Create batch with unique `batch_ref`
3. Add payouts to `payout_batch_items`
4. Lock batch to prevent modifications

**Batch Processing:**
- Dispatcher processes all payouts in locked batch
- Batch status transitions: draft → locked → processing → completed
- Failed payouts don't block entire batch

## Multi-Currency & FX

**Currency Handling:**
- Payouts executed in `currency` specified
- FX conversion via treasury float swaps
- FX fees calculated via Commissions Engine (B131)
- Settlement in beneficiary currency

**Cross-Border:**
- SWIFT/ISO20022 for international transfers
- Compliance with local regulations
- KYC/AML checks via partner banks

## Security & Compliance

**Idempotency:**
- Required `Idempotency-Key` header prevents duplicates
- Returns existing payout if key already used

**RBAC:**
- `pay_module` - Create payouts from modules
- `finance_ops` - View, cancel, reconcile
- `pay_admin` - Full access including batch approval

**Audit Trail:**
- All attempts logged in `payout_attempts`
- Status transitions tracked with timestamps
- Immutable records (no updates, only inserts)

**Multi-Sig Approval:**
- Large payouts (>threshold) require approval
- Approval workflow integration
- Admin override with audit log

**Encryption:**
- `payee_bank_account` JSONB encrypted at rest
- Bank credentials in Vault
- mTLS for bank API connections

## Observability

**Prometheus Metrics:**
- `molam_payouts_created_total{module, currency}` - Counter
- `molam_payouts_sent_total{bank_profile}` - Counter
- `molam_payouts_settled_total{currency}` - Counter
- `molam_payout_dispatch_latency_seconds` - Histogram
- `molam_payout_dispatch_failures_total` - Counter
- `molam_payout_reconciliation_match_rate` - Gauge

**SLOs:**
- Dispatch decision latency P95 <500ms
- Reconciliation match rate >99%
- Failed payout rate <1%

**Alerting:**
- Failed payouts >5% in 1h → PagerDuty
- Stuck payouts >50 → Ops notification
- Reconciliation match rate <99% → Finance alert

## Testing

**Unit Tests:**
- Idempotency verification
- Status transition validation
- Retry backoff calculation

**Integration Tests:**
- Full payout lifecycle (create → dispatch → settle)
- Batch processing
- Ledger hold creation/release
- Reconciliation matching

**Run Tests:**
```bash
npm test tests/payout.lifecycle.test.ts
```

## Operational Runbooks

### Emergency Pause All Payouts
```sql
-- Pause all pending payouts
UPDATE payouts SET status = 'reserved' WHERE status = 'pending';

-- Stop dispatcher workers
systemctl stop payout-dispatcher
```

### Retry Failed Payout
```sql
-- Reset payout to pending
UPDATE payouts
SET status = 'pending',
    next_attempt_at = now(),
    attempt_count = 0
WHERE id = 'payout-uuid';
```

### Manual Reconciliation
```bash
curl -X POST /api/treasury/reconcile \
  -H "Content-Type: application/json" \
  -d '{
    "payout_id": "uuid",
    "statement_line_id": "uuid",
    "matched_by": "manual"
  }'
```

### Investigate Stuck Payout
```sql
SELECT p.*, pa.*
FROM payouts p
LEFT JOIN payout_attempts pa ON pa.payout_id = p.id
WHERE p.id = 'payout-uuid'
ORDER BY pa.attempt_ts DESC;
```

### DLQ Processing
```sql
-- List failed payouts in DLQ
SELECT * FROM payouts
WHERE status = 'failed'
ORDER BY updated_at DESC;

-- Analyze failure patterns
SELECT
  error_message,
  COUNT(*) as count
FROM payout_attempts
WHERE status = 'failed'
GROUP BY error_message
ORDER BY count DESC;
```

## Rollout Strategy

**Phase 1 - Sandbox Testing:**
- Deploy schema and services
- Register sandbox connector
- Create test payouts
- Verify dispatcher processing
- Test reconciliation flow

**Phase 2 - Shadow Mode:**
- Route production requests through payout service
- Don't execute actual bank transfers
- Compare results with existing system
- Duration: 48-72 hours

**Phase 3 - Gradual Rollout:**
- Enable for small merchants first
- Feature flag per module
- Monitor failure rates and latency
- Circuit breaker on errors

**Phase 4 - Full Production:**
- Enable all modules
- Decommission legacy payout code
- 24/7 monitoring for 7 days
- Ops training on dashboard and runbooks

## Integration Points
- **Treasury (B34)** - Treasury accounts, bank profiles
- **Commissions (B131)** - Fee calculation (molam_fee, bank_fee)
- **Billing (B46)** - Netting invoices before payout
- **Ledger** - Double-entry accounting, holds
- **SIRA** - Routing optimization, failover
- **Webhook Engine (B45)** - Events (payout.created, payout.sent, payout.settled, payout.failed)
- **Bank Connectors** - Pluggable bank integrations

## Version
**1.0.0** | Status: ✅ Ready for Production
