# Sous-Brique 126-1 — Marketplace Bulk Payouts & Revenue-Sharing

## Overview
Industrial-grade marketplace payout engine with revenue splitting, bulk processing, netting, and SIRA-optimized routing for multi-seller platforms.

## Features
- **Revenue Splitting**: Configurable split rules (percent, fixed, hybrid)
- **Bulk Batches**: Aggregate payouts with netting and optimization
- **KYC Validation**: Automatic hold for unverified sellers
- **Minimum Thresholds**: Carry forward balances below threshold
- **Schedule Types**: Immediate, daily, weekly batches
- **Idempotency**: Duplicate protection via external request ID
- **Double-Entry Ledger**: Full accounting integration
- **Audit Trail**: Immutable snapshots of all batches

## Database Tables
- `marketplace_split_rules` - Revenue sharing configuration
- `marketplace_payout_batches` - Batch records
- `marketplace_payout_lines` - Individual seller payouts
- `marketplace_seller_balances` - Available balances per seller
- `sellers` - Seller profiles with KYC status
- `marketplace_payout_audit` - Batch snapshots

## API Endpoints

### POST /api/marketplace/:id/batches
Create new payout batch.
```json
{
  "scheduleType": "immediate",
  "currency": "USD",
  "externalRequestId": "optional-idempotency-key"
}
```

### GET /api/marketplace/:id/batches
List all batches for marketplace.

### GET /api/marketplace/:id/batches/:batchId
Get batch details with payout lines.

### GET /api/marketplace/:id/sellers/:sellerId/balance
Get seller available balance.

## Revenue Split Configuration

Example split rule (90% seller, 10% marketplace):
```json
{
  "type": "percent",
  "parts": [
    { "to": "seller", "pct": 90 },
    { "to": "marketplace", "pct": 10 }
  ]
}
```

Hybrid split (fixed + percent):
```json
{
  "type": "hybrid",
  "parts": [
    { "to": "marketplace", "fixed": 0.50 },
    { "to": "seller", "pct": 95 }
  ]
}
```

## Batch Processing Worker

Runs every 10 seconds:
```bash
node src/workers/batch-processor.ts
```

Processing flow:
1. Fetch queued batches
2. Validate seller KYC
3. Check treasury accounts
4. Create settlement instructions
5. Record ledger entries
6. Send webhooks

## Webhooks
- `payout_batch.queued` - Batch created and queued
- `payout_batch.completed` - All lines processed
- `payout_line.sent` - Individual payout sent
- `payout_line.skipped` - Skipped (KYC/threshold)

## Ledger Integration

Double-entry accounting:
- **Debit**: marketplace_liabilities (reduce liability to seller)
- **Credit**: bank_settlement_pending (reserve for settlement)

On settlement confirmation:
- **Debit**: bank_settlement_pending
- **Credit**: bank_cash

## Security & Compliance
- KYC enforcement before payout
- Automatic holds for unverified sellers
- Multi-sig approval support (planned)
- Immutable audit snapshots
- AML threshold checks

## UI Components
- `MarketplacePayouts.tsx` - Admin dashboard
- Batch creation controls
- Real-time status tracking
- Detailed line-by-line breakdown

## Integration Points
- **Brique 121** - Bank connectors for settlement
- **Brique 126** - Settlement instructions
- **Treasury** - Account routing
- **Ledger** - Double-entry bookkeeping
- **SIRA** - Routing optimization (planned)

**Version**: 1.0.0 | **Status**: ✅ Ready
