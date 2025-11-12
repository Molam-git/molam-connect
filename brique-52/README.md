# Brique 52 - Subscriptions & Recurring Payments Engine

Industrial-grade subscription management system with recurring billing, trial periods, proration, dunning, and multi-payment method support.

## Features

### Core Subscription Management
- **Flexible Plans**: Monthly, weekly, annual, or custom billing intervals
- **Trial Periods**: Configurable trial periods with automatic conversion
- **Multi-Plan Subscriptions**: Support multiple plans per subscription
- **Proration**: Automatic proration for plan changes (credit or immediate invoice)
- **Lifecycle Management**: Create, change, cancel, reactivate subscriptions

### Payment Processing
- **Multi-Payment Methods**: Card (3DS), SEPA Direct Debit, ACH, Bank Transfer, Wallet
- **Tokenized Vault**: PCI-compliant payment method storage with AES-256-GCM encryption
- **Automatic Billing**: Scheduled invoice generation and collection
- **Failed Payment Handling**: Configurable dunning policies with retry schedules

### Integrations
- **B46 Billing**: Invoice generation and PDF creation
- **B45 Webhooks**: Event notifications (subscription.*, invoice.*)
- **B34/35 Treasury**: Ledger integration and payouts
- **SIRA Fraud Detection**: Risk scoring before payment attempts
- **Molam ID**: JWT authentication and RBAC

### Analytics & Metrics
- **MRR Tracking**: Monthly Recurring Revenue calculations
- **Churn Monitoring**: Subscription cancellation analytics
- **Customer LTV**: Lifetime value metrics
- **Dunning Success Rate**: Failed payment recovery tracking

## Architecture

```
brique-52/
├── migrations/
│   └── 052_subscriptions.sql         # 7 tables
├── src/
│   ├── utils/
│   │   ├── db.ts                     # PostgreSQL connection
│   │   └── authz.ts                  # JWT authentication + RBAC
│   ├── services/
│   │   ├── subscriptionService.ts    # Core subscription logic
│   │   ├── paymentMethodService.ts   # Payment vault management
│   │   └── sira.ts                   # SIRA integration
│   ├── billing/
│   │   └── integrations.ts           # B46 Billing integration
│   ├── webhooks/
│   │   └── publisher.ts              # B45 event publishing
│   ├── workers/
│   │   ├── jobQueue.ts               # In-memory job queue
│   │   ├── subscriptionWorker.ts     # Invoice generation & collection
│   │   └── dunningWorker.ts          # Failed payment retries
│   ├── routes/
│   │   ├── subscriptionRoutes.ts     # Subscription API
│   │   ├── paymentMethodRoutes.ts    # Payment methods API
│   │   └── planRoutes.ts             # Plan management API
│   └── server.ts                     # Express server
└── web/
    └── src/
        ├── MerchantSubscriptions.tsx # Merchant dashboard
        └── OpsSubscriptionDashboard.tsx # Ops analytics

Port: 8052
Database: molam_subscriptions
```

## Database Schema

### Tables (7)

1. **plans** - Subscription plan offerings
2. **subscriptions** - Customer subscriptions with billing periods
3. **subscription_items** - Line items (supports multi-plan)
4. **payment_methods** - Tokenized payment methods vault
5. **subscription_invoices** - Links to B46 billing invoices
6. **dunning_policies** - Failed payment retry policies
7. **subscription_events** - Immutable audit log

## API Endpoints

### Subscriptions

```
POST   /api/subscriptions                      # Create subscription
GET    /api/subscriptions/:id                  # Get subscription
POST   /api/subscriptions/:id/change_plan      # Change plan
POST   /api/subscriptions/:id/cancel           # Cancel subscription
POST   /api/subscriptions/:id/reactivate       # Reactivate
GET    /api/merchant/:id/subscriptions         # List by merchant
```

### Payment Methods

