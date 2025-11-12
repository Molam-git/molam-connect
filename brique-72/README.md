# Brique 72 - Account Capabilities & Limits Management

## 📋 Status: CORE COMPLETE (60%)

**Version:** 1.0.0
**Date:** 2025-11-11

---

## 🎯 Overview

Centralized capability and limit management system with Redis-powered fast enforcement (<5ms), SIRA ML recommendations, and real-time usage tracking.

### Key Features

✅ **Dynamic Capabilities System**
- 14 granular capabilities (can_send_p2p, can_receive_payout, can_instant_payout, etc.)
- Time-based effectiveness (effective_from/effective_to)
- Origin tracking (default, kyc, sira, ops_override)
- Fast cached lookups

✅ **Multi-Tier Limit System**
- 9 limit types (max_single_tx, max_daily_out, max_monthly_volume, etc.)
- Per-KYC level defaults (P0, P1, P2, P3)
- Multi-currency support
- Temporal overrides with automatic expiry

✅ **Fast Enforcement (<5ms)**
- Redis cache layer
- Priority lookup: overrides → user-specific → KYC defaults
- Real-time usage tracking
- Decision types: allow, block, require_otp, require_manual_approval

✅ **SIRA ML Recommendations**
- Intelligent limit adjustments based on:
  - User behavior patterns
  - Risk profile
  - Transaction history
  - Account maturity
- Auto-apply for low-risk users
- Ops review for high-risk users

✅ **Immutable Audit Trail**
- All changes logged
- Actor tracking
- Complete compliance history
- Automatic logging via triggers

✅ **Ops Tools**
- REST API for limit/capability management
- Cache warming and invalidation
- Usage statistics and analytics
- Audit trail queries

---

## 📊 Database Schema (✅ COMPLETE)

### Tables Implemented (9 tables)

1. **capability_definitions** - Master list of 14 capabilities
   - can_send_p2p, can_receive_p2p, can_pay_card, can_qr_payment
   - can_receive_payout, can_instant_payout
   - can_create_checkout, can_cash_in, can_cash_out
   - can_agent_assisted, can_business_wallet, can_sub_accounts
   - can_api_access, can_webhook_config

2. **account_capabilities** - Per-user capability grants
   - Temporal validity (effective_from/effective_to)
   - Origin tracking
   - Automatic audit logging

3. **limit_definitions** - Master list of 9 limit types
   - max_single_tx, max_daily_out, max_weekly_out
   - max_monthly_volume, max_daily_in, max_weekly_in
   - max_monthly_in, max_open_balance, daily_tx_count

4. **limit_defaults** - Default limits by KYC level
   - P0: Receive-only ($0 send, $1000/day receive)
   - P1: Basic ($1000/tx, $5000/day send)
   - P2: Business ($50k/tx, $200k/day send)
   - P3: Bank Partner (Unlimited)

5. **account_limits** - User-specific limit overrides
   - Multi-currency support
   - Origin tracking (default, kyc, sira, ops_override)

6. **limit_overrides** - Temporary ops overrides
   - Mandatory expiry date
   - Auto-expire trigger
   - Reason required

7. **limit_audit** - Immutable audit trail
   - Append-only log
   - Action tracking
   - Full payload history

8. **enforcement_snapshots** - Cache rebuild support
   - User capabilities snapshot
   - User limits snapshot
   - Currency-specific

9. **limit_usage** - Real-time usage tracking
   - Amount and count tracking
   - Time window aggregation
   - Fast lookups

### Triggers & Functions (5)

- ✅ `update_limits_updated_at()` - Auto-update timestamps
- ✅ `auto_expire_overrides()` - Auto-expire temporary overrides
- ✅ `audit_capability_change()` - Auto-audit capability changes
- ✅ `get_effective_limit(user_id, limit_key, currency)` - Priority lookup
- ✅ `has_capability(user_id, capability_key)` - Fast capability check

### Views (2)

- ✅ `v_user_capabilities` - Active capabilities with display names
- ✅ `v_user_limits` - Effective limits with display names

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Client Service │
│ (Wallet/Connect)│
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│  Enforcement API    │◄──── Redis Cache (<5ms)
│  POST /enforce      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐      ┌──────────────┐
│  Enforcement Engine │────▶ │  PostgreSQL  │
│  - Check capability │      │  - Limits    │
│  - Check limit      │      │  - Usage     │
│  - Record usage     │      │  - Audit     │
└─────────────────────┘      └──────────────┘
         │
         ▼
