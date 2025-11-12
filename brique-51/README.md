# Brique 51 - Refunds & Reversals Engine

Centralized refunds and reversals engine for all payment flows across Molam ecosystem.

## Features

- **Refunds vs Reversals**:
  - Reversal = immediate cancellation before capture/settlement
  - Refund = return funds after capture/settlement

- **Multi-Initiator Support**: Merchant, customer, ops, system
- **SIRA Fraud Detection**: ML-based scoring for refund requests
- **Approval Workflows**: Multi-signature approval for high-value refunds
- **Idempotency**: Guaranteed idempotent operations via idempotency keys
- **Multi-Connector**: Card gateway, wallet, bank transfer
- **Ledger Integration**: Double-entry accounting with holds and reversals
- **Event Sourcing**: Immutable audit trail
- **Fee Management**: Configurable refund fee policies
- **Dispute Resolution**: Customer dispute tracking and resolution

## Architecture

```
Refund Request → SIRA Scoring → Policy Check → Approval (if needed)
                                      ↓
                              Queue Processing
                                      ↓
                         Connector (Card/Wallet/Bank)
                                      ↓
                         Ledger Finalization → Webhooks
```

## Database Schema (5 Tables)

1. **refunds** - Core refunds and reversals tracking
2. **refund_approvals** - Multi-signature approval workflow
3. **refund_events** - Immutable audit trail
4. **refund_disputes** - Customer dispute resolution
5. **refund_policies** - Merchant-specific refund policies

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## Database Migration

```bash
psql -U molam -d molam_refunds -f migrations/051_refunds_reversals.sql
```

## Usage

### Start Server

```bash
npm run dev    # Development
npm run build  # Production build
npm start      # Production server
```

## API Endpoints

### Create Refund (Merchant)

```bash
POST /api/refunds
Authorization: Bearer <jwt>

{
  "paymentId": "uuid",
  "originModule": "connect",
  "type": "refund",
  "amount": 100.00,
  "currency": "USD",
  "reason": "Customer requested",
  "refundMethod": "to_card",
  "idempotencyKey": "unique-key"
}
```

### Create Refund (Customer)

```bash
POST /api/customer/refund
Authorization: Bearer <jwt>

{
  "paymentId": "uuid",
  "amount": 50.00,
  "currency": "USD",
  "reason": "Product not as described"
}
```

### List Refunds

```bash
GET /api/refunds?status=processing
Authorization: Bearer <jwt>
```

### Ops: List Pending Approvals

```bash
GET /api/ops/refunds/pending
Authorization: Bearer <jwt>
```

### Ops: Approve Refund

```bash
POST /api/ops/refunds/:id/approve
Authorization: Bearer <jwt>

{
  "note": "Approved by ops team"
}
```

### Ops: Reject Refund

```bash
POST /api/ops/refunds/:id/reject
Authorization: Bearer <jwt>

{
  "note": "Fraudulent request"
}
```

## Connectors

### Card Connector

Direct integration with card payment gateway for refunds and reversals.

**Supports**: Reversal (void before settlement), Refund (after settlement)

### Wallet Connector

Integration with Molam Wallet for instant refunds.

**Supports**: Refund (credits customer wallet or agent)

### Bank Connector

Integration with treasury for bank transfer refunds.

**Supports**: Refund (creates payout)

## SIRA Integration

ML-based fraud detection for refund requests:

- **Score < 0.4**: Auto-approve
- **Score 0.4-0.7**: Warning, ops review recommended
- **Score > 0.7**: Block, require manual approval

## Refund Policies

Merchant-specific policies control:

- Max refund age (default: 180 days)
- Auto-approve threshold (default: $1,000)
- Manual approval threshold (default: $10,000)
- Reversal window (default: 30 minutes)
- SIRA manual review threshold (default: 0.7)
- Refund fee policy (merchant_pays, customer_pays, shared)

## Ledger Integration

Double-entry accounting integration:

1. **Create Hold**: Reserve funds for pending refund
2. **Finalize**: Create final ledger entries when refund succeeds
3. **Reverse**: Nullify original transaction entries for reversals
4. **Release**: Release holds when refund completes

## Event System

Webhook events published:

- `refund.created`
- `refund.processing`
- `refund.succeeded`
- `refund.failed`
- `refund.reversed`
- `refund.requires_approval`
- `refund.approved`
- `refund.rejected`

## Monitoring

Prometheus metrics:

- `b51_refunds_created_total` - Total refunds created
- `b51_refunds_succeeded_total` - Total refunds succeeded
- `b51_refunds_failed_total` - Total refunds failed
- `b51_refund_processing_latency_seconds` - Processing latency

## Testing

```bash
npm test
```

## Security

- **JWT Authentication**: RS256 tokens from Molam ID
- **RBAC**: Role-based access control
- **Rate Limiting**: 100 requests per minute
- **Idempotency**: Prevents duplicate refunds
- **Audit Trail**: Immutable event log

## Support

Contact: treasury-ops@molam.com
