# Brique 53 - Checkout Hosted / Embedded Subscription Checkout

Complete checkout experience for subscriptions with hosted pages and embeddable SDKs for web and mobile.

## Features

### Hosted Checkout Pages
- **Ready-to-Use**: Beautiful, conversion-optimized checkout pages
- **Multi-Language**: Auto-detect or force locale (en, fr, es, ar, etc.)
- **Multi-Currency**: Support for all major currencies
- **Branding**: Customizable logos, colors, and text per merchant
- **Responsive**: Mobile-first design with Tailwind CSS

### Embeddable SDK
- **Web**: React component or vanilla JavaScript
- **Mobile**: React Native component
- **Modes**: Redirect or modal iframe embedding
- **Events**: Success, cancel, error callbacks

### Payment Methods
- **Card**: 3DS-enabled card payments (Stripe/PSP integration)
- **SEPA Direct Debit**: SEPA mandate collection and storage
- **Bank Transfer**: Manual bank transfer instructions
- **Molam Wallet**: Redirect to Wallet for balance payment

### Security & Compliance
- **Molam ID SSO**: Secure authentication for API access
- **Tokenization**: PCI-compliant payment method vault
- **3DS/OTP Flows**: Strong Customer Authentication (SCA)
- **SIRA Scoring**: Fraud detection before payment
- **Session Expiry**: 30-minute timeout for security
- **mTLS**: Mutual TLS for backend communications

### Analytics & Conversion
- **Event Tracking**: Page views, method selection, payment started/completed
- **Funnel Analytics**: Conversion rate by step
- **A/B Testing**: Test different checkout flows
- **Ops Dashboard**: Monitor sessions, conversion rates, failures

## Architecture

```
brique-53/
├── migrations/
│   └── 053_checkout.sql              # 3 tables
├── src/
│   ├── utils/
│   │   ├── db.ts                     # PostgreSQL connection
│   │   └── authz.ts                  # JWT + RBAC
│   ├── services/
│   │   └── checkoutService.ts        # Session management
│   ├── webhooks/
│   │   └── publisher.ts              # B45 event publishing
│   ├── workers/
│   │   └── expiryWorker.ts           # Session expiry automation
│   ├── routes/
│   │   └── checkoutRoutes.ts         # Checkout API
│   └── server.ts                     # Express server
├── web/
│   └── pages/
│       └── checkout.html             # Hosted checkout page
└── sdk/
    ├── web/
    │   └── MolamCheckout.tsx         # React SDK
    └── mobile/
        └── MolamCheckout.tsx         # React Native SDK

Port: 8053
Database: molam_checkout
```

## Database Schema

### Tables (3)

1. **checkout_sessions** - Checkout session tracking
2. **merchant_branding** - Merchant customization (logos, colors, texts)
3. **checkout_events** - Analytics event tracking

## API Endpoints

### Checkout Sessions

```
POST   /api/checkout/session              # Create checkout session
GET    /api/checkout/session/:id          # Get session details
POST   /api/checkout/session/:id/complete # Mark as completed (internal)
POST   /api/checkout/session/:id/fail     # Mark as failed (internal)
POST   /api/checkout/session/:id/event    # Log analytics event
```

### Branding

```
GET    /api/checkout/branding/:merchantId # Get merchant branding
PATCH  /api/checkout/branding/:merchantId # Update branding
```

### Hosted Pages

```
GET    /checkout/:sessionId               # Hosted checkout page (no auth)
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
createdb molam_checkout
```

### 4. Run Migrations

```bash
npm run migrate
# or
psql molam_checkout < migrations/053_checkout.sql
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on **http://localhost:8053**

### 6. Start Workers

```bash
# In a separate terminal
npm run worker:expiry
```

## Usage Examples

### Backend: Create Checkout Session

```typescript
import fetch from "node-fetch";

const response = await fetch("http://localhost:8053/api/checkout/session", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
  },
  body: JSON.stringify({
    idempotency_key: "checkout_12345",
    merchant_id: "merchant-uuid",
    customer_id: "customer-uuid",
    plan_id: "plan-uuid",
    return_url: "https://yoursite.com/success",
    cancel_url: "https://yoursite.com/cancel",
    success_url: "https://yoursite.com/thank-you",
    locale: "en",
    metadata: { campaign: "summer_sale" },
  }),
});

const data = await response.json();
console.log(data);
// {
//   session_id: "uuid",
//   url: "https://checkout.molam.com/checkout/uuid",
//   expires_at: "2025-11-05T01:00:00Z"
// }
```

### Frontend: Web SDK (React)

```tsx
import { MolamCheckoutButton } from "@molam/connect-checkout";

