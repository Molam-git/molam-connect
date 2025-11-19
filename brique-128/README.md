# Brique 128 — Settlement Engine Scaling & Atomic Settlement

## Overview
Robust, distributed, and idempotent settlement engine for processing payment instructions across multiple banking rails with atomic guarantees and horizontal scaling.

## Features
- **Atomic Processing**: No double execution with transaction guarantees
- **Idempotency**: Replay protection via idempotency keys
- **Multi-Rail Support**: REST, SEPA, SWIFT, ACH, RTGS, ISO20022, MT940, local
- **Batch Processing**: Bulk settlement with partial completion tracking
- **Retry Logic**: Configurable retry limits with exponential backoff
- **Ledger Integration**: Double-entry bookkeeping on confirmation
- **Audit Trail**: Immutable settlement logs
- **Horizontal Scaling**: Stateless workers for parallel processing

## Database Tables
- `settlement_instructions` - Atomic work units with status tracking
- `settlement_logs` - Immutable audit trail
- `settlement_batches` - Bulk processing coordination

## Instruction Lifecycle

```
pending → sent → confirmed ✓
   ↓        ↓
 failed ←  failed (retry if retries < max)
   ↓
rerouted (via failover)
```

## Atomic Guarantees

1. **Idempotency**: Same idempotency_key → same instruction (no duplicates)
2. **Locking**: `FOR UPDATE` prevents concurrent processing
3. **Transaction Safety**: All DB updates in single transaction
4. **Ledger Sync**: Double-entry only after bank confirmation

## API Endpoints

### GET /api/treasury/settlement
List settlement instructions.
```bash
curl "/api/treasury/settlement?limit=50&status=pending"
```

### GET /api/treasury/settlement/:id
Get instruction details with logs.

### POST /api/treasury/settlement
Create new settlement instruction.
```json
{
  "payout_id": "uuid",
  "bank_profile_id": "uuid",
  "amount": 1000,
  "currency": "USD",
  "rail": "SWIFT",
  "idempotency_key": "unique-key"
}
```

### POST /api/treasury/settlement/:id/retry
Retry failed instruction.

### POST /api/treasury/settlement/:id/process
Process instruction immediately (manual trigger).

### GET /api/treasury/settlement/stats
Get 24h statistics (pending, sent, confirmed, failed, avg_time).

## Settlement Worker

Processes pending instructions in batches:
```bash
node src/workers/settlement-worker.ts
```

**Configuration:**
- `BATCH_SIZE`: 50 instructions per cycle
- `POLL_INTERVAL_MS`: 5000ms (5 seconds)
- `MAX_RETRIES`: 5 attempts before permanent failure

**Flow:**
1. Fetch pending/failed instructions (retries < max)
2. Lock instruction with `FOR UPDATE`
3. Mark as 'sent', increment retries
4. Call bank connector
5. On success: mark 'confirmed', update ledger
6. On failure: mark 'failed', log error

## Batch Processing

Create batch:
```sql
INSERT INTO settlement_batches(batch_ref, total_instructions)
VALUES ('BATCH-2025-01-18', 100);
```

Link instructions:
```sql
UPDATE settlement_instructions
SET batch_id = 'batch-uuid'
WHERE id IN (...);
```

Process batch:
```typescript
await processBatch('batch-uuid');
```

## Retry Strategy

- **Max Retries**: 5 (configurable per instruction)
- **Backoff**: Handled by worker polling interval
- **Stuck Detection**: Instructions sent > 10min without confirmation → reset to pending

## Ledger Integration

On confirmation, create double-entry:
```
Debit:  bank_settlement_pending  (amount)
Credit: bank_cash                (amount)
```

Reference: `settlement_instruction_id`

## Monitoring & Metrics

**Prometheus Metrics:**
- `settlement_confirmed_count` - Total confirmations
- `settlement_failed_count` - Total failures
- `settlement_retry_count` - Total retries
- `avg_settlement_latency` - Average time from created to confirmed

**Alerts:**
- Failure rate > 0.5%
- Avg latency > SLA threshold
- Stuck instructions > 10

## Security & Compliance
- Transaction-level locking prevents race conditions
- Immutable audit logs (settlement_logs)
- Bank credentials in Vault
- mTLS for bank connectors
- RBAC for manual operations

## Horizontal Scaling

Workers are stateless and can run in parallel:
```bash
# Run multiple workers
docker-compose scale settlement-worker=5
```

Instructions are locked at row level, preventing double processing.

## Error Handling

**Transient Errors** (retry):
- Network timeout
- Bank API unavailable (503)
- Rate limit exceeded (429)

**Permanent Errors** (no retry):
- Invalid instruction (400)
- Insufficient funds
- Compliance violation

## Integration Points
- **Brique 121** - Bank Connectors
- **Brique 126** - Payout creation
- **Brique 127** - Bank routing decisions
- **Ledger** - Double-entry accounting

## UI Component

`SettlementUI.tsx` - Real-time dashboard showing:
- Live statistics (pending, sent, confirmed, failed)
- Instruction table with filters
- Retry controls
- Auto-refresh every 5 seconds

**Version**: 1.0.0 | **Status**: ✅ Ready
