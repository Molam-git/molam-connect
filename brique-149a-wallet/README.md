# Molam Ma Wallet (Brique 149a)

Complete industrial-grade wallet system for Molam platform with QR payments, multi-currency support, and ledger integration.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web/Mobile    │────▶│  Wallet API     │────▶│   PostgreSQL    │
│   Frontend      │     │  (Express)      │     │   Database      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │    RabbitMQ     │
                        │  Ledger Events  │
                        └─────────────────┘
```

## Features

### Backend (Node.js/TypeScript)
- ✅ JWT Authentication via Molam ID (RS256)
- ✅ QR Code Generation & Verification
- ✅ Wallet Balance Management
- ✅ Transaction History
- ✅ Multi-currency Support (XOF, XAF, EUR, etc.)
- ✅ Idempotent Operations
- ✅ Ledger Event Publishing (RabbitMQ)
- ✅ Comprehensive Error Handling
- ✅ Unit & Integration Tests (Jest)

### Frontend
- ✅ Web UI (React 18 + Tailwind CSS)
  - Mobile-first responsive design
  - Desktop 3-column layout
  - QR code display/scanning
- ✅ Mobile App (React Native/Expo)
  - Native QR scanner
  - Pull-to-refresh
  - Optimized performance

### Infrastructure
- ✅ Docker Multi-stage Builds
- ✅ Kubernetes Manifests
  - Deployment with HPA (3-10 replicas)
  - Pod Disruption Budget (min 2 available)
  - Health checks (liveness/readiness)
  - Security: non-root, read-only filesystem
- ✅ GitHub Actions CI/CD
  - Automated tests
  - Docker build & push
  - K8s deployment
  - Security scanning (Trivy)

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- RabbitMQ 3+
- Docker & Docker Compose

### Local Development

1. **Clone and Install**
```bash
git clone <repo-url>
cd brique-149a-wallet

# Server
cd server
npm install

# Web
cd ../web
npm install
```

2. **Setup Environment**
```bash
cp .env.example .env
# Edit .env with your values
```

3. **Start with Docker Compose**
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- RabbitMQ on ports 5672, 15672
- Wallet API on port 8080
- Web UI on port 3000

4. **Run Migrations**
```bash
cd server
npm run migrate
```

5. **Access**
- API: http://localhost:8080
- Web: http://localhost:3000
- RabbitMQ Management: http://localhost:15672

### Manual Development

**Server:**
```bash
cd server
npm run dev
```

**Web:**
```bash
cd web
npm start
```

**Mobile:**
```bash
cd mobile
npm start
# Scan QR code with Expo Go app
```

## API Endpoints

### Authentication
All endpoints require `Authorization: Bearer <jwt>` header with Molam ID token.

### Endpoints

#### GET /api/wallet/home
Returns complete wallet data: balance, actions, history.

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "locale": "fr",
    "currency": "XOF",
    "country": "SN"
  },
  "balance": {
    "balance": 5000.00,
    "currency": "XOF",
    "status": "active"
  },
  "actions": [...],
  "history": [...]
}
```

#### POST /api/wallet/qr/generate
Generates QR token for receiving payments.

**Request:**
```json
{
  "purpose": "receive",
  "amount": 1000,
  "expiryMinutes": 15
}
```

**Response:**
```json
{
  "token": "abc123...",
  "expires_at": "2025-01-19T12:30:00Z",
  "qr_url": "molam://pay/abc123...",
  "deep_link": "https://pay.molam.io/qr/abc123..."
}
```

#### POST /api/wallet/qr/scan
Processes QR payment (atomic, idempotent).

**Request:**
```json
{
  "token": "abc123...",
  "amount": 1000
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Payment initiated successfully"
}
```

#### POST /api/wallet/action
Logs wallet action with idempotency support.

**Headers:**
```
Idempotency-Key: unique-key-123
```

**Request:**
```json
{
  "action": "transfer",
  "payload": { "amount": 1000, "recipient": "user-456" }
}
```

#### GET /api/wallet/balance
Quick balance check.

**Response:**
```json
{
  "balance": 7500.50,
  "currency": "XOF",
  "status": "active"
}
```

## Database Schema

### molam_wallets
- `user_id` (PK, UUID)
- `balance` (NUMERIC, default 0)
- `currency` (VARCHAR, default 'XOF')
- `status` (VARCHAR, default 'active')
- Timestamps