function App() {
  return (
    <MolamCheckoutButton
      sessionUrl="https://checkout.molam.com/checkout/session-id"
      label="Subscribe to Pro Plan"
      mode="modal"  // or "redirect"
      onSuccess={() => console.log("Subscription created!")}
      onCancel={() => console.log("User cancelled")}
      onError={(err) => console.error("Error:", err)}
    />
  );
}
```

### Frontend: Vanilla JavaScript

```html
<div id="checkout-button"></div>

<script src="https://checkout.molam.com/sdk/molam-checkout.js"></script>
<script>
  MolamCheckout.createButton({
    sessionUrl: 'https://checkout.molam.com/checkout/session-id',
    containerId: 'checkout-button',
    label: 'Subscribe Now',
    onSuccess: () => alert('Success!'),
  });
</script>
```

### Mobile: React Native

```tsx
import { MolamCheckoutButton } from "@molam/connect-checkout-mobile";

function SubscribeScreen() {
  return (
    <MolamCheckoutButton
      sessionUrl="https://checkout.molam.com/checkout/session-id"
      mode="modal"  // or "browser"
      onSuccess={() => navigation.navigate("Success")}
      onCancel={() => navigation.goBack()}
    />
  );
}
```

## Hosted Checkout Flow

1. **Create Session**: Backend creates checkout session via API
2. **Redirect**: User redirected to hosted checkout URL
3. **Load Page**: Checkout page loads session details and branding
4. **Select Method**: User selects payment method (card/SEPA/wallet)
5. **Enter Details**: User enters payment information
6. **3DS (if needed)**: 3DS challenge presented for card payments
7. **Payment**: Payment processed via B52 Subscriptions
8. **Webhook**: `checkout.session.completed` event published
9. **Redirect**: User redirected to `success_url`

## Customization

### Merchant Branding

```typescript
// Update branding via API
const response = await fetch(`http://localhost:8053/api/checkout/branding/${merchantId}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN",
  },
  body: JSON.stringify({
    logo_url: "https://yoursite.com/logo.png",
    brand_color: "#FF6B6B",
    business_name: "Acme Corp",
    support_email: "support@acme.com",
    terms_url: "https://acme.com/terms",
    enabled_payment_methods: ["card", "sepa_debit"],
    locale_texts: {
      en: {
        subscribe_button: "Start Subscription",
      },
      fr: {
        subscribe_button: "Commencer l'abonnement",
      },
    },
  }),
});
```

### Custom Texts by Locale

```json
{
  "en": {
    "subscribe_button": "Subscribe Now",
    "secure_checkout": "Secure checkout powered by Molam",
    "trial_notice": "Free trial - you won't be charged until trial ends"
  },
  "fr": {
    "subscribe_button": "S'abonner maintenant",
    "secure_checkout": "Paiement sécurisé par Molam",
    "trial_notice": "Essai gratuit - vous ne serez pas facturé avant la fin de l'essai"
  },
  "es": {
    "subscribe_button": "Suscribirse ahora",
    "secure_checkout": "Pago seguro con Molam",
    "trial_notice": "Prueba gratuita - no se te cobrará hasta que termine la prueba"
  }
}
```

## Webhook Events

Emitted via B45 Webhooks:

### checkout.session.completed

```json
{
  "event": "checkout.session.completed",
  "data": {
    "session_id": "uuid",
    "subscription_id": "sub-uuid",
    "customer_id": "cust-uuid",
    "amount": 29.99,
    "currency": "USD"
  },
  "timestamp": "2025-11-05T00:30:00Z"
}
```

### checkout.session.failed

```json
{
  "event": "checkout.session.failed",
  "data": {
    "session_id": "uuid",
    "reason": "payment_declined",
    "error_code": "card_declined"
  },
  "timestamp": "2025-11-05T00:30:00Z"
}
```

### checkout.session.expired

```json
{
  "event": "checkout.session.expired",
  "data": {
    "session_id": "uuid",
    "created_at": "2025-11-05T00:00:00Z",
    "expired_at": "2025-11-05T00:30:00Z"
  },
  "timestamp": "2025-11-05T00:30:00Z"
}
```

## Analytics Events

Tracked in `checkout_events` table:

- `page_view` - Checkout page loaded
- `plan_selected` - User viewed plan details
- `payment_method_selected` - Payment method chosen
- `payment_started` - User submitted payment form
- `payment_completed` - Payment succeeded
- `payment_failed` - Payment declined
- `session.created` - Session initialized
- `session.completed` - Subscription created
- `session.failed` - Payment failed
- `session.expired` - Session timed out

## Conversion Funnel

```
page_view (100%)
  → payment_method_selected (80%)
    → payment_started (60%)
      → payment_completed (45%)
```

**Conversion Rate**: 45% (typical for subscription checkouts)

## Session Lifecycle

```
created (30 min)
  → requires_action (3DS pending)
    → processing (payment in flight)
      → completed ✓
      → failed ✗
  → expired (timeout)
```

## Security Features

### Session Expiry

Sessions automatically expire after 30 minutes:

```typescript
// Expiry worker runs every minute
setInterval(async () => {
  await pool.query(`
    UPDATE checkout_sessions
    SET status = 'expired'
    WHERE status IN ('created', 'requires_action')
      AND expires_at <= now()
  `);
}, 60000);
```

### CORS Configuration

```typescript
app.use(helmet({
  contentSecurityPolicy: false, // Allow iframe embedding
}));
```

### Payment Tokenization

```typescript
// Card details tokenized via PSP (never stored raw)
const token = await stripe.tokens.create({
  card: {
    number: '4242424242424242',
    exp_month: 12,
    exp_year: 2025,
    cvc: '123',
  },
});

// Store only token in payment_methods table (B52)
```

### 3DS Flow

```typescript
// 1. Create payment intent with 3DS requirement
const intent = await stripe.paymentIntents.create({
  amount: 2999,
  currency: 'usd',
  payment_method: 'pm_xxx',
  confirm: true,
  return_url: 'https://checkout.molam.com/checkout/session-id/3ds-return',
});

// 2. If requires_action, update session
if (intent.status === 'requires_action') {
  await pool.query(`
    UPDATE checkout_sessions
    SET status = 'requires_action',
        metadata = jsonb_set(metadata, '{client_secret}', to_jsonb($1::text))
    WHERE id = $2
  `, [intent.client_secret, sessionId]);
}

// 3. User completes 3DS, redirected back
// 4. Confirm payment and complete session
```

## Integrations

### B52 Subscriptions

Checkout creates subscriptions via B52 API:

```typescript
const subscription = await fetch(`${SUBSCRIPTIONS_URL}/api/subscriptions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
  body: JSON.stringify({
    idempotency_key: `checkout_${sessionId}`,
    merchant_id: session.merchant_id,
    customer_id: session.customer_id,
    plan_id: session.plan_id,
    payment_method_id: paymentMethodId,
  }),
});
```

### B45 Webhooks

All checkout events published to B45:

```typescript
await publishEvent("merchant", merchantId, "checkout.session.completed", {
  session_id: sessionId,
  subscription_id: subscriptionId,
});
```

### B44 SIRA

Fraud detection before payment:

```typescript
const siraScore = await fetch(`${SIRA_URL}/api/score`, {
  method: "POST",
  body: JSON.stringify({ customer_id: customerId }),
});

