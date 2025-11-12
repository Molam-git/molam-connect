# Brique 44 - Anti-fraude Temps Réel

**SIRA Integration | Real-time Scoring | Kafka Workers | Ops Dashboard**

Système de détection de fraude en temps réel pour Molam Connect, intégrant le scoring IA SIRA, des workers Kafka pour évaluation instantanée, et un dashboard Ops pour review manuelle.

## Position dans l'écosystème

```
Molam Pay (Module majeur)
├── Molam ID - Authentification & device tracking
├── Checkout Orchestration (Brique 43) - Payment methods & routing
└── Anti-fraude (Brique 44) - Real-time fraud detection ✅ NOUVEAU
```

## Fonctionnalités

### Scoring Multi-sources
- **Molam ID**: Device fingerprint, IP, KYC status
- **Connect**: Transaction history, velocity, amount
- **Network**: IP geolocation, ASN, proxy detection
- **SIRA AI**: Machine learning risk scoring

### Décisions Automatiques
- **allow** (< 60): Transaction autorisée automatiquement
- **review** (60-79): Mise en queue pour review manuelle Ops
- **block** (≥ 80): Transaction refusée instantanément

### Détection Temps Réel
- **Kafka Consumer**: Évalue chaque transaction au moment de création
- **Sub-second latency**: < 100ms pour scoring complet
- **Fallback**: Continue sans SIRA si indisponible

### Ops Dashboard
- **Review Queue**: Transactions suspectes à vérifier manuellement
- **Override**: Allow/Block manuel par fraud_ops
- **Analytics**: Métriques de fraude, faux positifs/négatifs
- **Blacklist Management**: IP, cards, devices, users

## Architecture

```
brique-44/
├── migrations/
│   └── 001_b44_fraud_detection.sql      # 7 tables
│
├── src/
│   ├── server.ts                         # Express API (port 8044)
│   │
│   ├── services/
│   │   ├── scoring.ts                    # Main scoring engine
│   │   └── sira.ts                       # SIRA AI integration
│   │
│   ├── routes/
│   │   ├── fraud.ts                      # Fraud evaluation API
│   │   ├── reviews.ts                    # Manual review queue
│   │   └── blacklist.ts                  # Blacklist management
│   │
│   ├── workers/
│   │   ├── fraud-consumer.ts             # Kafka real-time consumer
│   │   └── metrics-aggregator.ts         # Daily metrics aggregation
│   │
│   └── utils/
│       ├── db.ts                         # PostgreSQL pool
│       └── kafka.ts                      # Kafka client
│
└── web/
    └── src/
        └── FraudDashboard.tsx            # React Ops UI
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (7 tables)
- **Streaming**: Kafka for real-time events
- **AI**: SIRA integration for ML scoring
- **Authentication**: JWT (RS256) via Molam ID
- **Security**: RBAC (fraud_ops, auditor roles)
- **Observability**: Prometheus metrics
- **UI**: React (Ops dashboard)

## Installation

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Kafka (or compatible)
- SIRA service (optional)

### 2. Install dependencies
```bash
cd brique-44
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with:
# - DATABASE_URL
# - KAFKA_BROKERS
# - SIRA_URL (if using SIRA)
# - MOLAM_ID_JWT_PUBLIC
```

### 4. Create database
```bash
createdb molam_fraud
```

### 5. Run migrations
```bash
npm run migrate
```

### 6. Start services
```bash
# API Server
npm run dev  # Port 8044

# Kafka Worker (in separate terminal)
npm run worker:kafka-consumer

# Metrics Aggregator (optional)
npm run worker:metrics-aggregator
```

## API Endpoints

### Fraud Evaluation
- `POST /api/fraud/evaluate` - Evaluate transaction (sync)
- `GET /api/fraud/decisions/:txnId` - Get decision for transaction
- `GET /api/fraud/decisions` - List decisions (paginated)

### Manual Review
- `GET /api/fraud/reviews` - Get review queue
- `POST /api/fraud/reviews/:id/assign` - Assign review to agent
- `POST /api/fraud/reviews/:id/decide` - Manual decision (allow/block)
- `GET /api/fraud/reviews/stats` - Review queue statistics

### Blacklist Management
- `POST /api/fraud/blacklist` - Add to blacklist
- `GET /api/fraud/blacklist` - List blacklist entries
- `DELETE /api/fraud/blacklist/:id` - Remove from blacklist
- `GET /api/fraud/blacklist/check/:type/:value` - Check if blacklisted

### Monitoring
- `GET /healthz` - Health check
- `GET /metrics` - Prometheus metrics

## Workflow

### 1. Transaction Created

```
Checkout (B43) → Kafka → fraud.txn_created
```

### 2. Real-time Evaluation

```
Kafka Consumer → Scoring Service → SIRA (if enabled)
                ↓
        Signals Collected:
        - Amount risk
        - IP risk
        - Velocity check
        - Blacklist check
        - SIRA AI score
                ↓
        Final Score (0-100)
                ↓
        Decision: allow|review|block
```

### 3. Decision Routing

```
if (score < 60):  allow  → Continue to capture
if (score 60-79): review → Queue for Ops
if (score ≥ 80):  block  → Cancel transaction
```

### 4. Manual Review (if needed)

```
Ops Dashboard → Review Queue → Agent reviews:
  - Transaction details
  - All fraud signals
  - User history
  - Merchant history
