# Brique 126 — Payouts & Settlement Engine

## Overview
Centralizes merchant payout processing and interbank settlements with automatic treasury integration, double-entry ledger, and real-time webhooks.

## Features
- Multi-method payouts: instant, batch, priority
- Automatic balance validation and debit
- Settlement orchestration via treasury accounts
- Bank connector integration (Brique 121)
- SLA tracking per bank/rail
- Webhook events: `payout.created`, `payout.sent`, `payout.settled`, `payout.failed`
- Double-entry ledger integration

## Database Tables
- `payouts` - Payout requests with status tracking
- `settlement_instructions` - Bank settlement records
- `settlement_sla` - SLA performance metrics

## API Endpoints

### POST /api/payouts
Request a new payout.
```json
{
  "amount": 1000,
  "currency": "USD",
  "method": "instant",
  "destinationId": "treasury-account-uuid",
  "metadata": {}
}
```

### GET /api/payouts
List merchant payouts (most recent first).

### GET /api/payouts/:id
Get payout details by ID.

## Settlement Worker

Processes pending payouts every 5 seconds:
```bash
node src/workers/settlement-worker.ts
```

Priority order:
1. instant
2. priority
3. batch

## Webhooks

- `payout.created` - Payout request received
- `payout.sent` - Sent to bank
- `payout.settled` - Confirmed by bank
- `payout.failed` - Processing failed (balance refunded)

## Integration

- **Brique 121** - Bank Connectors for settlement
- **Brique 119** - Treasury accounts for destinations
- **Brique 46** - Fee netting (planned)
- **Ledger** - Double-entry bookkeeping

## UI Component

`PayoutsPortal.tsx` - Merchant dashboard for payout requests and tracking.

**Version**: 1.0.0 | **Status**: ✅ Ready
