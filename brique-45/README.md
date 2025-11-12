# Brique 45 - Webhooks Industriels

**Multi-tenant Endpoints | Signature Rotation | Retry+DLQ | Ops Dashboard**

Système de webhooks industriel pour Molam Connect avec support multi-tenant, rotation de secrets avec grace period, retry intelligent avec backoff exponentiel, et Dead Letter Queue (DLQ).

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Connect (Brique 41) - Comptes marchands
├── Connect Payments (Brique 42) - Traitement paiements
├── Checkout Orchestration (Brique 43) - Vault & routing
├── Anti-fraude (Brique 44) - Real-time fraud detection
└── Webhooks Industriels (Brique 45) - Event delivery ✅ NOUVEAU
```

## Fonctionnalités

### Multi-tenancy
- **Endpoints** pour merchants, agents, internal apps
- **Isolation complète** par tenant_type + tenant_id
- **Souscriptions** par type d'événement (ex: payment.succeeded, refund.created)

### Sécurité
- **Signature HMAC SHA-256** (format compatible Stripe)
- **Rotation de secrets** avec grace period (versions actives + retiring)
- **Idempotence** via Idempotency-Key (delivery_id)
- **Anti-replay** avec tolérance d'horloge (5 minutes)

### Retry & Resilience
- **Backoff exponentiel** : 1m, 5m, 15m, 1h, 6h, 24h (6 tentatives)
- **Retry intelligent** : 2xx = succès, 429/5xx = retry, 4xx = échec immédiat
- **Dead Letter Queue (DLQ)** après épuisement des retries
- **Requeue manuel** depuis le dashboard Ops

### Observabilité
- **Historique immutable** de toutes les tentatives
- **Prometheus metrics** (taux succès, latence, DLQ)
- **Dashboard Ops** (Apple-inspired UI)

## Architecture

```
brique-45/
├── migrations/
│   └── 001_b45_webhooks.sql           # 7 tables (endpoints, secrets, events, deliveries, DLQ)
│
├── src/
│   ├── server.ts                      # Express API (port 8045)
│   │
│   ├── utils/
│   │   ├── db.ts                      # PostgreSQL connection
│   │   ├── kms.ts                     # Secret encryption (AES-256-GCM)
│   │   └── authz.ts                   # JWT auth + RBAC
│   │
│   ├── webhooks/
│   │   ├── router.ts                  # Admin API (create, rotate, pause)
│   │   ├── ops.ts                     # Ops API (retry, requeue, stats)
│   │   ├── secrets.ts                 # Secret management
│   │   ├── publisher.ts               # Event publishing
│   │   └── dispatcher.ts              # Worker (retry + DLQ)
│   │
│   ├── events/
│   │   └── payment-hooks.ts           # Event hooks (payment.*, refund.*, etc.)
│   │
│   └── examples/
│       └── receiver-verify.ts         # Signature verification (receiver side)
│
└── web/
    └── src/
        └── WebhooksDashboard.tsx      # React Ops UI
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (7 tables)
- **Signature**: HMAC SHA-256 (Stripe-compatible)
- **Encryption**: AES-256-GCM (KMS-ready)
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: RBAC (merchant_admin, pay_admin, ops_webhooks)
- **Observability**: Prometheus metrics
- **UI**: React (Ops dashboard)

## Installation

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 2. Install dependencies
```bash
cd brique-45
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - MOLAM_ID_JWT_PUBLIC
# - VAULT_DATA_KEY (generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

### 4. Create database
```bash
createdb molam_webhooks
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start services
```bash
# API Server
npm run dev  # Port 8045

# Dispatcher Worker (in separate terminal)
npm run worker:dispatcher
```

## API Endpoints

### Administration

- `POST /api/webhooks/endpoints` - Create endpoint
- `GET /api/webhooks/endpoints` - List endpoints
- `GET /api/webhooks/endpoints/:id` - Get endpoint details
- `POST /api/webhooks/endpoints/:id/rotate` - Rotate secret (grace period)
- `POST /api/webhooks/endpoints/:id/status` - Pause/Activate/Disable
- `PUT /api/webhooks/endpoints/:id/subscriptions` - Update event subscriptions
- `DELETE /api/webhooks/endpoints/:id` - Delete endpoint

### Ops (Monitoring & Manual Intervention)

- `GET /api/ops/webhooks/deliveries` - List deliveries
- `GET /api/ops/webhooks/deliveries/:id` - Get delivery details
- `POST /api/ops/webhooks/deliveries/:id/retry` - Manual retry
- `POST /api/ops/webhooks/deliveries/:id/requeue` - Requeue from DLQ
- `GET /api/ops/webhooks/deadletters` - List DLQ entries
- `GET /api/ops/webhooks/stats` - Dashboard statistics (24h)
- `GET /api/ops/webhooks/events` - List recent events

## Workflow

### 1. Create Endpoint

```bash
curl -X POST http://localhost:8045/api/webhooks/endpoints \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantType": "merchant",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://merchant.example.com/webhooks/molam",
    "description": "Production webhook endpoint",
    "region": "EU",
    "apiVersion": "2025-01",
    "events": ["payment.succeeded", "refund.created", "payout.paid"]
  }'
```

Response includes the secret (only shown once):
```json
{
  "endpoint": { "id": "...", "url": "...", ... },
  "secret_preview": "A8z9Xy…",
  "secret_full": "A8z9XyB7vC6w..." // Save securely!
}
```

