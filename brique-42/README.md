# Brique 42 - Molam Connect Payments

**Payment Intents, Charges, Refunds & Real-Time Dashboard**

Molam Connect Payments est la brique de traitement des paiements pour l'écosystème Molam. Elle gère le cycle de vie complet des paiements : intents, charges, refunds, webhooks et dashboard temps réel.

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Molam Wallet (Brique 33) - Comptes utilisateurs
├── Molam Connect (Brique 41) - Comptes marchands
└── Molam Connect Payments (Brique 42) - Traitement des paiements
```

## Fonctionnalités

### Paiements
- **Payment Intents**: Sessions de paiement avec idempotence
- **Charges**: Autorisation et capture (automatique ou manuelle)
- **Refunds**: Remboursements complets ou partiels
- **Multi-rail**: Wallet, Cartes, Bank transfers

### Sécurité & Risque
- **SIRA Scoring**: Scoring temps réel de chaque transaction
- **Risk Labels**: low, normal, elevated, high, blocked
- **Fraud Prevention**: Blocage automatique des transactions à haut risque
- **3-Day Hold Minimum**: Minimum obligatoire de 3 jours avant payout

### Temps Réel
- **Event Outbox**: Système d'événements temps réel
- **Webhooks**: Livraison garantie avec retries exponentiels
- **SSE Dashboard**: Tableau de bord en temps réel (optional)

### Ops Control
- **Live Configuration**: Modification à chaud des paramètres
- **Settlement Rules**: Règles de versement (hebdo/mensuel/manuel)
- **Payout Eligibility**: Calcul automatique de l'éligibilité

## Architecture

```
brique-42/
├── migrations/                       # SQL migrations
│   └── 001_b42_connect_payments.sql  # 7 tables
│
├── src/
│   ├── server.ts                     # Express server (port 8042)
│   ├── db.ts, auth.ts, rbac.ts       # Core infrastructure
│   │
│   ├── routes/                       # API routes
│   │   ├── intents.ts                # Payment intents
│   │   └── refunds.ts                # Refunds
│   │
│   └── services/                     # Business services
│       ├── events.ts                 # Event outbox system
│       └── sira.ts                   # Risk scoring
│
└── workers/                          # Background jobs
    ├── webhook-delivery.ts           # Webhook delivery with retries
    └── payouts-eligibility.ts        # Payout eligibility calculation
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: Helmet, rate limiting, RBAC
- **Observability**: Pino (logging) + Prometheus (metrics)
- **Real-time**: Redis + SSE (Server-Sent Events)
- **Internationalization**: English, French, Wolof
- **UI**: React (webhooks manager)

## Installation

1. **Clone & navigate**:
   ```bash
   cd brique-42
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env
   ```

4. **Run migrations**:
   ```bash
   npm run migrate
   ```

5. **Start the server**:
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

## API Endpoints

### Payment Intents

- `POST /api/connect/intents` - Create payment intent
- `POST /api/connect/intents/:id/confirm` - Confirm and charge
- `POST /api/connect/intents/:id/capture` - Capture (manual mode)
- `POST /api/connect/intents/:id/cancel` - Cancel intent
- `GET /api/connect/intents/:id` - Get intent details
- `GET /api/connect/intents` - List intents

### Refunds

- `POST /api/connect/refunds` - Create refund
- `GET /api/connect/refunds/:id` - Get refund details
- `GET /api/connect/refunds` - List refunds

## Workflow

### Automatic Capture (recommended)

```
1. Create Intent → 2. Confirm → ✅ Captured
```

```bash
# 1. Create intent
curl -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "uuid-account",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "automatic"
  }'

# 2. Confirm (auto-captures)
curl -X POST http://localhost:8042/api/connect/intents/{id}/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": {
      "type": "wallet",
      "details": {"wallet_id": "uuid-wallet"}
    }
  }'
```

### Manual Capture

```
1. Create Intent → 2. Confirm (auth only) → 3. Capture → ✅ Captured
```

```bash
# 1. Create intent (manual capture)
curl -X POST http://localhost:8042/api/connect/intents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connect_account_id": "uuid-account",
    "amount": 1000.00,
    "currency": "XOF",
    "capture_method": "manual"
  }'

# 2. Confirm (authorization only)
curl -X POST http://localhost:8042/api/connect/intents/{id}/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": {
      "type": "card",
      "details": {"card_token": "tok_xxx"}
    }
  }'

# 3. Capture later
curl -X POST http://localhost:8042/api/connect/intents/{id}/capture \
  -H "Authorization: Bearer $TOKEN"
```

## Risk & Fraud (SIRA)

Chaque transaction est automatiquement scorée :

| Score | Label | Action |
|-------|-------|--------|
| 0.0-0.3 | low | Proceed |
| 0.3-0.6 | normal | Proceed |
| 0.6-0.8 | elevated | Proceed + 3 days extra hold |
| 0.8-0.95 | high | Proceed + 7 days extra hold |
| 0.95+ | blocked | **BLOCKED** |

### Payout Hold Periods

- **Base**: Minimum 3 jours (obligatoire)
- **Normal risk**: 3 jours
- **Elevated risk**: 3 + 3 = 6 jours
- **High risk**: 3 + 7 = 10 jours

## Workers

### Webhook Delivery
Livre les webhooks avec retries exponentiels:
```bash
npm run worker:webhook-delivery
```

**Cron**: Toutes les minutes
```cron
* * * * * cd /path/to/brique-42 && npm run worker:webhook-delivery
```

### Payout Eligibility
Calcule l'éligibilité des charges pour payout:
```bash
npm run worker:payout-eligibility
```

**Cron**: Toutes les heures
```cron
0 * * * * cd /path/to/brique-42 && npm run worker:payout-eligibility
```

### Events Dispatcher
Route les événements vers les webhooks:
```bash
npm run worker:dispatcher
```

**Mode**: Service continu (systemd/pm2)

### SSE Broker
Publie les événements en temps réel via Redis:
```bash
npm run worker:sse-broker
```

**Mode**: Service continu (systemd/pm2)

## Events Emitted

| Event | Description |
|-------|-------------|
| `payment.intent.created` | Intent créé |
| `payment.charge.authorized` | Charge autorisée |
| `payment.charge.captured` | Charge capturée |
| `payment.intent.canceled` | Intent annulé |
| `payment.refund.succeeded` | Remboursement réussi |
| `payment.refund.failed` | Remboursement échoué |

## Intégrations

### Brique 41 (Connect Accounts)
- Comptes marchands
- Webhooks endpoints
- Settlement rules

### Brique 33 (Wallet)
- Paiements wallet
- Transferts internes

### Briques 34-35 (Treasury)
- Payouts automatiques
- Versements bancaires

## Security

- **JWT Authentication**: RS256 tokens
- **RBAC**: Role-based access control
- **Event Outbox**: Transactional guarantees
- **Idempotency**: External keys for safe retries
- **Rate Limiting**: 800 req/min per IP
- **3-Day Minimum Hold**: Anti-fraud protection

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run tests (to be implemented)
npm test

# View metrics (Prometheus)
curl http://localhost:8042/metrics
```

## Observability

- **Logs**: Structured JSON via Pino (pretty-print in dev)
- **Metrics**: Prometheus format at `/metrics`
- **Dashboards**: Import Grafana dashboards from `/docs/grafana`
- **Tracing**: Transaction IDs in all logs

## Internationalization

Supported languages:
- **en** - English (US, GB)
- **fr** - French (FR, SN)
- **sn** - Wolof (Senegal)

Supported currencies:
- USD, EUR, XOF (West African CFA), XAF (Central African CFA), GBP

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