→ Manual Decision: allow|block
→ Optional: Add to blacklist
```

## Scoring Logic

### Signal Sources

| Source | Signals | Weight |
|--------|---------|--------|
| Connect | Amount, velocity, history | 40% |
| SIRA | AI/ML risk score | 60% |
| Network | IP, ASN, geolocation | Integrated |
| Blacklist | User, device, card, IP | Instant block |

### Score Calculation

```typescript
baseScore = amount_risk + ip_risk + velocity_risk + blacklist_risk
siraScore = SIRA AI score (0-100)
finalScore = (baseScore * 0.4) + (siraScore * 0.6)

if (finalScore >= 80): block
if (finalScore >= 60): review
if (finalScore < 60):  allow
```

### Example Scenarios

**Scenario 1: Normal Transaction**
- Amount: $50 USD
- IP: Clean
- Velocity: 2 txns/hour
- SIRA Score: 25
- **Final Score: 30 → allow**

**Scenario 2: Suspicious Transaction**
- Amount: $8,000 USD
- IP: Proxy detected
- Velocity: 15 txns/hour
- SIRA Score: 70
- **Final Score: 75 → review**

**Scenario 3: High-Risk Transaction**
- Amount: $50,000 USD
- IP: Blacklisted
- Velocity: 50 txns/hour
- SIRA Score: 95
- **Final Score: 92 → block**

## Kafka Integration

### Topics

```
# Input (consumed)
checkout.txn_created

# Output (produced)
fraud.decision
```

### Message Format

```json
// Input: checkout.txn_created
{
  "txnId": "uuid",
  "userId": "uuid",
  "merchantId": "uuid",
  "amount": 1000.00,
  "currency": "USD",
  "country": "US",
  "ip": "203.0.113.1",
  "device": {
    "fingerprint": "...",
    "type": "mobile",
    "os": "iOS"
  },
  "payment_method": {
    "type": "card",
    "brand": "visa",
    "last4": "4242"
  }
}

// Output: fraud.decision
{
  "txnId": "uuid",
  "decision": "review",
  "score": 72,
  "sira_score": 68,
  "confidence": 0.85,
  "reasons": ["high_amount", "foreign_currency", "elevated_velocity"],
  "timestamp": "2025-01-01T12:00:00Z"
}
```

## SIRA Integration

### Configuration

```env
SIRA_URL=https://sira.molam.io
SIRA_API_KEY=your-api-key
MOCK_SIRA=false
```

### API Call

```typescript
POST /api/score
{
  "transaction": {
    "id": "uuid",
    "amount": 1000,
    "currency": "USD"
  },
  "user": {
    "id": "uuid"
  },
  "context": {
    "ip": "...",
    "device": {...}
  }
}

// Response
{
  "score": 68,
  "confidence": 0.85,
  "reasons": ["..."],
  "recommended_action": "review",
  "signals": [...]
}
```

### Fallback

If SIRA unavailable:
- Uses built-in scoring (rules-based)
- Logs warning
- Continues evaluation without AI enrichment

## Blacklist Management

### Types

- **ip**: IP addresses
- **card_bin**: Card BIN (first 6 digits)
- **email**: Email addresses
- **device**: Device fingerprints
- **user**: User IDs
- **asn**: Autonomous System Numbers

### Add to Blacklist

```bash
curl -X POST http://localhost:8044/api/fraud/blacklist \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "list_type": "ip",
    "value": "203.0.113.1",
    "reason": "Multiple failed transactions",
    "severity": "high",
    "expires_at": "2025-12-31T23:59:59Z"
  }'
```

## Metrics

Available at `/metrics`:

```
# Fraud decisions
b44_fraud_decisions_total{decision,merchant}

# Scoring performance
b44_fraud_score_duration_ms{decision}

# SIRA calls
b44_sira_calls_total{status}

# Review queue
b44_fraud_reviews_pending
b44_fraud_reviews_resolved_total{decision}

# Blacklist hits
b44_fraud_blacklist_hits_total{type}
```

## Security & Compliance

### RBAC Roles

- **fraud_ops**: Review queue, manual decisions, blacklist management
- **auditor**: Read-only access to all fraud data
- **merchant**: View own transaction decisions only

### Audit Trail

All decisions and overrides logged to `fraud_audit_logs`:
- Auto decisions by system
- Manual overrides by fraud_ops
- Blacklist additions/removals
- Rule changes

### Data Retention

- Decisions: 2 years
- Signals: 1 year
- Audit logs: 7 years (compliance)
- Metrics: 90 days

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run tests (to be implemented)
npm test

# View metrics
curl http://localhost:8044/metrics
```

## Ops Dashboard

React UI at `/dashboard` (fraud_ops role required):

- **Overview**: Real-time fraud rate, blocked transactions
- **Review Queue**: Pending reviews sorted by score/priority
- **Analytics**: False positives/negatives, accuracy metrics
- **Blacklist**: Search and manage blacklist entries
- **Rules**: Configure fraud detection rules (admin only)

## License

ISC

## Contact

Molam Team - [GitHub](https://github.com/Molam-git)