### 2. Publish Event (from Checkout/Connect)

```typescript
import { publishEvent } from "./webhooks/publisher";

await publishEvent("merchant", merchantId, "payment.succeeded", {
  id: "pay_123",
  amount: 5000,
  currency: "USD",
  customer_id: "cus_456",
  method: "card",
  country: "US",
  created: "2025-01-15T10:30:00Z"
});
```

### 3. Dispatcher Processes Delivery

```
Event → Find subscribed endpoints → Create deliveries → Dispatcher worker:
  1. Fetch pending/failed deliveries (batch 50)
  2. For each delivery:
     - Sign payload with HMAC SHA-256
     - Send HTTP POST with Molam-Signature header
     - If success (2xx): mark succeeded
     - If retriable error (429/5xx): schedule retry with backoff
     - If max retries: move to DLQ (quarantine)
```

### 4. Receiver Verifies Signature

```typescript
import { verifyMolamSignature } from "@molam/webhook-verify";

const isValid = verifyMolamSignature(
  req.headers,
  req.rawBody, // Buffer
  (kid) => secrets[kid] // Get secret by version
);

if (isValid) {
  // Process event
  res.status(200).json({ received: true });
}
```

## Signature Format

### Sender (Molam)

```
Molam-Signature: t=1705318200000,v1=a8b9c0d1...,kid=2
```

- `t`: Unix timestamp (ms)
- `v1`: HMAC SHA-256 hex of `${t}.${rawBody}`
- `kid`: Secret version (key ID)

### Receiver Verification

```typescript
const message = `${t}.${rawBody}`;
const computed = crypto.createHmac("sha256", secret).update(message).digest("hex");
if (v1 !== computed) throw new Error("signature mismatch");
if (Math.abs(Date.now() - t) > 5*60*1000) throw new Error("timestamp outside tolerance");
```

## Secret Rotation (Grace Period)

```bash
curl -X POST http://localhost:8045/api/webhooks/endpoints/{id}/rotate \
  -H "Authorization: Bearer $TOKEN"
```

**Comportement**:
- Nouvelle clé (version N) créée avec `status='active'`
- Ancienne clé (version N-1) passe en `status='retiring'`
- Les deux clés sont valides pendant la grace period
- Permet de déployer la nouvelle clé sans downtime

## Retry Strategy

| Attempt | Backoff | Total Wait |
|---------|---------|------------|
| 1       | 1 min   | 1 min      |
| 2       | 5 min   | 6 min      |
| 3       | 15 min  | 21 min     |
| 4       | 1 hour  | 1h 21min   |
| 5       | 6 hours | 7h 21min   |
| 6       | 24 hours| 31h 21min  |
| 7+      | DLQ     | Quarantined|

**Retry Logic**:
- `2xx` → Success (stop)
- `408, 409, 425, 429` → Retry
- `5xx` → Retry
- `4xx` (except above) → Fail immediately (no retry)
- Network error → Retry
- Max retries → DLQ (manual intervention required)

## Metrics

Available at `/metrics`:

```
# Deliveries
b45_deliveries_total{status,tenant_type}
b45_delivery_attempts_total{status}
b45_delivery_latency_ms{status}

# DLQ
b45_deadletters_total{reason}

# Events
b45_events_published_total{type,tenant_type}

# Endpoints
b45_endpoints_total{status,tenant_type}
```

## Security & Compliance

### RBAC Roles

- **merchant_admin**: Create/manage own endpoints, rotate secrets
- **pay_admin**: Manage all endpoints, access Ops dashboard
- **ops_webhooks**: Retry/requeue deliveries, view DLQ
- **auditor**: Read-only access to all webhook data

### Data Protection

- **Secrets encrypted** at rest (AES-256-GCM with KMS)
- **HTTPS only** for webhook URLs (enforced)
- **Signature required** (cannot disable)
- **Audit trail** immutable (all delivery attempts logged)

### Idempotence & Anti-Replay

- `Idempotency-Key` header = delivery_id (receiver should cache 24h)
- Timestamp tolerance = 5 minutes (prevent replay attacks)
- Delivery uniqueness constraint: (event_id, endpoint_id)

## SLO

- **p95 dispatch latency**: < 2s post-event
- **Success rate**: > 99.9% within 24h (retries included)
- **DLQ processing**: Manual requeue < 1h

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Start dispatcher worker
npm run worker:dispatcher

# View metrics
curl http://localhost:8045/metrics
```

## Ops Dashboard

React UI at `/dashboard` (pay_admin, ops_webhooks roles required):

- **Endpoints**: Create, rotate, pause/activate, view subscriptions
- **Deliveries**: Monitor status, retry manually, view attempts history
- **DLQ**: Requeue quarantined deliveries
- **Stats**: 24h metrics (success rate, pending, failed, DLQ count)

## Integration Examples

### Checkout (Brique 43)

```typescript
import { onPaymentSucceeded } from "../events/payment-hooks";

// After successful payment capture
await onPaymentSucceeded(merchantId, payment);
// → Publishes 'payment.succeeded' event
// → Dispatcher sends to subscribed endpoints
```

### Connect (Brique 42)

```typescript
import { onPayoutPaid } from "../events/payment-hooks";

// After payout completed
await onPayoutPaid(merchantId, payout);
// → Publishes 'payout.paid' event
```

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
