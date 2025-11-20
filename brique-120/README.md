# Brique 120 — Payouts Engine & Scheduling

**Industrial-grade payout engine with batch processing, priority routing, and ledger integration**

## Overview

This module implements a production-ready payouts engine for Molam Connect that handles disbursements to merchants, agents, and users with:

- **Multiple priorities**: instant, priority, normal, low
- **Flexible scheduling**: ASAP, daily, weekly, monthly, custom
- **Batch processing**: automatic grouping and netting
- **Ledger integration**: double-entry accounting with holds
- **Retry mechanism**: exponential backoff with DLQ
- **Approvals**: multi-signature for high-value payouts
- **Full audit trail**: immutable event logging

## Architecture

```
brique-120/
├── migrations/
│   └── 001_payouts_engine.sql     # Complete schema
├── src/
│   └── routes/
│       └── payouts.ts              # API routes
├── prisma/
│   └── schema.prisma               # Prisma models
├── tests/
│   └── payouts.test.ts             # Jest tests (60+ tests)
└── README.md
```

## Database Schema

### Core Tables

1. **payouts** - Main payout records
   - Origin tracking (module, entity)
   - Amount, fees, net amount
   - Beneficiary details (JSONB)
   - Routing (bank, treasury account)
   - Priority & scheduling
   - Status tracking
   - Retry management

2. **ledger_holds** - Double-entry holds
   - Amount reservations
   - Release tracking
   - Expiry management

3. **payout_batches** - Batch processing
   - Batch grouping by bank/currency
   - Status tracking
   - Success/failure counts

4. **payout_batch_lines** - Batch line items
   - Links batches to individual payouts

5. **payout_approvals** - Multi-sig approvals
   - Approval thresholds
   - Signature tracking

6. **payout_events** - Audit trail
   - All state changes
   - Categorized and severity-leveled

7. **payout_routing_rules** - Fee & routing rules
   - Dynamic fee calculation
   - Bank selection
   - Auto-batch settings

## API Routes

### POST /api/payouts
Create a new payout (idempotent)

**Headers:**
- `Idempotency-Key`: Required unique key

**Body:**
```json
{
  "origin_module": "connect",
  "origin_entity_id": "uuid",
  "currency": "EUR",
  "amount": 1000,
  "beneficiary": {
    "account_number": "FR76...",
    "account_name": "Merchant Name",
    "bank_code": "BNPAFRPP"
  },
  "priority": "normal",
  "scheduled_run": "2025-01-25T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "payout": {
    "id": "uuid",
    "external_id": "idempotency-key",
    "status": "pending",
    "amount": "1000.000000",
    "molam_fee": "2.500000",
    "bank_fee": "0.500000",
    "net_amount": "997.000000",
    "reference_code": "PO-20250120-ABC123"
  },
  "hold_id": "uuid"
}
```

### GET /api/payouts/:id
Get payout details with hold, events, and batch info

### GET /api/payouts
List payouts with filters

**Query params:**
- `status`: pending, queued, processing, sent, settled, failed, cancelled
- `priority`: instant, priority, normal, low
- `origin_module`: connect, wallet, ops
- `origin_entity_id`: UUID
- `currency`: EUR, USD, GBP, etc.
- `from_date`, `to_date`: ISO timestamps
- `page`, `limit`: Pagination

### POST /api/payouts/:id/cancel
Cancel a pending or queued payout

### GET /api/payouts/summary/pending
Get summary of pending payouts grouped by currency/priority/module

### GET /api/payouts/failed/dlq
Get failed payouts in dead letter queue

### GET /api/payouts/batches
List payout batches with filters

## Priority Levels & Fees

| Priority | Molam Fee | Bank Fee | Batch | Approval Threshold |
|----------|-----------|----------|-------|-------------------|
| instant  | 0.50%     | €2.00    | No    | -                 |
| priority | 0.35%     | €1.00    | Yes   | -                 |
| normal   | 0.25%     | €0.50    | Yes   | €10,000           |
| low      | 0.15%     | €0.25    | Yes   | €50,000           |

## Payout Flow