┌─────────────────────┐
│  Decision:          │
│  - allow            │
│  - block            │
│  - require_otp      │
│  - require_approval │
└─────────────────────┘
```

### SIRA Integration Flow

```
┌──────────────────┐
│  SIRA Worker     │  (Daily @ 3 AM)
│  (Cron Job)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌──────────────────┐
│ Gather User Data │────▶ │ SIRA ML Service  │
│ - Tx history     │      │ - Risk scoring   │
│ - Risk profile   │      │ - Recommendations│
│ - Account age    │      └──────────┬───────┘
└──────────────────┘                 │
         │                           │
         ▼                           ▼
┌──────────────────┐      ┌──────────────────┐
│ Low Risk?        │─Yes─▶│ Auto-Apply       │
│ (score < 0.2)    │      │ Limit Adjustments│
└────────┬─────────┘      └──────────────────┘
         │
         │ No
         ▼
┌──────────────────┐
│ Create Ops Task  │
│ (Manual Review)  │
└──────────────────┘
```

---

## 💡 Implementation Status

### ✅ Completed (60%)

| Component | File | Status | Lines |
|-----------|------|--------|-------|
| SQL Schema | migrations/001_create_limits_tables.sql | ✅ Complete | ~650 |
| Database Connection | src/db.ts | ✅ Complete | ~120 |
| Redis Client | src/redis.ts | ✅ Complete | ~200 |
| Enforcement Service | src/services/enforcement.ts | ✅ Complete | ~550 |
| Enforcement Middleware | src/middleware/enforceLimit.ts | ✅ Complete | ~350 |
| SIRA Limit Service | src/services/siraLimits.ts | ✅ Complete | ~550 |
| REST API Routes | src/routes/limits.ts | ✅ Complete | ~500 |
| Main Server | src/server.ts | ✅ Complete | ~180 |
| SIRA Worker | src/workers/siraRecommendationWorker.ts | ✅ Complete | ~280 |
| Package Config | package.json, tsconfig.json | ✅ Complete | ~100 |

**Total Completed:** ~3,480 lines

### ⏳ Pending (40%)

| Component | Priority | Estimated Lines |
|-----------|----------|-----------------|
| Prometheus Metrics | HIGH | ~300 |
| RBAC Middleware | HIGH | ~200 |
| Integration Tests | MEDIUM | ~400 |
| Ops UI (React) | MEDIUM | ~800 |
| Cache Warming Scripts | MEDIUM | ~150 |
| Webhooks | LOW | ~150 |
| Additional Documentation | LOW | ~200 |

**Total Remaining:** ~2,200 lines

**Estimated Time to MVP:** 2-3 days (metrics + RBAC + tests)
**Estimated Time to Production:** 1-2 weeks (+ UI + integrations)

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6

### 2. Installation

```bash
cd brique-72
npm install
```

### 3. Configuration

```bash
cp .env.example .env
# Edit .env with your database and Redis credentials
```

### 4. Database Setup

```bash
# Run migrations
psql -U postgres -d molam_limits -f migrations/001_create_limits_tables.sql
```

### 5. Start Services

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start

# Start SIRA worker (separate process)
npm run worker:sira
```

### 6. Verify

```bash
# Health check
curl http://localhost:3072/health

# Metrics
curl http://localhost:9072/metrics
```

---

## 📚 API Endpoints

### Enforcement

#### `POST /api/limits/enforce`
Fast enforcement check (cached <5ms)

**Request:**
```json
{
  "userId": "uuid",
  "limitKey": "max_single_tx",
  "amount": 1500,
  "currency": "USD",
  "context": {
    "transactionType": "p2p_send"
  },
  "idempotencyKey": "tx_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "decision": "allow",
  "allowed": true,
  "reason": "Within limit: 1500 / 5000 USD",
  "appliedLimit": {
    "limitKey": "max_single_tx",
    "limitValue": 5000,
    "currency": "USD",
    "origin": "default"
  },
  "currentUsage": {
    "amount": 3200,
    "count": 8,
    "remaining": 1800
  }
}
```

**Possible Decisions:**
- `allow` - Transaction allowed
- `block` - Limit exceeded
- `require_otp` - Approaching limit (80-95%), OTP required
- `require_manual_approval` - Near limit (>95%), manual approval needed

#### `POST /api/limits/record-usage`
Record usage after successful transaction

**Request:**
```json
{
  "userId": "uuid",
  "limitKey": "max_single_tx",
  "amount": 1500,
  "currency": "USD",
  "idempotencyKey": "tx_abc123"
}
```

### Capabilities

#### `POST /api/capabilities/check`
Check if user has capability

**Request:**
```json
{
  "userId": "uuid",
  "capabilityKey": "can_send_p2p"
}
```

