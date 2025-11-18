# Brique 95 - Auto-switch Routing Service

**Intelligent Payment Rail Selection System**

An industrial-grade, low-latency service that automatically determines the optimal payment rail (Molam Wallet, Molam Connect, or Hybrid) for each transaction based on rules, AI recommendations, costs, compliance, and availability.

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [API Reference](#-api-reference)
- [Decision Logic](#-decision-logic)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Monitoring](#-monitoring)
- [Security](#-security)

---

## ✨ Features

### Core Capabilities
- **Automatic Route Selection** - Wallet, Connect, or Hybrid based on intelligent rules
- **SIRA AI Integration** - ML-powered fraud scoring and routing recommendations
- **Cost Optimization** - Automatic fee comparison and route selection
- **Rule Engine** - Operator-editable rules with priority-based evaluation
- **Manual Overrides** - Emergency routing control for ops team
- **Idempotency** - Request deduplication via Idempotency-Key headers
- **Fallback & Failover** - Automatic fallback on primary route failure

### Performance
- **P50 Latency < 20ms** (cached decisions)
- **P95 Latency < 120ms** (uncached with SIRA call)
- **Redis Caching** - Short-lived decision and SIRA hint caching
- **Connection Pooling** - Optimized PostgreSQL connection management

### Observability
- **Prometheus Metrics** - Request latency, route distribution, error rates
- **Immutable Audit Trail** - All decisions logged to database
- **Health Checks** - /health, /healthz, /readyz endpoints
- **Detailed Status** - Real-time service status with DB/Redis/SIRA health

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Payment Services                         │
├────────────────┬──────────────┬──────────────┬──────────────┤
│   Checkout     │   Payouts    │  Treasury    │   Connect    │
└───────┬────────┴──────┬───────┴──────┬───────┴──────┬───────┘
        │               │              │              │
        └───────────────┴──────────────┴──────────────┘
                         │
              ┌──────────▼──────────┐
              │  Routing Service    │
              │   (Brique 95)       │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │  SIRA   │    │ Redis   │    │Postgres │
    │   AI    │    │ Cache   │    │   DB    │
    └─────────┘    └─────────┘    └─────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │ Wallet  │    │ Connect │    │ Hybrid  │
    │ Service │    │ Service │    │  Split  │
    └─────────┘    └─────────┘    └─────────┘
```

### Components

1. **Routing Service** - Express/TypeScript API server
2. **SIRA Client** - AI service integration with fallback
3. **Rule Engine** - Priority-based rule evaluation
4. **Cache Layer** - Redis for SIRA hints and decisions
5. **Audit Store** - PostgreSQL for immutable decision trail
6. **Metrics** - Prometheus-compatible observability

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### 1. Clone and Install

```bash
cd brique-95
npm install
```

### 2. Set Up Database

```bash
# Create database
createdb molam_routing

# Run migrations
psql -d molam_routing -f migrations/001_b95_auto_switch_routing.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

Key settings:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/molam_routing
REDIS_URL=redis://localhost:6379
SIRA_URL=http://localhost:8083
USE_MOCK_SIRA=true  # Set to false for production SIRA
PORT=8082
```

### 4. Start Development Server

```bash
npm run dev
```

The service will be available at [http://localhost:8082](http://localhost:8082).

---

## 🔌 API Reference

### Base URL
```
Production: https://api.molam.com/v1/routing
Development: http://localhost:8082/v1/routing
```

### Authentication
All requests require a JWT token:
```
Authorization: Bearer {JWT_TOKEN}
```

---

### POST `/v1/routing/decide`
Make a routing decision for a payment.

**Headers:**
```
Authorization: Bearer {JWT}
Idempotency-Key: {UUID} (optional but recommended)
```

**Request Body:**
```json
{
  "payment_id": "pay_123",
  "merchant_id": "merchant_abc",
  "user_id": "user_xyz",
  "amount": 1250.00,
  "currency": "XOF",
  "country": "SN",
  "payment_method_hint": "any"
}
```

**Response (200 OK):**
```json
{
  "decision_id": "dec_uuid",
  "route": "wallet",
  "reason": "rule:prefer_wallet (rule_id_123)",
  "cost_estimate": {
    "molam_fee": 18.75,
    "partner_fee": 0,
    "total": 18.75,
    "currency": "XOF"
  },
  "sira": {
    "score": 0.12,
    "reasons": ["low_fraud_risk", "local_currency"],
    "confidence": 0.87
  },
  "fallback_routes": ["connect"],
  "instructions": {
    "action": "reserve_balance",
    "reserve_ref": "hold_123"
  },
  "expires_at": "2025-01-14T12:05:00Z",
  "latency_ms": 45
}
```

---

### GET `/v1/routing/decisions/:decision_id`
Retrieve a routing decision.

**Response (200 OK):**
```json
{
  "id": "dec_uuid",
  "payment_id": "pay_123",
  "merchant_id": "merchant_abc",
  "user_id": "user_xyz",
  "amount": 1250.00,
  "currency": "XOF",
  "country": "SN",
  "decision": {
    "route": "wallet",
    "reason": "rule:prefer_wallet",
    "costs": {...}
  },
  "sira_snapshot": {...},
  "execution_status": "success",
  "created_at": "2025-01-14T12:00:00Z",
  "latency_ms": 45
}
```

---

### GET `/v1/routing/decisions`
List routing decisions with filters.

**Query Parameters:**
- `merchant_id` - Filter by merchant
- `user_id` - Filter by user
- `route` - Filter by route (wallet/connect/hybrid)
- `from_date` - Start date (ISO 8601)
- `to_date` - End date (ISO 8601)
- `limit` - Max results (default: 100)
- `offset` - Pagination offset (default: 0)

---

### PATCH `/v1/routing/decisions/:decision_id/execute`
Update execution status after payment processing.

**Request Body:**
```json
{
  "status": "success",
  "error_message": "Optional error description"
}
```

Status values: `success`, `failed`, `fallback_used`

---

## 🧠 Decision Logic

### Decision Flow

```
1. Check Idempotency
   ↓
2. Get SIRA Hint (cached)
   ↓
3. Calculate Cost Estimates
   ↓
4. Check Manual Overrides (highest priority)
   ↓
5. Evaluate Routing Rules (by priority)
   ↓
6. Apply SIRA Hint (if no rule matched)
   ↓
7. Verify Wallet Availability (if wallet route)
   ↓
8. Persist Decision (audit trail)
   ↓
9. Return Decision
```

### Rule Types

| Rule Type | Description | Example |
|-----------|-------------|---------|
| `prefer_wallet` | Always prefer wallet | Simple preference |
| `prefer_connect` | Always prefer connect | For merchants with contracts |
| `force_wallet` | Force wallet (no fallback) | Regulatory requirement |
| `force_connect` | Force connect (no fallback) | High-risk merchants |
| `cost_threshold` | Prefer if X% cheaper | `{threshold_pct: 0.02}` |
| `amount_based` | Route based on amount | `{min: 100, max: 50000, route: "wallet"}` |
| `time_based` | Route based on time of day | `{start_hour: 8, end_hour: 20, route: "connect"}` |

### Rule Priority

Rules are evaluated in ascending priority order (lower number = higher priority). First matching rule wins.

Example:
```
Priority 10: Amount-based (0-50K → wallet)
Priority 20: Cost threshold (prefer 2% cheaper)
Priority 30: High value (>1M → connect)
```

### SIRA Integration

SIRA (AI service) provides:
- **Fraud Score** (0-1, lower is better)
- **Routing Hint** (prefer_wallet, prefer_connect, hybrid, no_preference)
- **Confidence** (0-1)
- **Reasons** (explainability)

SIRA responses are cached for 15 seconds with amount bucketing for cache hit optimization.

---

## ⚙️ Configuration

### Environment Variables

See [`.env.example`](.env.example) for all options.

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `SIRA_URL` | SIRA AI service endpoint | `http://localhost:8083` |
| `SIRA_API_KEY` | SIRA authentication key | `dev_key` |
| `USE_MOCK_SIRA` | Use mock SIRA (development) | `false` |
| `SIRA_TIMEOUT_MS` | SIRA request timeout | `2000` |
| `SIRA_CACHE_TTL` | SIRA cache TTL (seconds) | `15` |
| `JWT_SECRET` | JWT signing secret | (required) |
| `PORT` | Service port | `8082` |
| `NODE_ENV` | Environment | `development` |

### Admin API

#### Manage Routing Rules

**List Rules:**
```bash
GET /v1/admin/rules
```

**Create Rule:**
```bash
POST /v1/admin/rules
{
  "scope": {"country": "SN", "currency": "XOF"},
  "priority": 10,
  "rule_type": "amount_based",
  "params": {"min_amount": 100, "max_amount": 50000, "preferred_route": "wallet"},
  "description": "Prefer wallet for small amounts in Senegal"
}
```

**Update Rule:**
```bash
PATCH /v1/admin/rules/{rule_id}
{
  "priority": 15,
  "is_active": true
}
```

**Delete Rule:**
```bash
DELETE /v1/admin/rules/{rule_id}
```

#### Manual Overrides (Emergency)

**Create Override:**
```bash
POST /v1/admin/overrides
{
  "scope": {"merchant_id": "merchant_123"},
  "forced_route": "connect",
  "reason": "Wallet maintenance window - force all to connect",
  "valid_until": "2025-01-14T18:00:00Z"
}
```

**Deactivate Override:**
```bash
DELETE /v1/admin/overrides/{override_id}
```

---

## 🚢 Deployment

### Docker Deployment

```bash
docker build -t molam-routing:latest .
docker run -p 8082:8082 --env-file .env molam-routing:latest
```

### Docker Compose

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, and the routing service.

### Kubernetes

Deploy with provided manifests:

```bash
kubectl apply -f k8s/
```

Includes:
- Deployment with HPA (horizontal pod autoscaler)
- Service (LoadBalancer)
- ConfigMap and Secrets
- Ingress

---

## 📊 Monitoring

### Prometheus Metrics

Available at `/metrics` endpoint:

```
# Request metrics
http_requests_total{method,path,status}
http_request_duration_ms{method,path,status}

# Routing metrics
routing_decisions_total{route}
routing_decision_latency_ms
routing_errors_total

# Cache metrics
redis_hits_total
redis_misses_total

# SIRA metrics
sira_requests_total
sira_errors_total
sira_latency_ms
```

### Health Checks

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Detailed health with all checks | JSON status |
| `/healthz` | Kubernetes liveness probe | `OK` or `503` |
| `/readyz` | Kubernetes readiness probe | `Ready` or `Not Ready` |
| `/status` | Detailed service status | JSON with stats |

### Logging

Structured logging with request IDs:
```
2025-01-14T12:00:00Z INFO [req-123] POST /v1/routing/decide 200 45ms
2025-01-14T12:00:01Z INFO [req-124] Decision: wallet (reason: rule:prefer_wallet)
```

---

## 🔒 Security

### Authentication & Authorization

- **JWT Tokens** - All requests authenticated via Molam ID
- **Role-Based Access** - Admin/Ops roles for rule management
- **Merchant Isolation** - Users can only access their own data

### Data Security

- **Idempotency** - Prevent duplicate processing
- **Audit Trail** - Immutable decision history
- **Secrets Management** - Store sensitive config in vault
- **mTLS** - Internal service communication

### Best Practices

1. Rotate `JWT_SECRET` regularly
2. Use separate API keys for SIRA per environment
3. Enable database encryption at rest
4. Review routing overrides regularly
5. Monitor failed routing attempts

---

## 🧪 Testing

### Test Cards / Scenarios

| Scenario | Setup | Expected Route |
|----------|-------|----------------|
| Small amount, Senegal | 5,000 XOF, SN | wallet |
| High amount | 1,500,000 XOF | connect |
| Insufficient wallet balance | Balance < amount | connect (fallback) |
| Manual override active | Override for merchant | Forced route |

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### API Testing

```bash
# Make a routing decision
curl -X POST http://localhost:8082/v1/routing/decide \
  -H "Authorization: Bearer {JWT}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "merchant_test",
    "user_id": "user_123",
    "amount": 5000,
    "currency": "XOF",
    "country": "SN",
    "payment_method_hint": "any"
  }'

# Health check
curl http://localhost:8082/health

# Metrics
curl http://localhost:8082/metrics
```

---

## 📞 Support

- **Documentation:** [https://docs.molam.com/routing](https://docs.molam.com/routing)
- **GitHub Issues:** [https://github.com/molam/routing-service/issues](https://github.com/molam/routing-service/issues)
- **Email:** support@molam.com

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by the Molam Team**
