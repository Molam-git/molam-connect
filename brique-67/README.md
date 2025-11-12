# Brique 67 — Subscriptions & Recurring Billing

**Status:** ✅ Complete
**Port:** 4067
**Version:** 1.0.0

## Overview

Brique 67 provides an industrial-grade subscription and recurring billing engine for Molam Connect. It supports complex subscription workflows including plan management, metered billing, proration, dunning/retry logic, and seamless integration with payment processing and invoicing systems.

## Features

### 📋 Plan Management
- **Multiple plan types** (fixed, tiered, metered/usage-based)
- **Multi-currency pricing** with FX conversion
- **Billing intervals** (weekly, monthly, annual)
- **Free trials** with configurable duration
- **Merchant-specific pricing** overrides and discounts

### 🔄 Subscription Lifecycle
- **Idempotent subscription creation** (Idempotency-Key required)
- **Status workflow** (active, trialing, past_due, canceled, unpaid)
- **Plan changes** with proration support
- **Immediate or scheduled** plan upgrades/downgrades
- **Graceful cancellation** (immediate or at period end)

### 📊 Metered Billing
- **Usage recording API** for consumption-based pricing
- **Period-based aggregation** of usage metrics
- **Flexible unit pricing** (per-API-call, per-GB, etc.)
- **Automatic usage posting** during invoice generation

### 💰 Billing & Invoicing
- **Automated invoice generation** at period end
- **Integration with Billing module** (B46)
- **Proration calculations** for mid-period changes
- **Tax application** via merchant country rules
- **Multi-line item invoices** (plan + usage + fees)

### 🔁 Dunning & Retry
- **Configurable retry schedule** (1h, 6h, 24h, 72h)
- **Automatic payment retries** with exponential backoff
- **Subscription suspension** after max attempts
- **Payment recovery workflows**
- **Merchant notifications** for failed payments

### 🎯 Analytics & Reporting
- **MRR (Monthly Recurring Revenue)** tracking
- **Churn rate** calculation
- **Subscription health metrics**
- **Revenue by plan** analysis
- **Dunning performance** monitoring

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│          Subscriptions & Recurring Billing Engine            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐      ┌────────────────┐                │
│  │ Plan Catalog   │      │ Subscription   │                │
│  │                │      │ Lifecycle      │                │
│  │ • Plans        │      │                │                │
│  │ • Pricing      │      │ • Create       │                │
│  │ • Trials       │      │ • Change Plan  │                │
│  │ • Merchant     │      │ • Cancel       │                │
│  │   Overrides    │      │ • Renew        │                │
│  └────────────────┘      └────────────────┘                │
│          │                        │                         │
│          ▼                        ▼                         │
│  ┌────────────────────────────────────────┐                │
│  │      Subscription Database             │                │
│  │                                        │                │
│  │  • subscriptions                      │                │
│  │  • usage_records                      │                │
│  │  • subscription_invoices              │                │
│  │  • subscription_dunning               │                │
│  │  • subscription_schedules             │                │
│  │  • subscription_logs                  │                │
│  └────────────────────────────────────────┘                │
│          │                                                  │
│          ▼                                                  │
│  ┌────────────────────────────────────────┐                │
│  │      Billing Worker (Cron)             │                │
│  │                                        │                │
│  │  • Process renewals (every 5 min)     │                │
│  │  • Generate invoices                  │                │
│  │  • Collect payments                   │                │
│  │  • Handle dunning retries             │                │
│  │  • Advance subscription periods       │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables (9 total)

1. **plans** - Global subscription plan catalog
2. **plan_prices** - Multi-currency pricing
3. **merchant_plans** - Merchant-specific overrides
4. **subscriptions** - Active and historical subscriptions
5. **usage_records** - Metered billing usage tracking
6. **subscription_invoices** - Link to billing module invoices
7. **subscription_dunning** - Payment retry and recovery
8. **subscription_logs** - Complete audit trail
9. **subscription_schedules** - Scheduled future changes

### Key Indexes
- `idx_subscriptions_merchant` - Fast merchant lookup
- `idx_subscriptions_period_end` - Find due subscriptions
- `idx_usage_posted` - Unposted usage records
- `idx_dunning_next_retry` - Retry scheduling
- `idx_subscription_schedules_pending` - Pending changes

## API Endpoints

### Subscriptions

#### `POST /api/subscriptions`
Create a new subscription.

**Headers:**
- `Idempotency-Key` (required) - Prevents duplicate subscriptions

**Request:**
```json
{
  "merchant_id": "merchant-123",
  "plan_id": "plan-starter-monthly",
  "customer_id": "customer-456",
  "billing_currency": "USD",
  "payment_method": {
    "type": "card",
    "token": "tok_visa_4242"
  },
  "trial_end": "2025-01-21T00:00:00Z"
}
```