if (siraScore.risk_level === "high") {
  // Require additional verification or ops approval
}
```

## Metrics

Prometheus metrics at `/metrics`:

- `b53_checkout_sessions_created_total` - Sessions created by merchant/locale
- `b53_checkout_sessions_completed_total` - Completed sessions
- `b53_checkout_sessions_failed_total` - Failed sessions by reason
- `b53_checkout_conversion_rate` - Conversion rate histogram

## Deployment

### Production Checklist

- [ ] Configure DATABASE_URL
- [ ] Set JWT_PUBLIC_KEY_PATH
- [ ] Configure SERVICE_TOKEN
- [ ] Set CHECKOUT_HOST to production domain
- [ ] Configure SUBSCRIPTIONS_URL, WEBHOOKS_URL, SIRA_URL
- [ ] Set up Stripe/PSP credentials
- [ ] Configure CORS for allowed domains
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Start expiry worker process
- [ ] Configure CDN for SDK hosting
- [ ] Set up monitoring (Prometheus, Grafana)

### SDK Distribution

Publish SDKs to npm:

```bash
# Web SDK
cd sdk/web
npm publish

# Mobile SDK
cd sdk/mobile
npm publish
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
# Create test session
curl -X POST http://localhost:8053/api/checkout/session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "test_123",
    "merchant_id": "merchant-1",
    "plan_id": "starter-monthly"
  }'

# Visit checkout URL
open http://localhost:8053/checkout/session-id
```

### A/B Testing

Test different checkout flows:

- **Variant A**: Single-page checkout
- **Variant B**: Multi-step checkout
- **Variant C**: Express checkout (saved methods)

Track conversion rates via `checkout_events` analytics.

## Troubleshooting

### Session Not Loading

Check session status:

```sql
SELECT * FROM checkout_sessions WHERE id = 'session-id';
```

If `status = 'expired'`, create a new session.

### Payment Method Not Showing

Check enabled methods in branding:

```sql
SELECT enabled_payment_methods FROM merchant_branding
WHERE merchant_id = 'merchant-id';
```

### 3DS Not Working

Verify return_url is whitelisted in Stripe dashboard.

## Support

- **Documentation**: This file
- **Issues**: GitHub Issues
- **Ops Runbook**: See `docs/runbook.md`

## License

Proprietary - Molam Inc.
