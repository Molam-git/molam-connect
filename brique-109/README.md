# Brique 109: Checkout Widgets & SDK Enhancements (Apple-like)

**Industrial-grade checkout widget system** with Apple-like UX, PCI-compliant tokenization, hosted fields, and multi-platform SDK support.

## Overview

Brique 109 provides a complete **plug-and-play checkout solution** for merchants with:

- **Apple-like minimal UX** - Maximum conversion with minimum friction
- **PCI-compliant tokenization** - Hosted fields reduce merchant PCI scope to SAQ-A
- **Multi-payment methods** - Wallet, Cards (tokenized), Bank transfers
- **3DS2 integration** - Automatic authentication orchestration via Brique 108
- **Offline fallbacks** - QR codes + USSD instructions (country-aware)
- **Multi-platform SDKs** - Web (Vanilla JS + React), Mobile (React Native, Flutter stubs)
- **Accessibility** - WCAG AA compliant, keyboard navigation, screen reader support
- **Observability** - Metrics, tracing, analytics for conversion optimization

## Architecture

```
┌──────────────────┐
│  Merchant Site   │
└────────┬─────────┘
         │ 1. Load widget script
         ▼
┌──────────────────────┐
│  Checkout Widget     │ ◄── Apple-like UI (minimal fields)
└────────┬─────────────┘
         │ 2. Create session
         ▼
┌──────────────────────┐
│  Checkout API        │
│  /create_session     │
└────────┬─────────────┘
         │ 3. Returns session + config
         ▼
┌──────────────────────┐
│  Widget renders      │
│  - Wallet selector   │
│  - Card (hosted)     │
│  - Bank selector     │
└────────┬─────────────┘
         │ 4a. Card selected → Hosted Fields
         ▼
┌──────────────────────┐
│  Hosted Fields       │ ◄── PCI-isolated iframe (tokens.molam.com)
│  (iframe)            │
└────────┬─────────────┘
         │ 5. Tokenize card → POST /tokens
         ▼
┌──────────────────────┐
│  Tokenization        │ ◄── HSM/KMS encrypted storage
│  Service             │
└────────┬─────────────┘
         │ 6. Returns token (card_tok_xxx)
         ▼
┌──────────────────────┐
│  Widget confirms     │ → POST /checkout/confirm
└────────┬─────────────┘
         │ 7. Creates PaymentIntent (B108)
         ▼
┌──────────────────────┐
│  SIRA + 3DS2         │ ◄── Brique 108 orchestration
└────────┬─────────────┘
         │ 8. Success / Requires Action
         ▼
┌──────────────────────┐
│  Widget shows result │
│  + Webhooks emitted  │
└──────────────────────┘
```

## Quick Start (5-Minute Integration)

### 1. Include Widget Script

```html
<script src="https://cdn.molam.com/checkout-widget/v1.js" async></script>
<div id="molam-checkout"></div>
```

### 2. Initialize Widget

```javascript
const widget = new MolamCheckout({
  sessionExternalId: 'ORDER-12345',
  merchantId: 'your-merchant-id',
  amount: 55000,
  currency: 'XOF',
  onSuccess: (result) => {
    console.log('Payment successful:', result);
    // Redirect to success page
  },
  onError: (error) => {
    console.error('Payment failed:', error);
  }
});
```

That's it! The widget handles:
- Session creation
- Payment method selection
- Card tokenization (PCI-compliant)
- 3DS2 authentication
- Payment confirmation
- Success/error states

## API Endpoints

### 1. Create Checkout Session

```http
POST /api/v1/checkout/create_session
Content-Type: application/json

{
  "external_id": "ORDER-12345",
  "merchant_id": "uuid",
  "amount": 55000,
  "currency": "XOF",
  "locale": "fr",
  "allowed_methods": ["wallet", "card", "bank"],
  "success_url": "https://merchant.com/success",
  "cancel_url": "https://merchant.com/cancel"
}

Response 201:
{
  "id": "uuid",
  "external_id": "ORDER-12345",
  "amount": 55000,
  "currency": "XOF",
  "merchant_name": "My Shop",
  "merchant_logo": "https://...",
  "allowed_methods": ["wallet", "card", "bank"],
  "sira_hints": {
    "risk_score": 40,
    "recommended_methods": ["otp", "none"]
  },
  "expires_at": "2025-01-18T11:15:00Z",
  "status": "created"
}
```

