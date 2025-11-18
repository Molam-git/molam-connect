# Brique 99 — Universal Plugins Ecosystem

**Version**: 1.0.0
**Status**: ✅ **PRODUCTION READY**
**Dependencies**: PostgreSQL, AWS KMS, Molam Connect, Molam ID

---

## 📋 Overview

Brique 99 enables **plug-and-play installation** of Molam Form payments across major e-commerce platforms with zero configuration. Merchants connect via OAuth, eliminating manual key management and complex setup.

### Key Benefits

✅ **One-Click Install** - No manual configuration required
✅ **OAuth 2.0 Secured** - Professional authorization flow
✅ **Auto-Provisioned Webhooks** - Signed and validated automatically
✅ **Test/Live Switching** - One click from dashboard
✅ **Centralized Management** - All plugins controlled from Molam Dashboard
✅ **Multi-Platform Support** - WooCommerce, Shopify, Magento, and more
✅ **Universal JS SDK** - Works on any website

---

## 🎯 Supported Platforms

### Production Ready
- ✅ **WooCommerce** (PHP plugin, complete)
- ✅ **Generic Websites** (JavaScript SDK)

### Coming Soon
- ⏳ Shopify (Node.js app)
- ⏳ Magento (PHP module)
- ⏳ PrestaShop (PHP module)
- ⏳ Wix (Widget)
- ⏳ Squarespace (Widget)

---

## 🚀 Quick Start

### For Merchants (WooCommerce)

1. **Log in** to Molam Dashboard
2. **Navigate** to Plugins section
3. **Click** "Install WooCommerce Plugin"
4. **Download** plugin ZIP file
5. **Upload** to WordPress (Plugins → Add New → Upload)
6. **Activate** plugin
7. **Click** "Connect with Molam" in WooCommerce settings
8. **Authorize** in OAuth popup
9. **Done!** Start accepting payments

### For Developers (Generic Website)

```html
<!-- Include SDK -->
<script src="https://cdn.molam.com/sdk/molam-sdk.min.js"></script>

<!-- Checkout container -->
<div id="molam-checkout"></div>

<script>
// Initialize
MolamSDK.init({
  integrationId: 'your_integration_id',
  apiBase: 'https://api.molam.com'
});

// Render checkout
MolamSDK.renderCheckout('#molam-checkout', {
  amount: 5000,
  currency: 'XOF',
  orderId: 'order_123'
});
</script>
```

---

## 🏗️ Architecture

### Components

1. **Backend API** - OAuth server and plugin management
2. **Database** - Plugin integrations and sync logs
3. **CMS Plugins** - Platform-specific implementations
4. **JS SDK** - Universal client-side library
5. **Dashboard** - Centralized plugin management

### Security

- **OAuth 2.0**: Industry-standard authorization
- **KMS Encryption**: All secrets encrypted at rest
- **Webhook Signatures**: HMAC-SHA256 verification
- **Role-Based Access**: Merchant admin, pay admin roles
- **Audit Logging**: Complete installation/sync history

---

## 📡 API Reference

### OAuth Flow

**1. Initiate OAuth**
```http
POST /api/plugins/oauth/start
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "cms_type": "woocommerce",
  "site_url": "https://shop.example.com",
  "redirect_uri": "https://shop.example.com/wp-admin/admin.php?page=molam-oauth"
}
```

**Response**:
```json
{
  "success": true,
  "integration_id": "uuid",
  "auth_url": "https://auth.molam.com/authorize?...",
  "client_id": "molam_woocommerce_xxxxx",
  "webhook_url": "https://api.molam.com/webhooks/plugins/uuid/webhook",
  "webhook_secret": "secret_xxxxx"
}
```

**2. Complete OAuth**
```http
POST /api/plugins/oauth/callback
Content-Type: application/json

{
  "integration_id": "uuid",
  "code": "auth_code_from_oauth"
}
```

### Plugin Management

**List Integrations**
```http
GET /api/plugins
Authorization: Bearer {jwt}
```

**Get Integration Details**
```http
GET /api/plugins/{id}
Authorization: Bearer {jwt}
```

**Switch Mode**
```http
POST /api/plugins/{id}/set-mode
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "mode": "live"
}
```

**Sync Configuration**
```http
POST /api/plugins/{id}/sync
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "sync_type": "payment_methods"
}
```

**Revoke Access**
```http
DELETE /api/plugins/{id}
Authorization: Bearer {jwt}
```

---

## 🔒 Webhook Security

### Signature Verification

All webhooks include `Molam-Signature` header:

```
Molam-Signature: t=1640995200000,v1=abc123...,kid=v1
```

**Verify signature:**

```php
function verifyWebhookSignature($payload, $signature, $secret) {
    $parts = parseSigHeader($signature); // Extract t, v1, kid

    // Check timestamp (5 min window)
    if (abs(time() * 1000 - $parts['t']) > 300000) {
        return false;
    }

    // Compute HMAC
    $expected = hash_hmac('sha256', $parts['t'] . '.' . $payload, $secret);

    // Compare
    return hash_equals($expected, $parts['v1']);
}
```

### Idempotency

Store `event.id` to prevent duplicate processing:

```sql
CREATE TABLE webhook_logs (
    event_id TEXT UNIQUE,
    processed_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🧪 Testing

### Test Mode

- Use sandbox API keys
- Test webhook endpoint
- Mock payments (no real charges)
- Full logging enabled

### Live Mode Requirements

- ✅ Merchant KYC verified
- ✅ Business details complete
- ✅ Bank account linked
- ✅ Test payments successful

---

## 📊 Database Schema

### Key Tables

**plugin_integrations** - Core plugin connections
```sql
CREATE TABLE plugin_integrations (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  cms_type TEXT NOT NULL,
  site_url TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL UNIQUE,
  oauth_client_secret_cipher BYTEA NOT NULL,
  webhook_endpoint_id UUID,
  mode TEXT DEFAULT 'test',
  status TEXT DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**plugin_sync_logs** - Sync tracking
```sql
CREATE TABLE plugin_sync_logs (
  id UUID PRIMARY KEY,
  integration_id UUID NOT NULL,
  sync_type TEXT NOT NULL,
  sync_direction TEXT NOT NULL,
  status TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**plugin_installation_logs** - Audit trail
```sql
CREATE TABLE plugin_installation_logs (
  id UUID PRIMARY KEY,
  integration_id UUID,
  merchant_id UUID NOT NULL,
  action TEXT NOT NULL,
  cms_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🛠️ WooCommerce Plugin

### Installation

1. Download `molam-form-woocommerce.zip` from Molam Dashboard
2. Upload to WordPress (Plugins → Add New → Upload Plugin)
3. Activate plugin
4. Go to WooCommerce → Settings → Payments → Molam
5. Click "Connect with Molam"
6. Authorize in OAuth popup

### Features

- ✅ Hosted checkout page
- ✅ Inline 3DS/OTP support
- ✅ Refund handling (partial/full)
- ✅ Multi-currency
- ✅ Webhook signature verification
- ✅ Comprehensive logging
- ✅ Test/live mode switching

### Files Structure

```
molam-form-woocommerce/
├── molam-form-woocommerce.php      # Main plugin file
├── includes/
│   ├── class-wc-gateway-molam.php  # Gateway class
│   └── admin-settings.php          # Admin UI
├── assets/
│   ├── js/
│   │   └── molam-sdk.js            # Frontend SDK
│   └── css/
│       └── admin.css               # Admin styles
├── webhook/
│   └── webhook.php                 # Webhook receiver
└── sql/
    └── migrations.sql              # Database tables
```

---

## 🌐 Generic JS SDK

### Features

- Vanilla JavaScript (no dependencies)
- Payment intent creation
- Checkout widget rendering
- 3DS/OTP handling
- Event callbacks

### API

```javascript
// Initialize
MolamSDK.init(config)

// Create payment intent
await MolamSDK.createPaymentIntent(orderId)

// Confirm payment
await MolamSDK.confirmPayment(intent)

// Render checkout widget
MolamSDK.renderCheckout(selector, options)

// Event handlers
MolamSDK.onSuccess(callback)
MolamSDK.onError(callback)
```

---

## 📚 Documentation

- [Installation Guide](./docs/INSTALLATION.md)
- [API Reference](./docs/API.md)
- [WooCommerce Guide](./docs/WOOCOMMERCE.md)
- [Security Best Practices](./docs/SECURITY.md)
- [Webhook Implementation](./docs/WEBHOOKS.md)
- [Implementation Summary](./BRIQUE_99_SUMMARY.md)

---

## 🔧 Development

### Setup

```bash
# Install dependencies
npm install

# Run database migrations
psql -U molam -d molam_plugins -f migrations/001_create_plugin_integrations.sql

# Start dev server
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Test WooCommerce plugin
npm run test:woocommerce

# Test JS SDK
npm run test:sdk
```

---

## 🚢 Deployment

### Requirements

- Node.js 16+
- PostgreSQL 13+
- AWS KMS access
- SSL certificates

### Environment Variables

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=molam_plugins
POSTGRES_USER=molam
POSTGRES_PASSWORD=***

# OAuth
MOLAM_OAUTH_URL=https://auth.molam.com
MOLAM_WEBHOOK_BASE=https://api.molam.com/webhooks

# KMS
AWS_REGION=us-east-1
KMS_KEY_ID=alias/molam-plugins

# API
API_PORT=8099
NODE_ENV=production
```

### Deployment Steps

See [DEPLOYMENT_GUIDE.md](./docs/DEPLOYMENT_GUIDE.md) for complete instructions.

---

## 📈 Monitoring

### Metrics

- Plugin installations per day
- Active integrations by CMS type
- OAuth success rate
- Webhook delivery rate
- Payment success rate

### Alerts

- Failed webhook deliveries
- OAuth failures
- Plugin errors
- Security events

---

## 🐛 Troubleshooting

### Common Issues

**OAuth fails**
- Check redirect URI matches exactly
- Verify merchant has proper permissions
- Check KYC status for live mode

**Webhooks not received**
- Verify webhook URL accessible
- Check signature verification
- Review webhook logs

**Payments failing**
- Check mode (test/live)
- Verify API keys active
- Review payment logs

---

## 📞 Support

**Team**: Platform Team + Plugin Team

**Slack**: `#platform-plugins`

**Email**: plugins@molam.co

**Documentation**: https://docs.molam.com/plugins

---

## 📝 License

**Proprietary** - Molam
Copyright © 2025 Molam. All rights reserved.

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
**Authors**: Platform Team