```
POST   /api/payment_methods                    # Create payment method
GET    /api/payment_methods/:id                # Get payment method
GET    /api/customers/:id/payment_methods      # List by customer
DELETE /api/payment_methods/:id                # Delete payment method
```

### Plans

```
POST   /api/plans                              # Create plan
GET    /api/plans/:id                          # Get plan
GET    /api/merchant/:id/plans                 # List merchant plans
PATCH  /api/plans/:id                          # Update plan
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Create Database

```bash
createdb molam_subscriptions
```

### 4. Run Migrations

```bash
npm run migrate
# or
psql molam_subscriptions < migrations/052_subscriptions.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on **http://localhost:8052**

### 6. Start Workers (separate terminals)

```bash
# Terminal 2 - Subscription billing worker
npm run worker:billing

# Terminal 3 - Dunning worker
npm run worker:dunning
```

## Example Flows

### Create Subscription with Trial

```bash
curl -X POST http://localhost:8052/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "idempotency_key": "sub_12345",
    "merchant_id": "merchant-uuid",
    "customer_id": "customer-uuid",
    "plan_id": "plan-uuid",
    "trial_days": 14,
    "payment_method_id": "pm-uuid"
  }'
```

**Flow**:
1. Subscription created with status `trialing`
2. Trial period: 14 days from now
3. Webhook event: `subscription.created`
4. Invoice generation scheduled at trial end
5. After trial: status → `active`, invoice generated, payment attempted
6. If payment succeeds: period bumped, next invoice scheduled
7. If payment fails: dunning workflow triggered

### Change Plan with Proration

```bash
curl -X POST http://localhost:8052/api/subscriptions/:id/change_plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "idempotency_key": "change_123",
    "new_plan_id": "pro-plan-uuid",
    "effective": "now"
  }'
```

**Proration Logic**:
- Old plan: $29.99/month, 15 days remaining
- New plan: $99.99/month
- Credit: $29.99 × (15/30) = $14.995
- Charge: $99.99 × (15/30) = $49.995
- Net difference: $34.00 (applied to next invoice or invoiced now)

### Failed Payment Dunning

1. Payment fails → `subscription_invoices.status = 'failed'`
2. Webhook: `invoice.payment_failed`
3. Dunning policy applied (e.g., retry in 1d, 3d, 7d)
4. First retry (day 1): Payment attempted
5. Second retry (day 3): Payment attempted
6. Final retry (day 7): Payment attempted
7. If all fail: `subscriptions.status = 'past_due'` or `canceled`

## Webhook Events

Emitted via B45 Webhooks:

- `subscription.created` - New subscription created
- `subscription.updated` - Subscription modified (plan change, etc.)
- `subscription.canceled` - Subscription canceled
- `subscription.past_due` - Payment failures exceeded retries
- `invoice.generated` - Billing invoice created
- `invoice.payment_succeeded` - Payment collected successfully
- `invoice.payment_failed` - Payment attempt failed
- `mandate.requires_action` - 3DS/PSD2 authentication needed

## Dunning Configuration

Default policy (seeded):

```json
{
  "retries": [
    { "days": 1, "action": "retry" },
    { "days": 3, "action": "retry" },
    { "days": 7, "action": "cancel" }
  ],
  "max_retries": 3,
  "actions": {
    "email_template": "dunning_notification",
    "sms_enabled": false
  }
}
```

Merchants can create custom policies via API.

## Payment Method Security

### Encryption

Payment tokens encrypted with **AES-256-GCM**:

```typescript
const encrypted = encrypt(token);
// Format: "iv:authTag:encryptedData"
```

### PCI Compliance

- Never store raw card PANs
- Use provider tokenization (Stripe, PSP, Molam Vault)
- HTTPS required for all API calls
- Encrypted token storage in database
- SEPA mandates stored as references + PDF in S3

### 3DS Flow

1. Merchant captures card → POST `/api/payment_methods`
2. If 3DS required: Response includes `client_secret`
3. Client completes 3DS challenge
4. Token stored with `status='active'`
5. Subsequent charges use stored token (no 3DS)

