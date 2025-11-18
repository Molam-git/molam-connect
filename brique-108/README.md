# Brique 108: PaymentIntent & 3DS2 Orchestration

**Industrial-grade payment orchestration system** with 3D Secure 2.0, intelligent authentication routing, idempotency, and webhook infrastructure.

## Overview

Brique 108 implements a complete **PaymentIntent** workflow (Stripe-like) with:

- **Finite State Machine (FSM)** for payment lifecycle management
- **3D Secure 2.0 (3DS2)** authentication orchestration
- **SIRA integration** for risk-based authentication decisions
- **Idempotency** enforcement for duplicate request prevention
- **Webhook events** for merchant notifications
- **Audit trail** for all state transitions
- **Multi-capture modes** (automatic/manual)
- **Refund management**

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ 1. Create PaymentIntent
       ▼
┌─────────────────────┐
│  PaymentIntent API  │
└──────┬──────────────┘
       │ 2. Confirm (with payment method)
       ▼
┌─────────────────────┐
│   SIRA Decision     │ ◄─── Risk scoring engine
└──────┬──────────────┘
       │
       ├─── 3DS2 Required? ───► Start 3DS2 Session ───► Client SDK Challenge
       │
       ├─── OTP Required? ────► Create OTP ───────────► SMS/Voice delivery
       │
       └─── None ─────────────► Direct Charge ────────► Provider (Stripe/PayStack)
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Finalize PI   │
                              └───────┬───────┘
                                      │
                                      ├─── Success ──► Webhooks → Merchant
                                      └─── Failure ──► Webhooks → Merchant
```

## Database Schema

### Tables Created

1. **payment_intents** - Core payment contract
2. **charges** - Money movement records
3. **three_ds_sessions** - 3DS2 authentication sessions
4. **auth_decisions** - SIRA authentication decisions
5. **payment_state_transitions** - Audit trail
6. **refunds** - Refund records
7. **payment_method_tokens** - Tokenized payment methods
8. **payment_metrics** - Real-time metrics
9. **payment_webhooks_queue** - Webhook delivery queue

## API Endpoints

### Core PaymentIntent Flow

#### 1. Create PaymentIntent
```http
POST /api/v1/payment-intents
Content-Type: application/json
Idempotency-Key: unique-request-id

{
  "external_id": "order_123",
  "merchant_id": "uuid",
  "payer_user_id": "uuid",
  "amount": 55000,
  "currency": "XOF",
  "payment_method_types": ["card", "wallet"],
  "capture_method": "automatic"
}

Response 201:
{
  "id": "uuid",
  "external_id": "order_123",
  "status": "requires_payment_method",
  "amount": 55000,
  "currency": "XOF",
  "client_secret": "pi_xxx_secret_xxx",
  "created_at": "2025-01-18T10:00:00Z"
}
```

#### 2. Retrieve PaymentIntent
```http
GET /api/v1/payment-intents/:id

Response 200:
{
  "id": "uuid",
  "status": "requires_payment_method",
  "amount": 55000,
  "currency": "XOF",
  ...
}
```

#### 3. Confirm PaymentIntent
```http
POST /api/v1/payment-intents/:id/confirm
Content-Type: application/json

{
  "payment_method": {
    "type": "card",
    "card_number": "4242424242424242",
    "exp_month": 12,
    "exp_year": 2025,
    "cvc": "123",
    "cardholder_name": "John Doe"
  }
}

Response 200 (3DS2 Required):
{
  "status": "requires_action",
  "action": {
    "type": "3ds2",
    "client_data": {
      "threeDSServerTransID": "xxx",
      "acsURL": "https://acs.visa.com/3ds2/challenge",
      "creq": "base64-encoded-challenge-request"
    }
  }
}

Response 200 (OTP Required):
{
  "status": "requires_action",
  "action": {
    "type": "otp",
    "channel": "sms"
  }
}