### wallet_qr_tokens
- `token` (PK, TEXT)
- `user_id` (UUID)
- `purpose` (ENUM: receive/pay/transfer)
- `amount` (NUMERIC, nullable)
- `currency` (VARCHAR)
- `expires_at` (TIMESTAMPTZ)
- `used_at` (TIMESTAMPTZ, nullable)
- `used_by` (UUID, nullable)
- Indexes on user_id, expires_at

### wallet_history
- `id` (PK, UUID)
- `user_id` (UUID)
- `label` (TEXT)
- `amount` (NUMERIC)
- `currency` (VARCHAR)
- `type` (ENUM: credit/debit)
- `category` (VARCHAR)
- `metadata` (JSONB)
- Timestamps

### wallet_action_logs
- `id` (PK, UUID)
- `user_id` (UUID)
- `action_type` (VARCHAR)
- `payload` (JSONB)
- `status` (VARCHAR)
- `idempotency_key` (VARCHAR, unique, nullable)
- Timestamps

## Testing

### Run Tests
```bash
# Server tests with coverage
cd server
npm test -- --coverage

# Web tests
cd web
npm test
```

### Test Coverage Goals
- Branches: 70%+
- Functions: 70%+
- Lines: 70%+
- Statements: 70%+

## Deployment

### Kubernetes

1. **Create Namespace**
```bash
kubectl apply -f k8s/namespace.yaml
```

2. **Configure Secrets**
```bash
# Edit k8s/secret-env.yaml with production values
kubectl apply -f k8s/secret-env.yaml
```

3. **Deploy**
```bash
kubectl apply -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml
kubectl apply -f k8s/ingress.yaml
```

4. **Verify**
```bash
kubectl get pods -n molam-wallet
kubectl get svc -n molam-wallet
kubectl rollout status deployment/wallet-server -n molam-wallet
```

### Docker Build

```bash
# Server
docker build -t molam/wallet-server:latest ./server

# Web
docker build -t molam/wallet-web:latest ./web

# Push to registry
docker push molam/wallet-server:latest
docker push molam/wallet-web:latest
```

## Security

### Authentication
- RS256 JWT verification with Molam ID public key
- Token validation: issuer, audience, expiration
- User context extracted from JWT claims

### Data Protection
- Non-root containers
- Read-only root filesystem
- Secrets via Kubernetes Secrets
- Database connection pooling with SSL
- Rate limiting on API endpoints

### QR Token Security
- Cryptographically secure random tokens (24 bytes)
- Time-limited (15 minutes default)
- Single-use enforcement (atomic DB update)
- Cannot pay yourself check

## Monitoring

### Health Checks
- `/healthz` - Liveness probe (database connectivity)
- `/readyz` - Readiness probe (all dependencies)
- `/metrics` - Prometheus metrics (TODO: implement prom-client)

### Kubernetes Probes
```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Logs
- Structured logging with request ID
- Request/response logging
- Error tracking with stack traces

## Ledger Integration

### Event Publishing
All wallet operations publish events to RabbitMQ:

**Exchange:** `ledger_events` (topic)

**Event Types:**
- `wallet.qr.generated` - QR token created
- `payment_intent_from_qr` - QR payment scanned
- `wallet_action_requested` - Action logged

**Event Format:**
```json
{
  "type": "payment_intent_from_qr",
  "userId": "user-123",
  "timestamp": "2025-01-19T12:00:00Z",
  "data": {
    "qr_token": "abc123",
    "payer_id": "user-123",
    "receiver_id": "user-456",
    "amount": 1000,
    "currency": "XOF",
    "origin": "qr_scan"
  }
}
```

## Troubleshooting

### Common Issues

**Database Connection Failed:**
```bash
# Check DATABASE_URL format
postgres://user:password@host:port/database

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**JWT Verification Failed:**
```bash
# Ensure MOLAM_ID_JWT_PUBLIC is properly formatted
# Must be PEM format with BEGIN/END markers
```

**RabbitMQ Connection Issues:**
```bash
# Check RabbitMQ is running
docker-compose ps rabbitmq

# View RabbitMQ logs
docker-compose logs rabbitmq
```

**Migration Errors:**
```bash
# Manually run migrations
cd server
bash ../scripts/run_migrations.sh
```

## Contributing

1. Create feature branch
2. Write tests
3. Ensure coverage >70%
4. Submit PR to `develop`
5. CI/CD will run tests & security scans

## License

Proprietary - Molam Platform

## Support

For issues or questions, contact the Molam engineering team.

---

**Status:** ✅ Production Ready

**Last Updated:** 2025-01-19

**Version:** 1.0.0
