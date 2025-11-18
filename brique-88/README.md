# Brique 88 — Auto-Adjustments Ledger Integration & Compensation Flows

**Industrial-grade accounting integration for automatic reconciliation adjustments**

## Overview

Brique 88 extends Briques 86 & 87 to handle the accounting and financial compensation aspects of bank statement reconciliation. When reconciliation rules detect discrepancies (fees, FX variance, partial settlements), this system:

1. **Creates ledger adjustments** (with approval workflows)
2. **Posts double-entry journal entries** to general ledger
3. **Executes compensation actions** (wallet credits, credit notes, payout adjustments)
4. **Handles reversals** with compensating transactions
5. **Maintains full audit trail** (immutable logs)

## Architecture

```
Reconciliation Rule (B87)
         │
         ▼
   Create Adjustment
   (ledger_adjustments)
         │
         ▼
  Adjustments Processor
         │
    ┌────┴────┐
    ▼         ▼
Check      Build
Approvals  Journal Entry
    │       (double-entry)
    │         │
    └────┬────┘
         ▼
    Post Journal
         │
         ▼
   Enqueue Compensation
   Actions
         │
         ▼
  Compensation Worker
         │
    ┌────┴────┬────────┬─────────┐
    ▼         ▼        ▼         ▼
  Wallet   Credit   Payout    Refund
  Credit   Note     Reduce
```

## Key Features

### Double-Entry Bookkeeping
- **Balanced Entries**: Every journal entry must balance (debit = credit)
- **GL Mapping**: Automatic mapping of adjustment types to GL codes
- **Multi-Currency**: FX rate handling with base currency conversion
- **Immutability**: Posted journal entries cannot be modified (only reversed)

### Approval Workflows
- **Threshold-Based**: Auto-apply below threshold, require approval above
- **Multi-Signature**: Configurable quorum for high-value adjustments
- **Role-Based**: `finance_ops`, `recon_ops`, `pay_admin` roles
- **Audit Trail**: All approvals logged with user ID and timestamp

### Compensation Actions
- **Wallet Operations**: Credit/debit user wallets (integrate with B20 Wallet)
- **Credit Notes**: Create billing credit notes for merchants
- **Payout Adjustments**: Reduce or increase pending payouts
- **Refunds**: Process payment refunds
- **Retry Logic**: Failed actions retry up to 5 times with exponential backoff

### Reversals & Rollbacks
- **Reversal Requests**: Ops can request adjustment reversal
- **Approval Required**: Multi-sig approval for reversals
- **Compensating Entries**: Creates opposite journal entry
- **Action Reversal**: Reverses compensation actions (e.g., wallet debit to reverse credit)

## Database Schema

### Core Tables

**ledger_adjustments**: Adjustment records
- `id`, `source_type`, `source_id` (bank_statement/payout/invoice)
- `recon_exec_id` (link to B87 rule execution)
- `external_ref` (idempotency key)
- `amount`, `currency`, `adjustment_type`
- `status` (pending, processing, applied, failed, awaiting_approval, reverted)
- `actions` (compensation actions JSON)
- `approval_required`, `approval_count`, `approved_by`

**journal_entries**: Journal entry headers
- `id`, `entry_ref` (idempotency, e.g., ADJ-{adj_id})
- `entry_date`, `posted_at`
- `status` (draft, posted, reversed)
- `source_adjustment_id` (link to adjustment)
- `reversal_of` (link to original if this is reversal)

**journal_lines**: Journal entry details
- `id`, `journal_entry_id`, `line_number`
- `gl_code`, `debit`, `credit`, `currency`
- `fx_rate`, `base_currency_debit`, `base_currency_credit`
- `description`, `entity_type`, `entity_id`

**compensation_actions**: Compensation queue
- `id`, `adjustment_id`, `action_type`
- `params` (JSON), `status`, `attempts`, `max_attempts`
- `external_id` (ID from external system)

**adjustment_reversals**: Reversal tracking
- `id`, `adjustment_id`, `requested_by`
- `status`, `approvers`, `approval_count`
- `reversal_journal_entry_id`

## GL Mapping

Adjustment types map to specific GL codes:

| Adjustment Type | Debit GL | Credit GL |
|----------------|----------|-----------|
| `bank_fee` | `EXP:BANK_FEES` | `LIA:ADJUSTMENTS_PAYABLE` |
| `fx_variance` | `EXP:FX_VARIANCE` | `LIA:ADJUSTMENTS_PAYABLE` |
| `partial_settlement` | `LIA:ADJUSTMENTS_PAYABLE` | `REV:ACCOUNTS_RECEIVABLE` |
| `fee_refund` | `EXP:FEE_REFUNDS` | `LIA:CUSTOMER_REFUNDS` |
| `merchant_credit` | `EXP:MERCHANT_CREDITS` | `LIA:MERCHANT_PAYABLES` |