**Response:**
```json
{
  "success": true,
  "hasCapability": true,
  "reason": "Capability 'can_send_p2p' granted (kyc)"
}
```

#### `GET /api/capabilities/:userId`
Get all capabilities for user

#### `POST /api/capabilities/set`
Set capability for user (Ops)

**Request:**
```json
{
  "userId": "uuid",
  "capabilityKey": "can_instant_payout",
  "enabled": true,
  "effectiveFrom": "2025-11-11T00:00:00Z",
  "effectiveTo": null,
  "origin": "ops_override",
  "reason": "Verified business account"
}
```

### Limits Management

#### `GET /api/limits/:userId?currency=USD`
Get all limits for user

#### `POST /api/limits/set`
Set limit for user (Ops)

**Request:**
```json
{
  "userId": "uuid",
  "limitKey": "max_single_tx",
  "limitValue": 10000,
  "currency": "USD",
  "reason": "High-value merchant account",
  "origin": "ops",
  "actorId": "admin_uuid"
}
```

#### `GET /api/limits/:userId/usage?currency=USD&limitKey=max_daily_out`
Get usage statistics

### SIRA Recommendations

#### `POST /api/sira/recommend-limits`
Get SIRA limit recommendations

**Request:**
```json
{
  "userId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "recommendation": {
    "recommendations": [
      {
        "limitKey": "max_single_tx",
        "currentLimit": 1000,
        "recommendedLimit": 2500,
        "change": "increase",
        "changePercent": 150,
        "confidence": 0.9,
        "reasoning": [
          "KYC level P1: 1.0x base",
          "Account age 60 days: +16% bonus",
          "High transaction volume: +30% bonus"
        ]
      }
    ],
    "overallRiskScore": 0.12,
    "action": "auto_apply",
    "metadata": {
      "modelVersion": "sira-limits-v1.0",
      "evaluatedAt": "2025-11-11T10:30:00Z",
      "factors": {
        "fraudRisk": 0.05,
        "accountMaturity": 0.33,
        "transactionReliability": 0.02
      }
    }
  }
}
```

#### `POST /api/sira/apply-recommendations`
Apply SIRA recommendations

### Audit & Admin

#### `GET /api/audit/:userId?limit=100&offset=0`
Get audit trail for user

#### `POST /api/cache/invalidate/:userId`
Invalidate cache for user (admin)

#### `POST /api/cache/warm/:userId`
Warm cache for user (after login/KYC upgrade)

---

## 🔧 Integration Guide

### Example: Wallet Service Integration

```typescript
import axios from 'axios';

// Before executing payment
async function sendP2P(userId: string, amount: number, currency: string) {
  // Step 1: Check capability
  const capabilityCheck = await axios.post('http://limits-service:3072/api/capabilities/check', {
    userId,
    capabilityKey: 'can_send_p2p',
  });

  if (!capabilityCheck.data.hasCapability) {
    throw new Error('User does not have P2P send capability');
  }

  // Step 2: Enforce limit
  const enforcement = await axios.post('http://limits-service:3072/api/limits/enforce', {
    userId,
    limitKey: 'max_single_tx',
    amount,
    currency,
    context: {
      transactionType: 'p2p_send',
    },
    idempotencyKey: `tx_${transactionId}`,
  });

  if (enforcement.data.decision === 'block') {
    throw new Error(enforcement.data.reason);
  }

  if (enforcement.data.decision === 'require_otp') {
    // Request OTP from user
    return { status: 'otp_required', message: enforcement.data.reason };
  }

  // Step 3: Execute payment
  const payment = await executePayment(userId, amount, currency);

  // Step 4: Record usage
  await axios.post('http://limits-service:3072/api/limits/record-usage', {
    userId,
    limitKey: 'max_single_tx',
    amount,
    currency,
    idempotencyKey: `tx_${transactionId}`,
  });

  return payment;
}
```

### Using Express Middleware

```typescript
import express from 'express';
import { requireCapability, enforceLimitMiddleware } from '@molam/brique-72';

const app = express();

app.post('/api/wallet/send',
  requireCapability('can_send_p2p'),
  enforceLimitMiddleware({
    limitKey: 'max_single_tx',
    amountField: 'amount',
    currencyField: 'currency',
  }),
  async (req, res) => {
    // Execute payment logic
    const payment = await processPayment(req.body);
    res.json({ success: true, payment });
  }
);
```

---

## 🎯 KYC Level Defaults

| KYC Level | Description | Max Single TX | Max Daily Out | Max Monthly Volume | Capabilities |
|-----------|-------------|---------------|---------------|--------------------|--------------|
| **P0** | Basic | $0 | $0 | $0 | can_receive_p2p |
| **P1** | ID Verified | $1,000 | $5,000 | $20,000 | can_send_p2p, can_receive_payout |
| **P2** | Business | $50,000 | $200,000 | $1,000,000 | can_instant_payout, can_create_checkout |
| **P3** | Bank Partner | Unlimited | Unlimited | Unlimited | All capabilities |