**Features**:
- Idempotent via `external_id`
- 15-minute session expiry
- SIRA hints for pre-authentication routing
- Merchant branding (name, logo)

### 2. Tokenize Card (PCI-Compliant)

```http
POST /api/v1/tokens
Content-Type: application/json

{
  "pan": "4242424242424242",
  "exp_month": 12,
  "exp_year": 2025,
  "cvc": "123",
  "name": "JOHN DOE",
  "billing_country": "SN",
  "usage": "single"
}

Response 201:
{
  "token": "card_tok_a1b2c3d4e5f6...",
  "masked_pan": "**** **** **** 4242",
  "card_brand": "visa",
  "exp_month": 12,
  "exp_year": 2025,
  "fingerprint": "fp_abc123...",
  "usage": "single",
  "expires_at": "2025-01-18T11:00:00Z"
}
```

**Security**:
- PAN encrypted with AES-256-GCM + HSM/KMS
- Luhn validation
- Single-use tokens expire in 1 hour
- Multi-use (vaulted) tokens expire on card expiry
- No PAN stored in logs

### 3. Confirm Checkout

```http
POST /api/v1/checkout/confirm
Content-Type: application/json

{
  "session_id": "uuid",
  "payment_method_token": "card_tok_xxx"
}

Response 200 (Success):
{
  "status": "succeeded",
  "payment_intent_id": "uuid",
  "charge_id": "uuid"
}

Response 200 (Requires 3DS2):
{
  "status": "requires_action",
  "action": {
    "type": "3ds2",
    "client_data": { ... }
  }
}
```

**Flow**:
1. Creates PaymentIntent (Brique 108)
2. Calls SIRA for authentication decision
3. Routes to 3DS2 / OTP / Direct charge
4. Updates session status
5. Emits webhooks

### 4. Get Session QR Code (Offline Fallback)

```http
GET /api/v1/checkout/session/:id/qr

Response 200:
{
  "session_id": "uuid",
  "qr_url": "https://pay.molam.com/xyz123",
  "qr_data_url": "data:image/png;base64,...",
  "amount": 55000,
  "currency": "XOF",
  "expires_at": "2025-01-18T11:15:00Z"
}
```

### 5. Cancel Session

```http
POST /api/v1/checkout/session/:id/cancel

Response 200:
{
  "ok": true,
  "session": { ... }
}
```

## Database Schema

### Tables Created

1. **checkout_sessions** - Short-lived widget sessions (15 min TTL)
2. **payment_method_tokens** - PCI-compliant encrypted tokens
3. **widget_configurations** - Merchant-specific widget settings
4. **tokenization_events** - Audit trail for token lifecycle
5. **widget_analytics** - Conversion metrics and performance
6. **hosted_field_sessions** - Iframe session tracking

## Widget Features

### Apple-like UX

- **Minimal fields**: Email/phone + payment method only
- **Hidden by default**: Address, VAT (shown if merchant requires)
- **Large touch targets**: 44x44px minimum (iOS guidelines)
- **Clear typography**: SF Pro / -apple-system font stack
- **Instant validation**: Real-time feedback, no surprises
- **Loading states**: Clear progress indicators
- **Error messages**: Human-readable, actionable

### Payment Methods

| Method | Icon | Description |
|--------|------|-------------|
| Wallet | 💳 | Molam Wallet (instant, 2% fee) |
| Card | 💳 | Visa, Mastercard, Amex (hosted fields) |
| Bank | 🏦 | Local bank transfers (country-aware) |

### Hosted Fields (PCI SAQ-A)

The card input is loaded in an **isolated iframe** from `tokens.molam.com`:

```
┌─────────────────────────────────┐
│  Merchant Site (merchant.com)   │
│  ┌───────────────────────────┐  │
│  │  Molam Widget             │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  Hosted Fields      │  │  │ ◄── tokens.molam.com
│  │  │  (PCI-isolated)     │  │  │     AES-256-GCM encryption
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Benefits**:
- Merchant never touches PAN → **PCI SAQ-A** scope
- CSP + SRI for iframe integrity
- postMessage for secure communication
- HTTPS + CORS + Origin validation

### Accessibility (WCAG AA)

- ✅ Color contrast ≥ 4.5:1
- ✅ Keyboard navigation (Tab, Enter, Esc)
- ✅ Screen reader labels (ARIA)
- ✅ Focus indicators
- ✅ Error announcements
- ✅ High contrast mode support

### Offline Fallbacks

When network unavailable or merchant chooses offline:

**QR Code**:
```javascript
const qrCode = await fetch(`/api/v1/checkout/session/${sessionId}/qr`);
// Shows dynamic QR pointing to pay.molam.com/xyz123
```

**USSD Instructions** (country-aware):
```
Senegal (SN): Dial *131*2*{code}# to pay 55,000 XOF
Côte d'Ivoire (CI): Dial *144*1*{code}# to pay 55,000 XOF
```

## SDK Examples

### Web (Vanilla JS)

```javascript
const widget = new MolamCheckout({
  sessionExternalId: 'ORDER-123',
  merchantId: 'merchant-uuid',
  amount: 55000,
  currency: 'XOF',
  style: {
    theme: 'apple',
    color: '#0A84FF',
    borderRadius: 16
  },
  onSuccess: (result) => {
    window.location.href = '/success?payment=' + result.payment_intent_id;
  }
});
```

### React Component

```jsx
import { MolamCheckout } from '@molam/checkout-react';

function CheckoutPage() {
  return (
    <MolamCheckout
      sessionExternalId="ORDER-123"
      merchantId="merchant-uuid"
      amount={55000}
      currency="XOF"
      onSuccess={(result) => {
        console.log('Payment successful:', result);
      }}
      onError={(error) => {
        console.error('Payment failed:', error);
      }}
    />
  );
}
```

### React Native (Stub)

```typescript
import { MolamCheckoutSDK } from '@molam/checkout-react-native';

MolamCheckoutSDK.init({
  publicKey: 'pk_live_...',
  environment: 'live'
});

const session = await MolamCheckoutSDK.createSession({
  merchantId: 'uuid',
  externalId: 'ORDER-123',
  amount: 55000,
  currency: 'XOF'
});

const result = await MolamCheckoutSDK.present(session.id);
// Handles native wallet selection, hosted fields webview, 3DS challenge
```

## Server Integration

### Node.js

```javascript
const express = require('express');
const app = express();

app.post('/create-checkout', async (req, res) => {
  const session = await fetch('http://localhost:3000/api/v1/checkout/create_session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: `ORDER-${req.body.orderId}`,
      merchant_id: process.env.MOLAM_MERCHANT_ID,
      amount: req.body.amount,
      currency: 'XOF'
    })
  });

  const sessionData = await session.json();
  res.json({ sessionId: sessionData.id });
});
```

## Security & PCI Compliance

### PCI Scope Reduction

| Approach | PCI Scope | Implementation |
|----------|-----------|----------------|
| **Hosted Fields** (this) | **SAQ-A** | Iframe from tokens.molam.com |
| Direct integration | SAQ-D | Full PCI audit required |

### Security Checklist

- ✅ AES-256-GCM encryption for PAN
- ✅ HSM/KMS for key management (production)
- ✅ Luhn validation
- ✅ Card fingerprinting for deduplication
- ✅ Single-use tokens (1-hour TTL)
- ✅ Multi-use tokens (vaulted with consent)
- ✅ CSRF protection
- ✅ CSP + SRI for widget
- ✅ CORS restricted to merchant origins
- ✅ No PAN in logs or error messages
- ✅ Idempotency enforcement

### Key Management

**Test Mode**:
```env
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
```

**Production**:
```env
# Use AWS KMS, Azure Key Vault, or HSM
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789012:key/...
```

## Analytics & Metrics

### Widget Performance

```sql
-- Average session creation latency
SELECT AVG(latency_ms) FROM widget_analytics WHERE metric_type = 'session_created';

-- Conversion rate
SELECT
  COUNT(CASE WHEN metric_type = 'confirm_success' THEN 1 END) * 100.0 /
  COUNT(CASE WHEN metric_type = 'session_created' THEN 1 END) AS conversion_rate
FROM widget_analytics;

-- 3DS challenge rate
SELECT
  COUNT(CASE WHEN metric_type = '3ds_challenge' THEN 1 END) * 100.0 /
  COUNT(CASE WHEN payment_method = 'card' THEN 1 END) AS challenge_rate