**Note**: GL codes are configurable via `adjustment_config` table.

## Workflow Examples

### Example 1: Bank Fee Adjustment (Auto-Applied)

```typescript
// B87 rule detected bank fee of $15 withheld
// Creates adjustment:
{
  source_type: 'bank_statement',
  source_id: 'line_uuid',
  recon_exec_id: 'exec_uuid',
  external_ref: 'recon_exec:exec_uuid',
  reason: 'Bank withheld $15 transfer fee',
  currency: 'USD',
  amount: 15.00,
  adjustment_type: 'bank_fee',
  actions: [
    {
      type: 'wallet_credit',
      params: {
        user_id: 'merchant_uuid',
        amount: 15.00,
        currency: 'USD',
        memo: 'Refund for bank fee withheld'
      }
    }
  ]
}

// Adjustments processor:
// 1. Check threshold: $15 < $1000 → auto-approve
// 2. Build journal entry:
//    Debit  EXP:BANK_FEES         $15.00
//    Credit LIA:ADJUSTMENTS_PAYABLE $15.00
// 3. Post journal (status = posted)
// 4. Enqueue compensation: wallet_credit
//
// Compensation worker:
// 1. Execute: call walletService.credit(...)
// 2. Mark action done
// 3. Adjustment status = applied
```

### Example 2: High-Value Adjustment (Requires Approval)

```typescript
// B87 rule detected $50,000 FX variance
{
  amount: 50000.00,
  currency: 'USD',
  adjustment_type: 'fx_variance',
  approval_required: 2 // Need 2 approvals
}

// Processor:
// 1. Check threshold: $50k > $1k → requires approval
// 2. Mark status = 'awaiting_approval'
// 3. Notify Ops

// Ops UI: Two users approve
POST /api/adjustments/:id/approve
{ user_id: 'finance_ops_1', comment: 'Approved' }

POST /api/adjustments/:id/approve
{ user_id: 'finance_ops_2', comment: 'Approved' }

// Processor (next run):
// 1. Check approvals: 2 >= 2 → proceed
// 2. Post journal
// 3. Execute compensations
```

### Example 3: Reversal

```typescript
// Ops discovers error in adjustment
POST /api/adjustments/:id/reverse
{
  user_id: 'ops_user',
  reason: 'Duplicate adjustment - bank fee already refunded'
}

// Creates reversal request (status = requested)
// Requires 2 approvals

// After approvals:
// 1. Create reversal journal entry:
//    Debit  LIA:ADJUSTMENTS_PAYABLE $15.00
//    Credit EXP:BANK_FEES           $15.00
//    (opposite of original)
// 2. Create reversal compensation:
//    wallet_debit to reverse wallet_credit
// 3. Mark original adjustment status = reverted
```

## API Reference

### Create Manual Adjustment
```http
POST /api/adjustments
Content-Type: application/json

{
  "source_type": "manual",
  "external_ref": "manual:ops:20231115:001",
  "reason": "Manual correction for bank error",
  "currency": "EUR",
  "amount": 250.00,
  "adjustment_type": "bank_fee",
  "actions": [
    {
      "type": "wallet_credit",
      "params": {
        "user_id": "merchant_uuid",
        "amount": 250.00,
        "currency": "EUR",
        "memo": "Bank fee refund"
      }
    }
  ]
}
```

### Approve Adjustment
```http
POST /api/adjustments/:id/approve

{
  "user_id": "finance_ops_user",
  "comment": "Verified and approved"
}
```

### Request Reversal
```http
POST /api/adjustments/:id/reverse

{
  "user_id": "ops_user",
  "reason": "Duplicate adjustment"
}
```

### Get Adjustment Details
```http
GET /api/adjustments/:id

Response:
{
  "adjustment": {...},
  "journal_entry": {...},
  "journal_lines": [...],
  "compensation_actions": [...],
  "approvals": [...]
}
```

## Configuration

Configuration stored in `adjustment_config` table:

```sql
-- Auto-apply thresholds by currency
INSERT INTO adjustment_config (key, value)
VALUES ('ops_auto_threshold', '{
  "USD": 1000,
  "EUR": 900,
  "GBP": 800,
  "XOF": 500000
}');

-- Approval quorum
INSERT INTO adjustment_config (key, value)
VALUES ('approval_quorum', '2');

-- Max daily auto-amount
INSERT INTO adjustment_config (key, value)
VALUES ('max_auto_amount_per_day', '{
  "USD": 50000,
  "EUR": 45000
}');
```

## Deployment

### 1. Run Migrations
```bash
psql -d molam_connect -f migrations/001_b88_ledger_adjustments.sql
```

### 2. Start Workers
```bash
# Terminal 1: Adjustments Processor
npm run worker:adjustments

# Terminal 2: Compensation Worker
npm run worker:compensations
```