Response 200 (Success):
{
  "status": "succeeded"
}
```

#### 4. Capture PaymentIntent (Manual Capture)
```http
POST /api/v1/payment-intents/:id/capture

Response 200:
{
  "ok": true
}
```

#### 5. Cancel PaymentIntent
```http
POST /api/v1/payment-intents/:id/cancel

Response 200:
{
  "ok": true
}
```

#### 6. Refund PaymentIntent
```http
POST /api/v1/payment-intents/:id/refund
Content-Type: application/json

{
  "amount": 10000,
  "reason": "requested_by_customer"
}

Response 201:
{
  "id": "uuid",
  "charge_id": "uuid",
  "payment_intent_id": "uuid",
  "amount": 10000,
  "currency": "XOF",
  "status": "pending",
  "reason": "requested_by_customer"
}
```

### 3DS2 Callback

```http
POST /api/v1/3ds/callback
Content-Type: application/json

{
  "threeDSServerTransID": "xxx",
  "cres": "base64-encoded-challenge-response"
}

Response 200:
{
  "status": "succeeded",
  "payment_intent_id": "uuid"
}
```

## Payment State Machine

```
requires_payment_method
    │
    ▼ (confirm)
requires_action ◄──┐
    │              │
    ├─ 3DS2 ───────┤
    ├─ OTP ────────┤
    └─ Biometric ──┘
    │
    ▼ (authenticated)
processing
    │
    ├─ (automatic capture) ──► succeeded
    └─ (manual capture) ─────► requires_capture ──► (capture) ──► succeeded
                                      │
                                      └─────────────► (cancel) ──► canceled

Any state ──► (failure) ──► failed
```

## SIRA Decision Logic

The SIRA (Smart Intelligent Risk Assessment) module determines authentication method based on:

- **Amount**: Higher amounts require stronger authentication
- **Payment method**: Cards vs wallets
- **Risk score**: 0-100 scale
- **Exemptions**: Low value, trusted merchant, etc.

### Decision Matrix

| Amount (XOF) | Risk Score | Card Auth     | Wallet Auth |
|-------------|-----------|---------------|-------------|
| < 1,000     | 10        | None          | None        |
| 1K - 10K    | 35        | OTP           | None        |
| 10K - 50K   | 55        | 3DS2          | OTP         |
| > 50K       | 75        | 3DS2          | OTP         |

## Webhook Events

Events are queued in `payment_webhooks_queue` and delivered to merchant endpoints:

- `payment_intent.created`
- `payment_intent.requires_action`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`

### Webhook Delivery

- **Retry logic**: Exponential backoff (5 attempts max)
- **Status tracking**: pending → sent | failed | abandoned
- **Error logging**: Last error message stored

## Idempotency

Duplicate requests are prevented using:

1. **external_id** field (unique constraint)
2. **Idempotency-Key** HTTP header

If a duplicate request is detected, the original PaymentIntent is returned (no new object created).

## Testing

### Example: Card Payment with 3DS2

```javascript
// 1. Create PaymentIntent
const pi = await fetch('/api/v1/payment-intents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'order_123'
  },
  body: JSON.stringify({
    merchant_id: 'merchant-uuid',
    payer_user_id: 'user-uuid',
    amount: 55000,
    currency: 'XOF',
    payment_method_types: ['card'],
    capture_method: 'automatic'
  })
});

// 2. Confirm with payment method
const confirm = await fetch(`/api/v1/payment-intents/${pi.id}/confirm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payment_method: {
      type: 'card',
      card_number: '4242424242424242',
      exp_month: 12,
      exp_year: 2025,
      cvc: '123'
    }
  })
});

// 3. If 3DS2 required, show challenge to user
if (confirm.status === 'requires_action' && confirm.action.type === '3ds2') {
  // Load 3DS SDK and show challenge
  const challengeData = confirm.action.client_data;

  // After user completes challenge, browser POSTs to:
  // POST /api/v1/3ds/callback with CRes
}