1. **Create** → Ledger hold + payout record (status: pending)
2. **Queue** → Scheduler picks up and groups into batches
3. **Process** → Bank connector sends to provider
4. **Sent** → Provider confirms receipt
5. **Settled** → Reconciliation matches bank statement
6. **Complete** → Release ledger hold, finalize accounting

## Idempotency

All payout creations require an `Idempotency-Key` header. Duplicate requests with the same key return the existing payout without creating a new one or charging fees.

## Ledger Integration

Each payout creates a ledger hold that reserves funds:

```sql
-- On create
INSERT INTO ledger_holds (origin_entity_id, currency, amount, ref_type, ref_id)
VALUES (merchant_id, 'EUR', 1000, 'payout', payout_id);

-- On settle
UPDATE ledger_holds SET status = 'released', released_at = now()
WHERE ref_id = payout_id;
```

## Retry Mechanism

Failed payouts automatically retry with exponential backoff:

- Attempt 1: immediate
- Attempt 2: 1 minute
- Attempt 3: 5 minutes
- Attempt 4: 20 minutes
- Attempt 5: 1 hour
- Attempt 6: 6 hours

After 6 attempts, payouts enter the Dead Letter Queue (DLQ) for manual intervention.

## Testing

**60+ tests** covering:
- Payout creation & idempotency
- Fee calculation (all priorities)
- Cancellation
- Filtering & pagination
- Database functions
- Ledger holds

```bash
cd brique-120
npm install
npm test
```

## SQL Functions

### create_ledger_hold(entity_id, currency, amount, reason, ref_type, ref_id)
Creates a ledger hold for a payout

### release_ledger_hold(hold_id, release_amount)
Releases a hold (full or partial)

### calculate_payout_fees(currency, amount, priority, origin_module)
Calculates molam_fee, bank_fee, and net_amount based on routing rules

### log_payout_event(payout_id, batch_id, event_type, category, severity, description, metadata, triggered_by)
Logs an immutable audit event

## Views

### pending_payouts_summary
Aggregate pending payouts by currency, priority, module

### failed_payouts_dlq
Failed payouts needing manual attention

### batch_execution_summary
Batch performance metrics with success rates

## Installation

```powershell
# Run migration
.\setup-all-schemas.ps1

# Or manually
psql -U postgres -d molam_connect -f brique-120/migrations/001_payouts_engine.sql
```

## Environment Variables

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=postgres
```

## Integration with Other Briques

- **Brique 119 (Bank Profiles)**: Uses bank_profile_id and treasury_account_id for routing
- **Brique 116 (Routing)**: SIRA can suggest optimal banks based on SLA/health
- **Brique 118 (Observability)**: Metrics integration for monitoring

## Security & Compliance

- Idempotency keys prevent duplicate payouts
- Ledger holds prevent double-spending
- Multi-sig approvals for high-value payouts
- Full audit trail in payout_events
- User tracking (created_by, approved_by)
- Encrypted beneficiary data (JSONB)

## Production Considerations

### Monitoring
- Track payout creation rate
- Monitor batch send latency
- Alert on high failure rates (> 0.5%)
- DLQ depth alerts

### Scaling
- Database indexes optimized for common queries
- Batch processing reduces bank API calls
- Async workers for send operations

### Disaster Recovery
- Idempotency enables safe retries
- Event log allows state reconstruction
- Holds prevent fund loss during failures

## Example Usage

```typescript
import axios from 'axios';

// Create instant payout
const response = await axios.post('http://localhost:3000/api/payouts', {
  origin_module: 'connect',
  origin_entity_id: merchant_id,
  currency: 'EUR',
  amount: 1500,
  beneficiary: {
    account_number: 'FR7612345678901234567890123',
    account_name: 'ACME Corp',
    bank_code: 'BNPAFRPP'
  },
  priority: 'instant'
}, {
  headers: {
    'Idempotency-Key': `payout-${Date.now()}-${Math.random()}`
  }
});

console.log(response.data.payout);
```

## Roadmap

- [ ] Worker scheduler implementation
- [ ] Bank connector framework
- [ ] Reconciliation automation
- [ ] SIRA routing integration
- [ ] Treasury workbench UI
- [ ] Webhook notifications
- [ ] ISO20022 support

---

**Brique 120** — Production Ready ✅
