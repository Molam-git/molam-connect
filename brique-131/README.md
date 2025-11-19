# Brique 131 — Commissions Engine

## Overview
Industrial-grade fee calculation and commission management system for Molam Wallet and Molam Connect with precision arithmetic, flexible rules, SIRA integration, and complete audit trails.

## Features
- **Unified Pricing**: Single engine for Wallet (P2P, cash-in/out) and Connect (merchant payments)
- **Precision Math**: Decimal.js for accurate currency calculations (no float errors)
- **Flexible Rules**: Percent + fixed, min/max caps, country/currency filters, priority-based
- **Merchant Overrides**: Custom pricing per merchant/agent/user
- **Agent Revenue Share**: Configurable commission splits
- **Idempotent**: Same transaction always produces identical fees
- **Audit Trail**: Immutable fee_lines with ledger integration
- **Ops Dashboard**: Real-time rule editor with fee simulator
- **SIRA Integration**: AI-driven risk-based pricing suggestions
- **RBAC Protected**: Molam ID with `finance_ops`, `pay_admin` roles

## Business Rules (Target: ~10% cheaper than Stripe)

**Wallet Fees:**
- P2P in-app: 0.90% (sender pays)
- Cash-in (self): Free
- Cash-in (agent-assisted): 0.50% (configurable)
- Cash-out: Free for receiver (sender pays if configured)
- FX conversion: 0.50% (vs Stripe 2%)
- Bill payment: Free
- Topup: Free

**Connect Fees:**
- Merchant payment: 2.25% + $0.23 (vs Stripe ~2.9% + $0.30)
- Instant payout: 1.00% + $0.50
- Agent share: Configurable (default 30% of fee)

## Database Tables

### fee_rules
Fee policy definitions (editable by Ops)
- `module` - 'wallet' or 'connect'
- `event_type` - 'p2p', 'merchant_payment', 'fx', etc.
- `percent` - Fee percentage (e.g., 0.009 for 0.9%)
- `fixed_amount` - Fixed fee component
- `min_amount` / `max_amount` - Fee caps
- `agent_share_percent` - Portion to agent (0-1)
- `priority` - Higher = precedence
- `valid_from` / `valid_until` - Time-based rules (promotions)

### fee_lines
Immutable fee records per transaction
- `transaction_id` - Link to payment/wallet txn
- `rule_id` - Applied fee rule
- `amount` - Total fee charged
- `split_agent_amount` - Agent portion
- `split_molam_amount` - Molam revenue
- `ledger_entry_id` - Double-entry ledger reference

### fee_rates_history
Audit log of rule changes
- `rule_id` - Changed rule
- `old_percent` / `new_percent`
- `old_fixed` / `new_fixed`
- `reason` - Change justification

### fee_overrides
Merchant/agent-specific pricing
- `target_type` - 'merchant', 'agent', 'user'
- `target_id` - Entity UUID
- `override_percent` / `override_fixed` - Custom rates
- `valid_from` / `valid_until` - Promotion periods

## API Endpoints

### POST /api/commissions/calc
Calculate fees for transaction (simulation).
```json
{
  "transaction_id": "uuid",
  "module": "wallet",
  "event_type": "p2p",
  "amount": "100.00",
  "currency": "XOF",
  "sender_id": "uuid",
  "receiver_id": "uuid"
}
```

**Response:**
```json
{
  "transaction_id": "uuid",
  "amount": "100.00",
  "currency": "XOF",
  "total_fee": "0.90",
  "breakdown": [{
    "rule_id": "uuid",
    "name": "Global P2P Fee",
    "fee": "0.90",
    "percent": "0.009000",
    "fixed": "0.00",
    "agent_share": "0.00",
    "molam_share": "0.90"
  }]
}
```

### POST /api/commissions/apply
Apply fees and create ledger entries (idempotent).

### POST /api/commissions/reverse
Reverse fees for chargebacks.

### POST /api/commissions/simulate
Bulk fee simulation for pricing pages.

### GET /api/commissions/rules
List fee rules (with filters).

### POST /api/commissions/rules
Create new fee rule (Ops).

### PUT /api/commissions/rules/:id
Update fee rule (records history).

### GET /api/commissions/overrides
List merchant/agent overrides.

### POST /api/commissions/overrides
Create custom pricing override.

### GET /api/commissions/lines
Audit fee lines.

### GET /api/commissions/stats
Fee revenue statistics.

## Fee Calculation Algorithm

**Precision Rounding:**
- Uses Decimal.js with HALF_EVEN rounding
- All amounts to 2 decimal places

**Rule Selection:**
1. Query active rules matching module + event_type
2. Filter by country/currency if specified
3. Check valid_from/valid_until for time-based rules
4. Order by priority DESC
5. Apply overrides (merchant-specific pricing)

**Fee Computation:**
```
fee = (amount * percent) + fixed_amount
fee = max(fee, min_amount) if min_amount set
fee = min(fee, max_amount) if max_amount set
fee = round(fee, 2, HALF_EVEN)

agent_share = fee * agent_share_percent
molam_share = fee - agent_share
```

## Ledger Integration

**Fee Application Creates:**
1. Debit: `receivables:fees:{currency}` (fee amount)
2. Credit: `revenue:molam:{currency}` (Molam share)
3. Credit: `payable:agent:{agent_id}:{currency}` (agent share)