// 4. Check final status
const final = await fetch(`/api/v1/payment-intents/${pi.id}`);
// final.status === 'succeeded' | 'failed'
```

## File Structure

```
brique-108/
├── migrations/
│   └── 001_payment_intent_3ds2.sql    # Database schema
├── src/
│   ├── routes/
│   │   └── paymentIntents.js          # API routes
│   ├── services/
│   │   └── payment-intent-service.js  # Business logic (unused in current impl)
│   ├── sira/
│   │   └── client.js                  # SIRA decision engine
│   ├── 3ds/
│   │   └── utils.js                   # 3DS2 utilities
│   ├── charge/
│   │   ├── processor.js               # Charge creation & capture
│   │   └── finalizer.js               # Payment finalization
│   └── webhooks/
│       └── publisher.js               # Webhook queue management
└── README.md
```

## Integration with Server

The PaymentIntent routes are mounted in `server.js`:

```javascript
const createPaymentIntentRouter = require('./brique-108/src/routes/paymentIntents');
const webhookPublisher = require('./brique-108/src/webhooks/publisher');
const chargeProcessor = require('./brique-108/src/charge/processor');
const chargeFinalizer = require('./brique-108/src/charge/finalizer');

// Initialize pool references
webhookPublisher.setPool(pool);
chargeProcessor.setPool(pool);
chargeFinalizer.setPool(pool);

// Mount routes
const paymentIntentRouter = createPaymentIntentRouter(pool);
app.use('/api/v1/payment-intents', paymentIntentRouter);
```

## Security Features

1. **Idempotency enforcement** - Prevents duplicate charges
2. **HMAC validation** - Webhook signature verification (TODO)
3. **3DS2 authentication** - PSD2/SCA compliant
4. **Audit trail** - All state transitions logged
5. **Client secrets** - Secure client-side operations
6. **JSONB storage** - Secure payment method tokenization

## Production Considerations

### Replace Mock Implementations

1. **SIRA Client** (`src/sira/client.js`): Integrate with actual risk engine
2. **3DS2 Provider** (`src/3ds/utils.js`): Connect to Visa/Mastercard DS
3. **Charge Processor** (`src/charge/processor.js`): Integrate Stripe/PayStack
4. **Webhook Publisher** (`src/webhooks/publisher.js`): Add HTTP delivery + retry

### Environment Variables

```env
# Brique 108 Configuration
SIRA_API_URL=https://sira.molam.com
SIRA_API_KEY=your-key

3DS_PROVIDER_URL=https://3ds-provider.com
3DS_API_KEY=your-key

STRIPE_SECRET_KEY=sk_live_xxx
PAYSTACK_SECRET_KEY=sk_live_xxx

WEBHOOK_SECRET=your-webhook-signing-secret
```

## Monitoring

Key metrics to track:

- Payment intent creation rate
- Authentication decision latency (SIRA)
- 3DS2 challenge completion rate
- Charge success/failure rate
- Webhook delivery success rate

Query `payment_metrics` table for real-time analytics.

## Known Limitations

1. **Mock SIRA**: Uses amount-based logic instead of ML model
2. **Mock 3DS2**: Generates mock ACS URLs instead of real DS lookup
3. **Mock Providers**: Simulates Stripe/PayStack instead of API calls
4. **No webhook signatures**: HMAC signing not implemented yet
5. **Single-currency refunds**: Partial refunds must match original currency

## Next Steps

1. Integrate real SIRA API
2. Connect to 3DS Server (Mastercard SecureCode, Visa Secure)
3. Implement provider connectors (Stripe, PayStack, Wave)
4. Add webhook signature generation/verification
5. Build merchant dashboard for payment management
6. Add dispute management system

---

**Status**: ✅ Complete - Ready for testing with mock implementations
**Dependencies**: PostgreSQL 12+, Node.js 18+
**Related Briques**: 104-106 (basic payments), 107 (offline fallback)
