# Brique 43 - Checkout & Payment Methods Orchestration

**Payment Method Vault | Intelligent Routing | 3DS/OTP Challenges | Webhook System**

Molam Checkout Orchestration est la brique qui gère la tokenisation sécurisée des méthodes de paiement, le routing intelligent entre wallet/card/bank avec fallback automatique, et les challenges d'authentification forte (3DS, OTP, redirects bancaires).

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Molam Wallet (Brique 33) - Paiements wallet
├── Molam Connect (Brique 41) - Comptes marchands
├── Molam Connect Payments (Brique 42) - Traitement paiements
└── Checkout Orchestration (Brique 43) - Routing & méthodes de paiement
```

## Fonctionnalités

### Payment Method Vault
- **Tokenisation sécurisée**: Vault avec chiffrement AES-256-GCM
- **One-click payments**: Customer tokens pour paiements récurrents
- **Multi-méthodes**: Card, Wallet, Bank transfers
- **PCI-DSS ready**: Aucune donnée sensible en clair

### Intelligent Routing
- **SIRA-based**: Routing optimal basé sur pays/devise/montant/risque
- **Fallback automatique**: Tentatives successives si échec
- **Multi-rail**: Wallet → Card → Bank avec fees optimisés
- **Availability check**: Vérifie disponibilité des routes par région

### Strong Authentication
- **3DS v2**: Authentification carte avec ACS redirect
- **OTP**: Code SMS/Email pour wallet high-value
- **Bank Links**: Redirects sécurisés pour virements bancaires
- **Challenge expiry**: Gestion automatique des expirations

### Webhooks & Real-time
- **Event-driven**: Tous les événements du cycle de vie
- **HMAC signatures**: Webhooks signés pour sécurité
- **Retry logic**: Retries exponentiels jusqu'à 8 tentatives
- **SSE Dashboard**: Temps réel pour monitoring

## Architecture

```
brique-43/
├── migrations/
│   └── 001_b43_checkout_orchestration.sql   # 10 tables
│
├── src/
│   ├── server.ts                             # Express server (port 8043)
│   │
│   ├── utils/
│   │   ├── db.ts                             # PostgreSQL pool
│   │   ├── crypto.ts                         # AES-GCM encryption
│   │   ├── authz.ts                          # JWT + API keys
│   │   ├── i18n.ts                           # Locale context
│   │   └── metrics.ts                        # Prometheus
│   │
│   ├── core/
│   │   └── orchestrator.ts                   # Routing logic, SIRA, fees
│   │
│   └── routes/
│       ├── intents.ts                        # Payment intents
│       ├── methods.ts                        # Vault & tokens
│       ├── webhooks.ts                       # Webhook management
│       └── sse.ts                            # Real-time dashboard
│
├── workers/
│   ├── webhook-dispatcher.ts                 # Webhook delivery
│   └── challenge-expiry.ts                   # Expire pending challenges
│
└── sdk/
    ├── molam-connect.js                      # Web SDK
    └── molam-connect.css                     # Apple-like UI
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with uuid-ossp + pgcrypto
- **Authentication**: JWT (RS256) via Molam ID + Merchant API Keys
- **Encryption**: AES-256-GCM for payment method vault
- **Security**: Helmet, rate limiting, HMAC webhooks
- **Observability**: Prometheus metrics
- **SDK**: Vanilla JavaScript with Apple-like CSS

## Installation

### 1. Clone & navigate
```bash
cd brique-43
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env:
# - DATABASE_URL
# - MOLAM_ID_JWT_PUBLIC
# - VAULT_DATA_KEY (generate with crypto.randomBytes(32).toString('base64'))
```

### 4. Create database
```bash
createdb molam_checkout
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start server
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

**API disponible sur**: `http://localhost:8043`

## API Endpoints

### Payment Methods (Vault)
- `POST /api/connect/methods/vault` - Vault a payment method, return customer token

### Payment Intents
- `POST /api/connect/intents` - Create payment intent with SIRA hint
- `POST /api/connect/intents/:id/confirm` - Attach PM and confirm (starts routing)
- `POST /api/connect/intents/:id/challenge/:challengeId/complete` - Complete 3DS/OTP/Link
- `POST /api/connect/intents/:id/capture` - Capture (manual mode)
- `POST /api/connect/intents/:id/cancel` - Cancel intent
- `GET /api/connect/intents/:id` - Get intent details
- `GET /api/connect/intents` - List intents

### Webhooks
- `POST /api/connect/webhooks/endpoints` - Create webhook endpoint
- `GET /api/connect/webhooks/endpoints` - List endpoints
- `DELETE /api/connect/webhooks/endpoints/:id` - Delete endpoint

### Real-time
- `GET /api/connect/sse/events` - SSE stream for dashboard

### Monitoring
- `GET /healthz` - Health check
- `GET /metrics` - Prometheus metrics

## Workflow Example

### 1. Vault Payment Method

