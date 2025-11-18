# Brique 94 - Molam Form Core

**Universal Plugin System for Merchant Integration**

A comprehensive, production-ready payment form SDK with multi-platform support (Web, Mobile, Server). Molam Form Core provides a single integration point for merchants to accept payments across all channels.

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [SDKs](#-sdks)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [Configuration](#-configuration)
- [Development](#-development)
- [Deployment](#-deployment)
- [Security](#-security)
- [Testing](#-testing)

---

## ✨ Features

### Core Capabilities
- **Single Plugin Installation** - One integration for all payment channels
- **Multi-Platform SDKs** - Web (JS), Mobile (Flutter), Server (Node/PHP/Python/Go)
- **API Key Management** - Test/Live environment separation with secure key generation
- **Payment Intents** - Stripe-like payment object lifecycle
- **Telemetry & Logging** - Comprehensive event tracking for debugging
- **Merchant Dashboard** - React UI for configuration and monitoring

### Security
- ✅ PCI-compliant tokenization
- ✅ Idempotency enforcement
- ✅ Rate limiting
- ✅ CORS protection
- ✅ Helmet security headers
- ✅ bcrypt password hashing

### Developer Experience
- 📚 Comprehensive documentation
- 🎨 Customizable checkout widget
- 🔄 Real-time webhook events
- 🧪 Test mode with test cards
- 📊 Telemetry dashboard

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Web SDK    │  Flutter SDK │  Server SDK  │   Dashboard    │
│ (molam.js)   │  (.dart)     │ (Node/PHP/   │    (React)     │
│              │              │  Python/Go)  │                │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────┘
       │              │              │                │
       └──────────────┴──────────────┴────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Molam Form API    │
              │  (Express/Node.js)  │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │PostgreSQL│    │  Redis  │    │ Webhook │
    │ Database │    │  Cache  │    │ Service │
    └─────────┘    └─────────┘    └─────────┘
```

### Components

1. **Backend API** (`src/routes/form.ts`)
   - Payment intent creation/management
   - API key generation/revocation
   - Telemetry logging
   - Configuration management

2. **Web SDK** (`src/sdk/web/molam-form.js`)
   - Custom `<molam-checkout>` web component
   - PCI-compliant card tokenization
   - Real-time form validation

3. **Mobile SDK** (`src/sdk/mobile/flutter/molam_form.dart`)
   - Flutter widget for iOS/Android
   - Native platform integration
   - Async payment processing

4. **Server SDKs** (`src/sdk/server/`)
   - Node.js (`molam-sdk.js`)
   - PHP (`MolamSDK.php`)
   - Python (`molam_sdk.py`)
   - Go (`molam.go`)

5. **Merchant Dashboard** (`src/ui/merchant-dashboard/`)
   - API key management
   - Telemetry viewer
   - Checkout customization
   - Analytics overview

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Clone and Install

```bash
cd brique-94
npm install
```

### 2. Set Up Database

```bash
# Create database
createdb molam_form

# Run migrations
psql -d molam_form -f migrations/001_b94_molam_form_core.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at [http://localhost:3000](http://localhost:3000).

---

## 📦 Installation

### Using Docker (Recommended)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- API server on port 3000
- Dashboard on port 3001

### Manual Installation

1. **Database Setup**
```sql
CREATE DATABASE molam_form;
\c molam_form
\i migrations/001_b94_molam_form_core.sql
```

2. **Application Setup**
```bash
npm install
npm run build
npm start
```

---

## 📚 SDKs

### Web SDK

Include the SDK in your HTML:

```html
<script src="https://cdn.molam.com/molam-form.js"></script>

<molam-checkout
  publishable-key="pk_test_xxx"
  amount="99.99"
  currency="USD"
  customer-email="customer@example.com"
  customer-name="John Doe"
  description="Premium Plan"
></molam-checkout>

<script>
  const checkout = document.querySelector('molam-checkout');

  checkout.addEventListener('payment-success', (event) => {
    console.log('Payment successful!', event.detail);
    window.location.href = '/thank-you';
  });

  checkout.addEventListener('payment-error', (event) => {
    console.error('Payment failed:', event.detail);
  });
</script>
```

### Flutter SDK

```dart
import 'package:molam_form/molam_form.dart';

MolamCheckout(
  publishableKey: 'pk_test_xxx',
  amount: 99.99,
  currency: 'USD',
  customerEmail: 'customer@example.com',
  onSuccess: (result) {
    print('Payment successful: $result');
    Navigator.push(context, MaterialPageRoute(builder: (_) => ThankYouPage()));
  },
  onError: (error) {
    print('Payment failed: $error');
    showDialog(context: context, builder: (_) => ErrorDialog(error));
  },
)
```

### Node.js SDK

```javascript
const Molam = require('molam-sdk');
const molam = new Molam('sk_test_xxx');

// Create payment intent
const intent = await molam.paymentIntents.create({
  amount: 99.99,
  currency: 'USD',
  customer_email: 'customer@example.com',
  description: 'Order #12345'
});

console.log('Client secret:', intent.client_secret);

// Confirm payment (after client tokenizes card)
const result = await molam.paymentIntents.confirm(
  intent.intent_reference,
  paymentMethodToken
);

console.log('Payment status:', result.status);
```

### PHP SDK

```php
<?php
require_once 'vendor/molam/molam-sdk/MolamSDK.php';

use Molam\MolamSDK;

$molam = new MolamSDK('sk_test_xxx');

// Create payment intent
$intent = $molam->paymentIntents->create([
  'amount' => 99.99,
  'currency' => 'USD',
  'customer_email' => 'customer@example.com',
  'description' => 'Order #12345'
]);

echo "Client secret: " . $intent['client_secret'];

// Confirm payment
$result = $molam->paymentIntents->confirm(
  $intent['intent_reference'],
  $paymentMethodToken
);

echo "Payment status: " . $result['status'];
```

### Python SDK

```python
from molam_sdk import MolamSDK

molam = MolamSDK('sk_test_xxx')

# Create payment intent
intent = molam.payment_intents.create(
    amount=99.99,
    currency='USD',
    customer_email='customer@example.com',
    description='Order #12345'
)

print(f"Client secret: {intent['client_secret']}")

# Confirm payment
result = molam.payment_intents.confirm(
    intent['intent_reference'],
    payment_method_token
)

print(f"Payment status: {result['status']}")
```

### Go SDK

```go
package main

import (
    "fmt"
    "molam"
)

func main() {
    client, _ := molam.NewClient("sk_test_xxx")

    // Create payment intent
    intent, _ := client.PaymentIntents.Create(&molam.PaymentIntentParams{
        Amount:        99.99,
        Currency:      "USD",
        CustomerEmail: "customer@example.com",
        Description:   "Order #12345",
    })

    fmt.Printf("Client secret: %s\n", intent["client_secret"])

    // Confirm payment
    result, _ := client.PaymentIntents.Confirm(
        intent["intent_reference"].(string),
        paymentMethodToken,
    )

    fmt.Printf("Payment status: %s\n", result["status"])
}
```

---

## 🔌 API Reference

### Base URL
```
Production: https://api.molam.com/form
Development: http://localhost:3000/form
```

### Authentication
All API requests require an Authorization header:
```
Authorization: Bearer {API_KEY}
```

### Endpoints

#### POST `/payment-intents`
Create a new payment intent.

**Request:**
```json
{
  "amount": 99.99,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "description": "Premium Plan",
  "metadata": {
    "order_id": "order_123"
  }
}
```

**Response:**
```json
{
  "id": "uuid",
  "intent_reference": "pi_xxx",
  "amount": 99.99,
  "currency": "USD",
  "status": "requires_payment_method",
  "client_secret": "pi_xxx_secret_yyy",
  "created_at": "2025-01-14T12:00:00Z"
}
```

#### GET `/payment-intents/:intent_id`
Retrieve a payment intent.

**Response:**
```json
{
  "id": "uuid",
  "intent_reference": "pi_xxx",
  "amount": 99.99,
  "currency": "USD",
  "status": "succeeded",
  "customer_email": "customer@example.com",
  "captured_at": "2025-01-14T12:05:00Z"
}
```

#### PATCH `/payment-intents/:intent_id`
Update a payment intent (confirm, capture, cancel).

**Request:**
```json
{
  "action": "confirm",
  "payment_method_token": "pm_test_xxx"
}
```

**Response:**
```json
{
  "id": "uuid",
  "intent_reference": "pi_xxx",
  "status": "processing"
}
```

#### POST `/api-keys`
Generate a new API key (requires `merchant_owner` or `admin` role).

**Request:**
```json
{
  "merchant_id": "merchant_abc123",
  "key_type": "publishable",
  "environment": "test"
}
```

**Response:**
```json
{
  "id": "uuid",
  "key_type": "publishable",
  "environment": "test",
  "api_key": "pk_test_1234567890abcdef",
  "warning": "Store this key securely. It will not be shown again."
}
```

#### GET `/api-keys?merchant_id=xxx`
List API keys for a merchant.

#### DELETE `/api-keys/:key_id`
Revoke an API key.

#### POST `/logs`
Create a telemetry log entry.

**Request:**
```json
{
  "event_type": "intent_created",
  "sdk_version": "1.0.0",
  "platform": "web",
  "payload": {
    "intent_reference": "pi_xxx"
  }
}
```

#### GET `/logs?merchant_id=xxx&limit=100`
List logs for a merchant.

---

## 💾 Database Schema

### Core Tables

**merchant_plugins**
- Tracks plugin installations per merchant
- Stores plugin configuration (JSONB)
- Supports versioning

**api_keys**
- Manages test/live API keys
- bcrypt-hashed keys
- Tracks usage (last_used_at)

**payment_intents**
- Stripe-like payment objects
- Status lifecycle: `requires_payment_method` → `processing` → `succeeded`/`canceled`
- Stores metadata and customer info

**plugin_logs**
- Telemetry events from SDKs
- Links to payment intents
- Stores SDK version and platform

**plugin_configs**
- Branding settings (colors, logo)
- Checkout settings (payment methods, locale)
- Per-merchant customization

**sdk_versions**
- Tracks available SDK versions
- Platform-specific versioning

### Helper Functions

**`generate_api_key(key_type, environment)`**
- Generates keys like `pk_test_xxx`, `sk_live_xxx`
- Returns key_prefix, key_suffix, key_hash

**`generate_intent_reference()`**
- Generates payment intent IDs like `pi_XXXX`

---

## ⚙️ Configuration

### Environment Variables

See [`.env.example`](.env.example) for all configuration options.

Key settings:
- `POSTGRES_*` - Database connection
- `JWT_SECRET` - Session security
- `CORS_ORIGIN` - Allowed origins
- `RATE_LIMIT_*` - Rate limiting
- `LOG_LEVEL` - Logging verbosity

### Checkout Customization

Via Merchant Dashboard or API:

```json
{
  "branding": {
    "primary_color": "#5469d4",
    "logo_url": "https://example.com/logo.png"
  },
  "checkout_settings": {
    "show_molam_branding": true,
    "payment_methods": ["card", "bank_transfer"],
    "locale": "en"
  }
}
```

---

## 🛠️ Development

### Project Structure

```
brique-94/
├── migrations/              # SQL schema migrations
├── src/
│   ├── routes/             # API routes
│   │   └── form.ts
│   ├── utils/              # Database utilities
│   │   └── db.ts
│   ├── sdk/                # SDK implementations
│   │   ├── web/           # JavaScript SDK
│   │   ├── mobile/        # Flutter SDK
│   │   └── server/        # Server SDKs (Node/PHP/Python/Go)
│   └── ui/                 # Merchant dashboard
│       └── merchant-dashboard/
├── package.json
├── tsconfig.json
├── docker-compose.yml
└── README.md
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
npm run format
```

### Database Migrations

```bash
npm run migrate
```

---

## 🚢 Deployment

### Docker Deployment

```bash
docker build -t molam-form-core .
docker run -p 3000:3000 --env-file .env molam-form-core
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests (deployment, service, ingress).

### Environment Variables (Production)

Ensure these are set in production:
- `NODE_ENV=production`
- Strong `JWT_SECRET`
- Database credentials
- CORS_ORIGIN with your domain
- CDN_URL for SDK hosting

---

## 🔒 Security

### Best Practices

1. **API Keys**
   - Never commit API keys to version control
   - Use test keys in development
   - Rotate keys regularly
   - Store secret keys server-side only

2. **HTTPS Only**
   - Always use HTTPS in production
   - Enforce secure cookies

3. **Rate Limiting**
   - Default: 100 requests per 15 minutes
   - Adjust per your needs

4. **Input Validation**
   - All inputs are validated
   - SQL injection prevention via parameterized queries

5. **PCI Compliance**
   - Card data never stored
   - Tokenization before transmission

---

## 🧪 Testing

### Test Cards

Use these cards in test mode:

| Card Number           | Scenario |
|-----------------------|----------|
| 4242 4242 4242 4242   | Success  |
| 4000 0000 0000 0002   | Decline  |
| 4000 0000 0000 9995   | Insufficient funds |

**Expiry:** Any future date (e.g., 12/25)
**CVC:** Any 3 digits (e.g., 123)

### API Testing

```bash
# Health check
curl http://localhost:3000/health

# Create payment intent
curl -X POST http://localhost:3000/form/payment-intents \
  -H "Authorization: Bearer sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "currency": "USD",
    "customer_email": "test@example.com"
  }'
```

---

## 📞 Support

- **Documentation:** [https://docs.molam.com](https://docs.molam.com)
- **GitHub Issues:** [https://github.com/molam/molam-form-core/issues](https://github.com/molam/molam-form-core/issues)
- **Email:** support@molam.com

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- Express.js
- PostgreSQL
- React
- Flutter
- TypeScript

---

**Made with ❤️ by the Molam Team**