---

## 🔒 Security Features

### Enforcement
- Fast cached decisions (<5ms) prevent performance bottlenecks
- Idempotency keys prevent duplicate operations
- Origin tracking ensures audit trail

### Limit Management
- Temporary overrides with mandatory expiry
- Multi-level priority: overrides → user-specific → defaults
- Automatic expiry via database triggers

### Audit Trail
- Immutable append-only logs
- Actor tracking for all changes
- Complete compliance history

### Cache Security
- 30-second TTL on enforcement decisions
- Automatic invalidation on limit changes
- Separate cache namespaces per user

---

## 📈 SIRA Risk Factors

### Input Features (6 categories)

1. **Account Maturity** (20% weight)
   - Account age in days
   - 180 days = fully mature

2. **Fraud Risk** (30% weight)
   - Fraud score from fraud detection service
   - 0 = no risk, 1 = high risk

3. **Transaction Reliability** (15% weight)
   - Success rate
   - Transaction count

4. **Velocity Patterns** (15% weight)
   - Erratic vs stable patterns
   - Daily activity rate

5. **Chargeback/Dispute Risk** (10% weight)
   - Chargeback rate
   - Dispute rate

6. **Suspicious Activity** (10% weight)
   - Number of flags
   - Manual reviews

### Risk Score Interpretation

| Score | Risk Level | Action | Example |
|-------|------------|--------|---------|
| 0.00-0.20 | 🟢 Low | Auto-apply limit increases | Established user, good history |
| 0.20-0.60 | 🟡 Medium | Suggest to Ops | Some flags, requires review |
| 0.60-1.00 | 🔴 High | Require manual review | Multiple red flags, fraud risk |

---

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing

```bash
# Test enforcement
curl -X POST http://localhost:3072/api/limits/enforce \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "limitKey": "max_single_tx",
    "amount": 1500,
    "currency": "USD"
  }'

# Test capability check
curl -X POST http://localhost:3072/api/capabilities/check \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "capabilityKey": "can_send_p2p"
  }'
```

---

## 📋 Deployment Checklist

### Database
- [ ] Run SQL migrations
- [ ] Verify indexes created
- [ ] Test triggers and functions
- [ ] Seed default limits for all KYC levels

### Services
- [ ] Deploy Limits API service
- [ ] Deploy SIRA worker
- [ ] Configure Redis cluster
- [ ] Set up load balancer

### Integrations
- [ ] Connect to Molam ID (JWT verification)
- [ ] Connect to SIRA ML service
- [ ] Connect to Wallet service
- [ ] Connect to Connect service (merchants)

### Monitoring
- [ ] Set up Prometheus scraping
- [ ] Create Grafana dashboards
- [ ] Configure alerts (high cache miss rate, slow enforcement)

### Security
- [ ] Review RBAC permissions
- [ ] Test enforcement decisions
- [ ] Audit trail verification
- [ ] Penetration testing

---

## 🎯 Success Metrics

- **Enforcement Latency**: P95 <5ms (cached), P95 <50ms (uncached)
- **Cache Hit Rate**: >95%
- **SIRA Auto-Apply Rate**: >70% for eligible users
- **SIRA Accuracy**: >90% (measured via feedback loop)
- **API Availability**: >99.9%

---

## 🚀 Next Steps

### Phase 1: Production Readiness (1-2 weeks)
1. Implement Prometheus metrics
2. Add RBAC middleware
3. Write integration tests
4. Load testing

### Phase 2: Ops Tools (2-3 weeks)
5. Build Ops UI for limit management
6. Add bulk operations
7. Real-time usage dashboards
8. Alert configuration

### Phase 3: Advanced Features (1 month)
9. Machine learning model training (SIRA)
10. A/B testing for limit strategies
11. Predictive limit recommendations
12. Multi-region cache replication

---

## 📚 Documentation

- [API Reference](docs/API.md) (TODO)
- [Integration Guide](docs/INTEGRATION.md) (TODO)
- [SIRA ML Guide](docs/SIRA.md) (TODO)
- [Ops Runbook](docs/RUNBOOK.md) (TODO)

---

## 🤝 Contributing

Internal MoLam Connect project. For questions or contributions, contact the platform team.

---

**Document Version:** 1.0.0
**Status:** Core Complete (60%), Production Pending
**Next Milestone:** Prometheus metrics + RBAC + Integration tests