**Response:**
```json
{
  "id": "sub-789",
  "merchant_id": "merchant-123",
  "plan_id": "plan-starter-monthly",
  "status": "trialing",
  "current_period_start": "2025-01-07T10:00:00Z",
  "current_period_end": "2025-02-07T10:00:00Z",
  "trial_end": "2025-01-21T00:00:00Z",
  "billing_currency": "USD"
}
```

#### `GET /api/subscriptions/:id`
Get subscription by ID.

#### `GET /api/subscriptions`
List subscriptions for merchant.

**Query Parameters:**
- `merchant_id` (required)
- `status` (optional) - active | trialing | past_due | canceled | unpaid
- `customer_id` (optional)
- `limit` (optional)
- `offset` (optional)

#### `POST /api/subscriptions/:id/change-plan`
Change subscription plan.

**Request:**
```json
{
  "new_plan_id": "plan-pro-monthly",
  "effective_immediately": true,
  "actor": "merchant-admin"
}
```

**Response (Immediate):**
```json
{
  "subscriptionId": "sub-789",
  "chargeAmount": 70.00,
  "credit": 19.33,
  "immediate": true
}
```

**Response (Scheduled):**
```json
{
  "subscriptionId": "sub-789",
  "scheduled": true,
  "effective_at": "2025-02-07T10:00:00Z"
}
```

#### `POST /api/subscriptions/:id/cancel`
Cancel subscription.

**Request:**
```json
{
  "cancel_at_period_end": true,
  "reason": "User requested cancellation",
  "actor": "merchant-user"
}
```

#### `POST /api/subscriptions/:id/usage`
Record usage for metered billing.

**Request:**
```json
{
  "period_start": "2025-01-01",
  "period_end": "2025-01-31",
  "unit_count": 15000,
  "unit_price": 0.01,
  "description": "API calls for January"
}
```

#### `GET /api/subscriptions/:id/usage`
Get usage records for subscription.

#### `GET /api/subscriptions/:id/invoices`
Get invoices linked to subscription.

#### `GET /api/subscriptions/:id/logs`
Get audit logs for subscription.

#### `GET /api/subscriptions/stats/:merchant_id`
Get subscription statistics for merchant.

**Response:**
```json
{
  "total_subscriptions": 125,
  "active_count": 98,
  "trial_count": 12,
  "past_due_count": 3,
  "canceled_count": 12,
  "mrr_total": 14250.00
}
```

### Plans

#### `GET /api/subscriptions/plans/list`
List all active plans.

#### `GET /api/subscriptions/plans/:id`
Get plan details with multi-currency prices.

## Installation

```bash
cd brique-67
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
PORT=4067
NODE_ENV=development

# Integration URLs
BILLING_API_URL=http://localhost:4046/api
TREASURY_API_URL=http://localhost:4034/api

# Worker Configuration
WORKER_ENABLED=true
WORKER_BILLING_INTERVAL_MS=300000
WORKER_DUNNING_INTERVAL_MS=900000
```

## Usage

### 1. Apply Database Migration

```bash
psql -U postgres -d molam_connect -f migrations/067_subscriptions.sql
```

### 2. Start API Server

```bash
npm run dev
```

Server runs on http://localhost:4067

### 3. Start Billing Worker

```bash
npm run worker
```

### 4. Test API

```bash
# Health check
curl http://localhost:4067/api/health

# List plans
curl http://localhost:4067/api/subscriptions/plans/list

# Create subscription
curl -X POST http://localhost:4067/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "merchant_id": "merchant-test",
    "plan_id": "PLAN_ID_FROM_LIST"
  }'

# Get subscription
curl http://localhost:4067/api/subscriptions/SUBSCRIPTION_ID

# Record usage (for metered plans)
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/usage \
  -H "Content-Type: application/json" \
  -d '{
    "period_start": "2025-01-01",
    "period_end": "2025-01-31",
    "unit_count": 1000
  }'

# Change plan
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/change-plan \
  -H "Content-Type: application/json" \
  -d '{
    "new_plan_id": "PLAN_ID",
    "effective_immediately": false
  }'

# Cancel subscription
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": true,
    "reason": "test"
  }'
```

## Subscription Workflow

### Standard Monthly Subscription

```
1. Create Subscription (with trial)
   ↓
   Status: trialing
   Trial: 14 days
   ↓
2. Trial Ends
   ↓
   Status: active
   First invoice generated
   ↓
3. Payment Collection Attempted
   ↓
   If SUCCESS:
   • Status remains active
   • Period advances to next month

   If FAIL:
   • Dunning initiated
   • Status → past_due
   • Retry schedule: 1h, 6h, 24h, 72h
   ↓
4. After Max Retries (if still failing)
   ↓
   Status: unpaid
   Subscription suspended
```

### Plan Change with Proration