```bash
curl -X POST http://localhost:8043/api/connect/methods/vault \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pm_type": "card",
    "brand": "visa",
    "customer_ref": "cust_123",
    "holder_name": "John Doe",
    "sensitive": {
      "pan": "4242424242424242",
      "exp_month": 12,
      "exp_year": 2030,
      "cvc": "123"
    },
    "meta": {
      "issuer_country": "US"
    }
  }'

# Response: { "token": "tok_xxx", "last4": "4242", ... }
```

### 2. Create Payment Intent

```bash
curl -X POST http://localhost:8043/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 49.90,
    "currency": "USD",
    "description": "Order #A1001"
  }'

# Response includes SIRA hint with preferred_route
```

### 3. Confirm Intent (Automatic Routing)

```bash
curl -X POST http://localhost:8043/api/connect/intents/$INTENT_ID/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pm_token": "tok_xxx",
    "capture_method": "automatic"
  }'

# If 3DS required:
# Response: { "status": "requires_action", "challenge": {...} }
```

### 4. Complete Challenge (if needed)

```bash
curl -X POST http://localhost:8043/api/connect/intents/$INTENT_ID/challenge/$CHALLENGE_ID/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "result": "passed"
  }'

# If challenge passes: status becomes "processing"
# If challenge fails: attempts next route in fallback list
```

## Routing Logic

### SIRA Hints

For each payment intent, SIRA determines:
1. **Preferred route** (wallet/card/bank) based on:
   - Currency (XOF → wallet, EUR → bank/card, USD → card)
   - Country (West Africa → wallet, Europe → bank)
   - Amount (high amounts → more secure routes)

2. **Risk score** (low/med/high) based on amount
3. **3DS requirement** (required/recommended/off)

### Fallback Order

If preferred route fails (e.g., 3DS failed), system tries next route:

```
Wallet preferred: wallet → card → bank
Card preferred:   card → wallet → bank
Bank preferred:   bank → card → wallet
```

### Fees by Route

| Route | Fee Structure | Best For |
|-------|---------------|----------|
| Wallet | 0.9% | Africa, low fees |
| Card | 2.25% + 0.23 | Global, instant |
| Bank | 0.5% + 0.30 | Europe (SEPA), large amounts |

## Workers

### Webhook Dispatcher
Delivers webhooks with exponential backoff:

```bash
npm run worker:webhook-dispatcher
```

**Run as**: Continuous service (systemd/pm2)

### Challenge Expiry
Expires pending challenges after timeout:

```bash
npm run worker:challenge-expiry
```

**Run as**: Continuous service (systemd/pm2) or cron every minute

## Security

### Encryption
- **Payment methods**: AES-256-GCM with 32-byte key
- **Format**: `[12 bytes IV][16 bytes Auth Tag][N bytes encrypted data]`
- **HSM-ready**: Can integrate with AWS KMS, Azure Key Vault, etc.

### Authentication
- **JWT**: Molam ID RS256 tokens (preferred)
- **API Keys**: SHA-256 hashed, server-to-server only
- **Scopes**: payments:write, payments:read, webhooks:write, webhooks:read

### Webhooks
- **HMAC-SHA256**: Signatures in `Molam-Signature` header
- **Secrets**: Unique per endpoint
- **Retry logic**: Up to 8 retries with exponential backoff

### Audit
- **Immutable logs**: All operations logged to audit_logs table
- **Actor tracking**: service, merchant_user, ops_user
- **Reference tracking**: Links to intent/attempt/challenge/webhook

## SDK Integration

### Web SDK (Vanilla JS)

```html
<script src="/sdk/molam-connect.js"></script>
<link rel="stylesheet" href="/sdk/molam-connect.css">

<div class="molam-card" id="checkout">
  <div class="molam-row">
    <input id="cardNumber" class="molam-input" placeholder="Card number" />
    <input id="exp" class="molam-input" placeholder="MM/YY" />
    <input id="cvc" class="molam-input" placeholder="CVC" />
  </div>
  <button id="pay" class="molam-btn">Pay</button>
</div>

<script>
(async function(){
  const intent = await MolamCheckout.createIntent({
    amount: 49.90,
    currency: "USD",
    description: "Order #A1001"
  });

  document.getElementById("pay").onclick = async () => {
    const pm = await MolamCheckout.vault({
      pm_type: "card",
      brand: "visa",
      customer_ref: "cust_123",
      holder_name: "J DOE",
      sensitive: {
        pan: "4242424242424242",
        exp_month: 12,
        exp_year: 2030,
        cvc: "123"
      }
    });

    const conf = await MolamCheckout.confirmIntent(intent.id, { pmToken: pm.token });

    if (conf.status === "requires_action") {
      // Redirect to 3DS or show OTP modal
      await MolamCheckout.completeChallenge(conf.intent_id, conf.challenge.id, "passed");
    }
  };
})();
</script>
```

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run tests (to be implemented)
npm test

# View metrics
curl http://localhost:8043/metrics
```

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