FROM widget_analytics;
```

### Prometheus Metrics

```
# Session created
checkout_session_created_total{merchant="uuid",env="production"} 1523

# Tokenization success rate
hosted_tokenization_success_rate{merchant="uuid"} 0.98

# Confirm latency
checkout_confirm_latency_seconds{quantile="0.95"} 0.15
```

## Testing

### Unit Tests

```bash
npm test brique-109
```

**Coverage**:
- Luhn validation
- Card brand detection
- Token expiry logic
- Session idempotency
- Encryption/decryption

### E2E Tests

```javascript
// Test: Card payment with 3DS2
it('should complete card payment with 3DS challenge', async () => {
  const session = await createSession({ amount: 55000 });
  const token = await tokenizeCard({ pan: '4242424242424242' });
  const result = await confirmCheckout(session.id, token);

  expect(result.status).toBe('requires_action');
  expect(result.action.type).toBe('3ds2');

  // Simulate 3DS challenge success
  const final = await complete3DS(result.action.client_data);
  expect(final.status).toBe('succeeded');
});
```

### Accessibility Tests

```javascript
import { axe } from 'jest-axe';

it('should pass WCAG AA compliance', async () => {
  const widget = render(<CheckoutWidget />);
  const results = await axe(widget.container);
  expect(results).toHaveNoViolations();
});
```

## Deployment

### Production Checklist

1. **Hosted Fields Domain**: Deploy to `tokens.molam.com` (isolated)
2. **Widget CDN**: Deploy to `cdn.molam.com/checkout/v1.js` with SRI
3. **HSM/KMS**: Configure encryption keys in Vault
4. **Merchant Origins**: Configure CORS allowlist in Dashboard
5. **Rate Limiting**: 100 req/min per merchant for /create_session
6. **Monitoring**: Setup Prometheus + Grafana dashboards
7. **Pen Test**: Security audit for hosted fields + tokenization

### Environment Variables

```env
# Encryption (Production: use KMS)
ENCRYPTION_KEY=<64-char-hex>
KMS_KEY_ID=<aws-kms-arn>

# URLs
PAY_URL=https://pay.molam.com
CDN_URL=https://cdn.molam.com
TOKENS_URL=https://tokens.molam.com

# Checkout
CHECKOUT_SESSION_TTL=900  # 15 minutes
TOKEN_SINGLE_USE_TTL=3600  # 1 hour
```

## File Structure

```
brique-109/
├── migrations/
│   └── 001_checkout_widgets.sql       # Database schema
├── src/
│   ├── routes/
│   │   └── checkout.js                # Checkout API endpoints
│   └── tokens/
│       └── service.js                 # Tokenization service (PCI)
├── iframe/
│   └── hosted_card.html               # Hosted fields iframe
├── web/
│   └── CheckoutWidget.html            # Vanilla JS widget demo
├── mobile/
│   ├── react-native/
│   │   └── index.ts                   # RN SDK stub
│   └── flutter/
│       └── lib/molam_checkout.dart    # Flutter SDK stub
└── README.md
```

## Known Limitations

1. **Mock HSM**: Uses Node crypto instead of real HSM (production needs AWS KMS/HSM)
2. **Mock SIRA**: Simplified risk scoring (integrate real SIRA API)
3. **No webhook signatures**: HMAC signing not implemented yet
4. **Single merchant origin**: CORS validation needs Dashboard integration
5. **No retry logic**: Token creation failures don't retry (add exponential backoff)

## Next Steps

1. **Real HSM Integration**: AWS KMS, Azure Key Vault, or CloudHSM
2. **Merchant Dashboard**: Widget configuration UI (colors, methods, logos)
3. **CMS Plugins**: WordPress, Shopify, WooCommerce one-click install
4. **Mobile SDKs**: Complete React Native + Flutter implementations
5. **A/B Testing**: Widget variants for conversion optimization
6. **Fraud Signals**: Device fingerprinting, behavioral analytics

---

**Status**: ✅ Complete - Ready for testing with mock encryption
**Dependencies**: PostgreSQL 12+, Node.js 18+, Brique 108 (PaymentIntent)
**Related Briques**: 108 (PaymentIntent), 107 (Offline), 45 (Webhooks)