```
Current Plan: Starter ($29/month)
Period: Jan 1 - Jan 31
Change Date: Jan 15 (halfway through)

Calculation:
• Remaining days: 16 days
• Credit: $29 * (16/31) = $15.48

New Plan: Pro ($99/month)
• Prorated charge: $99 - $15.48 = $83.52

Result:
• Charge: $83.52 immediately
• New period starts: Jan 15 - Feb 15
• Next invoice: Feb 15 ($99)
```

## Metered Billing Example

### API Usage Plan

**Setup:**
```json
{
  "plan": {
    "name": "API Usage",
    "base_amount": 0,
    "is_metered": true,
    "billing_interval": "monthly"
  },
  "pricing": {
    "per_api_call": 0.01
  }
}
```

**Record Usage:**
```bash
# Day 1-10: 5000 API calls
curl -X POST .../usage -d '{"unit_count": 5000}'

# Day 11-20: 8000 API calls
curl -X POST .../usage -d '{"unit_count": 8000}'

# Day 21-31: 3000 API calls
curl -X POST .../usage -d '{"unit_count": 3000}'
```

**Invoice at Month End:**
```
Base Plan:       $0.00
Usage (16,000 calls × $0.01): $160.00
Total:           $160.00
```

## Dunning & Retry

### Default Retry Schedule

| Attempt | Delay   | Cumulative Time |
|---------|---------|-----------------|
| 1st     | 1 hour  | 1 hour          |
| 2nd     | 6 hours | 7 hours         |
| 3rd     | 24 hours| 31 hours        |
| 4th     | 72 hours| 103 hours       |

After 4th attempt: Subscription → `unpaid` status

### Dunning States

- **ok** - No payment issues
- **retrying** - Active retry attempts
- **suspended** - Max attempts reached, subscription suspended
- **cancelled** - Subscription cancelled due to non-payment

## React UI

### SubscriptionPortal

```tsx
import SubscriptionPortal from './web/SubscriptionPortal';

function App() {
  return <SubscriptionPortal />;
}
```

**Features:**
- Browse available plans
- View trial information
- Create new subscriptions
- Manage active subscriptions
- Change plans
- Cancel subscriptions
- View billing periods

## Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- subscriptions.test.ts

# Run with coverage
npm test -- --coverage
```

## Operational Runbook

See [subscriptions_runbook.md](docs/subscriptions_runbook.md) for:
- Emergency procedures
- Common operations
- Monitoring queries
- Troubleshooting
- Dunning management
- Reporting
- Security

## Integration Points

### With Billing (B46)
```typescript
// Generate invoice for subscription
const invoice = await generateInvoiceForSubscription(subscription, usageRecords);

// Invoice includes:
// - Plan subscription fee
// - Metered usage charges
// - Proration credits/charges
// - Tax calculations
```

### With Treasury (B34)
```typescript
// Attempt payment collection
const result = await attemptCollection(subscription, invoice);

// Treasury handles:
// - Card charging
// - Wallet debits
// - Bank transfers
// - Settlement flows
```

### With Webhooks
Events published:
- `subscription.created`
- `subscription.invoice_generated`
- `subscription.renewed`
- `subscription.plan_changed`
- `subscription.canceled`
- `subscription.payment_retry_scheduled`
- `subscription.suspended`
- `subscription.payment_recovered`

## Key Files

```
brique-67/
├── migrations/
│   └── 067_subscriptions.sql          # Database schema (9 tables)
├── src/
│   ├── utils/
│   │   └── db.ts                       # PostgreSQL connection
│   ├── subscriptions/
│   │   ├── service.ts                  # Core subscription logic
│   │   ├── routes.ts                   # API endpoints
│   │   └── cron.ts                     # Billing worker
│   └── server.ts                       # Express server
├── tests/
│   └── subscriptions.test.ts           # Unit tests
├── web/
│   └── SubscriptionPortal.tsx          # React UI
├── docs/
│   └── subscriptions_runbook.md        # Operations guide
└── README.md
```

## Monitoring

### Key Metrics

1. **MRR (Monthly Recurring Revenue)**
   - Target: Consistent growth
   - Alert: Month-over-month decrease

2. **Churn Rate**
   - Target: < 5% monthly
   - Alert: > 7%

3. **Payment Success Rate**
   - Target: > 95%
   - Alert: < 90%

4. **Dunning Recovery Rate**
   - Target: > 80%
   - Alert: < 70%

5. **Trial Conversion Rate**
   - Target: > 40%
   - Alert: < 25%

## Next Steps

- [ ] Add comprehensive unit tests
- [ ] Integrate with real payment gateways
- [ ] Implement webhook delivery system
- [ ] Add advanced proration rules
- [ ] Support seat-based billing
- [ ] Add subscription pausing/resuming
- [ ] Implement coupon/discount codes
- [ ] Multi-plan subscriptions
- [ ] Usage alerts and limits
- [ ] Prometheus metrics
- [ ] Grafana dashboards

## License

MIT