## Metrics

Prometheus metrics exposed at `/metrics`:

- `b52_subscriptions_created_total` - Subscriptions created by merchant/status
- `b52_subscriptions_canceled_total` - Cancellations by merchant/reason
- `b52_mrr_total` - Monthly Recurring Revenue by merchant/currency
- `b52_subscription_invoices_total` - Invoices by status
- `b52_dunning_attempts_total` - Dunning attempts by outcome
- `b52_http_request_duration_seconds` - API latency

## RBAC Roles

- **merchant_admin**: Create/manage subscriptions for their merchant
- **connect_dev**: Developer access for integration testing
- **user**: End-customer access (view own subscriptions)
- **pay_admin**: Ops admin (access all merchants)

## Integrations

### B46 Billing

```typescript
import { createInvoiceForSubscription } from "./billing/integrations.js";

const invoice = await createInvoiceForSubscription({
  subscriptionId,
  merchantId,
  customerId,
  lines: [{ description: "Pro Plan", amount: 99.99, currency: "USD" }],
  currency: "USD",
  periodStart: new Date(),
  periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
});
```

### SIRA Fraud Detection

```typescript
import { pickSiraScore } from "./services/sira.js";

const score = await pickSiraScore(customerId, { type: "subscription_payment" });
// { score: 0.15, risk_level: "low", reasons: ["good_history"] }
```

If `risk_level === "high"`, payment may be delayed for ops review.

## Deployment

### Production Checklist

- [ ] Configure DATABASE_URL
- [ ] Set JWT_PUBLIC_KEY_PATH
- [ ] Configure SERVICE_TOKEN for inter-service auth
- [ ] Set BILLING_URL, WEBHOOKS_URL, SIRA_URL
- [ ] Configure Stripe/PSP credentials
- [ ] Set VAULT_ENCRYPTION_KEY (32 bytes, secure random)
- [ ] Configure AWS S3 for SEPA mandates
- [ ] Start subscription worker process
- [ ] Start dunning worker process
- [ ] Configure monitoring (Prometheus, Grafana)
- [ ] Set up alerting for failed payments

### Scaling

**Horizontal Scaling**:
- API servers: Stateless, scale behind load balancer
- Workers: Multiple instances with job queue sharding (use BullMQ/Kafka)

**Database**:
- PostgreSQL read replicas for analytics queries
- Connection pooling (max 20 per instance)
- Index optimization on frequently queried fields

**Job Queue**:
- Replace in-memory queue with BullMQ + Redis for production
- Dead letter queue for failed jobs
- Priority queue for urgent dunning retries

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
# Start test database
createdb molam_subscriptions_test
DATABASE_URL=postgresql://localhost/molam_subscriptions_test npm test
```

### Load Testing

Simulate 1000 subscriptions billing at once:

```bash
# Use k6, Artillery, or JMeter
k6 run load-tests/subscription-billing.js
```

Target: P95 latency < 3s for payment collection

## Troubleshooting

### Failed Payments Not Retrying

Check dunning worker logs:

```bash
npm run worker:dunning
# Look for "Dunning worker started"
```

Verify `next_attempt_at` is in the past:

```sql
SELECT * FROM subscription_invoices
WHERE status = 'failed' AND next_attempt_at <= now()
LIMIT 10;
```

### Subscriptions Not Generating Invoices

Check subscription worker logs:

```bash
npm run worker:billing
```

Verify job queue:

```typescript
import { getQueueSize } from "./workers/jobQueue.js";
console.log("Queue size:", getQueueSize());
```

### Payment Method Decryption Error

Verify `VAULT_ENCRYPTION_KEY` is consistent across all instances.

## Support

- **Documentation**: This file
- **Issues**: GitHub Issues
- **Ops Runbook**: See `docs/runbook.md`

## License

Proprietary - Molam Inc.