**Fee Reversal Creates:**
- Reverse entries (negative amounts)
- Links to original transaction
- Records reason (chargeback, dispute)

## Ops Dashboard

**FeeRulesEditor.tsx Features:**
- CRUD fee rules
- Fee simulator (calculate before creating transaction)
- Bulk rule activation/deactivation
- History viewer
- Override management
- Real-time validation

**Simulator:**
- Input: module, event_type, amount, currency
- Output: Breakdown with all applicable rules
- Used by sales team for pricing quotes

## SIRA Integration

**Risk-Based Pricing:**
- SIRA analyzes transaction risk score
- Suggests dynamic fee adjustments
- Ops can enable auto-apply or manual review

**Routing Optimization:**
- SIRA recommends cheapest rail/bank
- Commission engine applies routing-specific fees
- Learns from cost + success rate data

**Anomaly Detection:**
- High chargeback merchants → increase fees
- Fraud patterns → dynamic risk premium
- Volume discounts → automatic tier pricing

## Multi-Currency & FX

**Currency Conversion:**
- Fee calculated in transaction currency
- FX conversion via separate `fx` event_type rule
- Billing currency conversion for invoices
- Records both source and billing amounts

**FX Spread:**
- Default: 0.50% (target vs Stripe 2%)
- SIRA can route via bank or internal float swap
- Transparent FX rate + fee disclosure

## Security & Compliance

**Access Control:**
- `finance_ops` - Read rules, view fees, simulate
- `pay_admin` - Full CRUD on rules and overrides
- All mutations logged in `fee_rates_history`

**Audit Trail:**
- `fee_lines` are append-only (no updates)
- Reversals create negative entries
- Linked to ledger for accounting integrity

**Data Protection:**
- Sensitive rule metadata encrypted in Vault
- PII excluded from fee logs

## Observability

**Prometheus Metrics:**
- `molam_fee_revenue_total{module, currency}` - Counter
- `molam_fee_calc_latency_seconds` - Histogram
- `molam_fee_apply_errors_total` - Counter
- `molam_avg_fee_percent{module, event_type}` - Gauge

**SLOs:**
- Fee calculation P50 <3ms (cached rules)
- Fee calculation P95 <30ms
- Apply endpoint P95 <150ms (DB + ledger)
- Error rate <0.01%

## Testing

**Unit Tests:**
- P2P 0.9% fee calculation
- Merchant payment 2.25% + $0.23
- Agent share split accuracy
- Override precedence
- Min/max cap enforcement
- Rounding precision (HALF_EVEN)
- Idempotency verification

**Run Tests:**
```bash
npm test tests/commissions.test.ts
```

## Operational Playbooks

### Change Fee Rates
1. Ops creates new rule version
2. System records in `fee_rates_history`
3. Active rules take effect immediately
4. Use `valid_from` for scheduled changes

### Create Promotion
1. Create override for merchant(s)
2. Set `valid_until` for auto-expiry
3. System reverts to default after expiry

### Handle Dispute/Chargeback
1. Call `POST /api/commissions/reverse`
2. Creates negative fee_lines
3. Reverses ledger entries
4. Creates credit_note in billing
5. Emits `fee.reversed` webhook

### Volume Discounts
1. Create tier-based rules with priority
2. Use metadata.volume_tier for tracking
3. SIRA can auto-suggest tier upgrades

## Rollout Strategy

**Phase 1 - Shadow Mode:**
- Deploy schema and services
- Seed default rules (P2P 0.9%, merchant 2.25%+$0.23)
- Run calculations in parallel (don't apply)
- Compare with current fee logic
- Duration: 48-72 hours

**Phase 2 - Gradual Rollout:**
- Enable for new transactions only
- Feature flag per module (wallet, connect)
- Monitor revenue + disputes
- Circuit breaker on errors

**Phase 3 - Full Production:**
- Migrate historical fee rules
- Decommission legacy fee code
- Enable SIRA suggestions
- Train Ops team on dashboard

## Integration Points
- **Checkout/Payments** - Call `/calc` before authorization, `/apply` on success
- **Wallet Service** - Integrate fee calculation in transaction flow
- **Ledger** - Double-entry fee postings
- **Billing (Brique 46)** - Link fee_lines to invoice_lines
- **SIRA** - Risk-based pricing suggestions
- **Webhook Engine** - Emit `fee.calculated`, `fee.charged`, `fee.reversed`

## Example: Default Rules

```sql
-- P2P Wallet
INSERT INTO fee_rules(name, module, event_type, percent, priority)
VALUES ('Global P2P Fee', 'wallet', 'p2p', 0.0090, 100);

-- Merchant Payment (USD)
INSERT INTO fee_rules(name, module, event_type, percent, fixed_amount, currency, priority)
VALUES ('US Merchant Fee', 'connect', 'merchant_payment', 0.0225, 0.23, 'USD', 100);

-- FX Conversion
INSERT INTO fee_rules(name, module, event_type, percent, priority)
VALUES ('FX Spread', 'wallet', 'fx', 0.0050, 100);

-- Instant Payout
INSERT INTO fee_rules(name, module, event_type, percent, fixed_amount, priority)
VALUES ('Instant Payout', 'connect', 'payout_instant', 0.0100, 0.50, 100);
```

## Version
**1.0.0** | Status: ✅ Ready for Production