### 3. Verify
```bash
# Check health
curl http://localhost:3088/health

# Check pending adjustments
curl http://localhost:3088/api/adjustments?status=pending
```

## Monitoring

### Prometheus Metrics
- `adjustments_processed_total` - Total adjustments processed
- `adjustments_applied_total` - Successfully applied
- `adjustments_failed_total` - Failed processing
- `journal_posts_total` - Journal entries posted
- `compensation_success_rate` - Compensation action success rate
- `compensation_failures_total` - Failed compensations

### Alerts
- `compensation_failure_rate > 1%` for 10m → Critical
- `adjustments_awaiting_approval > 50` → Warning
- `journal_imbalance_detected` → Critical

## Security & Compliance

### RBAC
- **View**: `ops_role`
- **Create/Edit**: `recon_ops`, `finance_ops`
- **Approve**: `finance_ops`, `pay_admin`
- **Reverse**: `finance_admin`

### Audit Trail
- All actions logged to `adjustment_audit_logs`
- Immutable journal entries (append-only)
- Approvals tracked with user IDs and timestamps
- Reversal requests logged

### Idempotency
- `external_ref` ensures duplicate prevention
- Journal entry `entry_ref` prevents duplicate posts
- Compensation actions use action ID as idempotency key

## Testing

### Unit Tests
```typescript
// Test GL mapping
test('bank fee maps to correct GL codes', () => {
  const lines = mapAdjustmentToGL({
    adjustment_type: 'bank_fee',
    amount: 15.00,
    currency: 'USD',
    reason: 'Test'
  });

  expect(lines[0].gl_code).toBe('EXP:BANK_FEES');
  expect(lines[0].debit).toBe(15.00);
  expect(lines[1].gl_code).toBe('LIA:ADJUSTMENTS_PAYABLE');
  expect(lines[1].credit).toBe(15.00);
});

// Test balance validation
test('validates balanced entry', () => {
  const lines = [
    { debit: 100, credit: 0 },
    { debit: 0, credit: 100 }
  ];

  const { balanced } = validateGLBalance(lines);
  expect(balanced).toBe(true);
});
```

### Integration Tests
```typescript
test('end-to-end adjustment flow', async () => {
  // Create adjustment
  const adj = await createAdjustment({...});

  // Process
  await processPendingAdjustments();

  // Verify journal posted
  const journal = await getJournalEntry(`ADJ-${adj.id}`);
  expect(journal.status).toBe('posted');

  // Verify compensation queued
  const comps = await getCompensations(adj.id);
  expect(comps.length).toBeGreaterThan(0);

  // Execute compensations
  await processCompensations();

  // Verify all done
  const updatedComps = await getCompensations(adj.id);
  expect(updatedComps.every(c => c.status === 'done')).toBe(true);
});
```

## Troubleshooting

### Journal Entry Not Balanced
```sql
-- Find unbalanced entries
SELECT
  je.id,
  je.entry_ref,
  SUM(jl.debit) as total_debit,
  SUM(jl.credit) as total_credit,
  ABS(SUM(jl.debit) - SUM(jl.credit)) as difference
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.status = 'draft'
GROUP BY je.id
HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01;
```

### Stuck Compensations
```sql
-- Find failed compensations
SELECT * FROM compensation_actions
WHERE status = 'failed'
AND created_at >= NOW() - INTERVAL '24 hours';

-- Retry manually
UPDATE compensation_actions
SET status = 'queued', attempts = 0
WHERE id = 'stuck_action_id';
```

### Adjustment Stuck in Awaiting Approval
```sql
-- Check approval status
SELECT
  id,
  amount,
  currency,
  approval_count,
  approval_required,
  approved_by
FROM ledger_adjustments
WHERE status = 'awaiting_approval';

-- Force approve (emergency only)
UPDATE ledger_adjustments
SET approval_count = approval_required,
    approved_by = ARRAY['emergency_approval']::UUID[]
WHERE id = 'adjustment_id';
```

## Best Practices

1. **Always Use External Ref**: Prevents duplicate adjustments
2. **Test GL Mappings**: Ensure all adjustment types have correct GL codes
3. **Monitor Compensation Failures**: Set up alerts for failed actions
4. **Regular Reconciliation**: Compare journal entries to external GL
5. **Approval Thresholds**: Start conservative, adjust based on false positive rate
6. **Document Reversals**: Always include detailed reason for audit
7. **Multi-Currency**: Always snapshot FX rate at adjustment time
8. **Idempotency**: Use adjustment ID in external API calls

## Support

- **Documentation**: `/docs/adjustments`
- **Slack**: #brique-88-ledger
- **On-call**: treasury-oncall@molam.com

---

**Status**: ✅ **PRODUCTION-READY**
**Integration**: Extends Briques 86 & 87
**Version**: 1.0.0
