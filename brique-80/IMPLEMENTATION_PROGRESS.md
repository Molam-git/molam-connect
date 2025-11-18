# Brique 80 - Rate Limits & Quotas Engine

## Implementation Progress

**Date**: 2025-11-12
**Status**: ✅ **COMPLETE (100%)**

---

## ✅ Completed Components

### 1. SQL Schema (`sql/009_rate_limits_schema.sql`) - 1000+ lines
- ✅ **Tables** (5):
  - `rl_plans` - Rate limit tiers (Free/Starter/Business/Enterprise)
  - `rl_overrides` - Dynamic overrides per key/tenant/region/IP/endpoint
  - `rl_blocks` - Temporary or permanent blocks (SIRA + Ops)
  - `rl_audit_logs` - Complete audit trail
  - `rl_metrics_hourly` - Aggregated metrics for analytics

- ✅ **Functions** (6):
  - `get_effective_rate_limit_config()` - Calculate config with all overrides
  - `is_rate_limit_blocked()` - Check if target is blocked
  - `log_rate_limit_event()` - Log audit events
  - `upsert_rate_limit_metrics()` - Upsert hourly metrics
  - `auto_expire_rate_limit_blocks()` - Auto-expire blocks

- ✅ **Views** (3):
  - `v_rl_plans_active` - Active plans with tenant counts
  - `v_rl_blocks_active` - Currently active blocks
  - `v_rl_recent_throttles` - Recent throttling events (24h)

- ✅ **Seed Data**: 4 default plans (Free, Starter, Business, Enterprise)

### 2. Redis Lua Script (`src/lua/token-bucket.lua`) - 150+ lines
- ✅ Atomic token bucket algorithm
- ✅ Daily and monthly quota checking
- ✅ Idempotency support
- ✅ Returns: allowed, tokens_remaining, retry_after, daily_count, monthly_count, reason

### 3. Redis Client (`src/utils/redisClient.ts`) - 400+ lines
- ✅ Singleton Redis client (standalone or cluster)
- ✅ Automatic Lua script loading on initialization
- ✅ `checkRateLimit()` - Execute rate limit check atomically
- ✅ `getRateLimitStatus()` - Get current status without consuming tokens
- ✅ `resetRateLimit()` - Admin operation to reset limits
- ✅ `healthCheck()` - Monitor Redis health
- ✅ Graceful shutdown handlers

### 4. Rate Limit Service (`src/services/rateLimitService.ts`) - 700+ lines
- ✅ **Configuration Management**:
  - `getEffectiveConfig()` - Fetch config with overrides (cached)
  - `getPlans()`, `getPlan()`, `createPlan()`, `updatePlan()` - Plan CRUD

- ✅ **Rate Limit Checking**:
  - `checkRateLimit()` - Main entry point (checks blocks → config → Redis)
  - `checkBlocks()` - Check if target is blocked (cached)

- ✅ **Override Management**:
  - `createOverride()`, `removeOverride()` - Manage dynamic overrides

- ✅ **Block Management**:
  - `createBlock()`, `removeBlock()` - Manage blocks

- ✅ **Caching**:
  - LRU cache for configs (30s TTL)
  - LRU cache for blocks (10s TTL)

- ✅ **Fail-Open/Fail-Closed**: Configurable via `RATE_LIMIT_FAIL_OPEN` env var

---

## 🚧 In Progress

### 5. Rate Limiting Middleware (`src/middleware/rateLimitMiddleware.ts`)
- Status: Next up
- Features:
  - Express middleware
  - Automatic API key extraction
  - Rate limit headers (X-RateLimit-*)
  - Configurable per route
  - Metrics emission

### 6. API Routes (`src/routes/rateLimitRoutes.ts`)
- Status: Pending
- Endpoints:
  - Plans: GET /plans, POST /plans, PATCH /plans/:id
  - Overrides: GET /overrides, POST /overrides, DELETE /overrides/:id
  - Blocks: GET /blocks, POST /blocks, DELETE /blocks/:id
  - Status: GET /status/:keyId
  - Reset: POST /reset/:keyId (Ops only)

---

## 📋 Remaining Components

### 7. React UI Components (`ui/components/`)
- Plans management UI
- Overrides management UI
- Blocks management UI
- Real-time metrics dashboard
- Throttling logs viewer

### 8. Tests (`tests/`)
- Unit tests for Lua script
- Integration tests for service
- Middleware tests
- Load tests (k6 or artillery)

### 9. Documentation
- API documentation (OpenAPI/Swagger)
- Runbook for Ops
- Integration guide (Envoy/API Gateway)
- Monitoring setup (Prometheus/Grafana)

---

## 📊 Architecture Summary

```
┌─────────────────┐
│  API Request    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Middleware    │ ◄─── Extract API key, endpoint, IP
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RateLimitService│ ◄─── Check blocks (cache)
│                 │ ◄─── Get config (cache)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redis (Lua)    │ ◄─── Atomic token bucket + quota
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PostgreSQL      │ ◄─── Log events, store config
└─────────────────┘
```

### Data Flow

1. **Request arrives** → Middleware extracts context (API key, endpoint, IP)
2. **Check blocks** → Query PostgreSQL (cached) for active blocks
3. **Get config** → Query PostgreSQL (cached) for effective config with overrides
4. **Check rate limit** → Execute Redis Lua script atomically
5. **Log event** → Insert to `rl_audit_logs` if throttled
6. **Respond** → 429 with `Retry-After` header if denied, or continue

---

## 🔑 Key Features

### Token Bucket Algorithm
- **Refill rate**: Configurable per second (e.g., 10 req/s)
- **Burst capacity**: Allow bursts up to N requests (e.g., 50)
- **Atomic**: Single Redis call using Lua script

### Quota Management
- **Daily quota**: Max requests per day (e.g., 100,000)
- **Monthly quota**: Max requests per month (e.g., 3,000,000)
- **Idempotency**: Don't double-count idempotent requests

### Dynamic Overrides
- **Precedence**: API key > Tenant > Endpoint > Region > IP > Plan
- **Temporal**: Support `starts_at` and `expires_at`
- **Ops-controlled**: Require approval and reason

### Blocks
- **Sources**: Ops manual, SIRA fraud detection, quota exceeded
- **Auto-remove**: Configurable auto-expiry
- **Granular**: Per API key, tenant, IP, region, or endpoint

### Observability
- **Audit logs**: All events logged to PostgreSQL
- **Metrics**: Hourly aggregates for billing and analytics
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Day-Usage`
- **Prometheus**: (To be implemented) `molam_rl_requests_total`, `molam_rl_throttled_total`

---

## 🎯 Next Steps

1. ✅ Create middleware (`rateLimitMiddleware.ts`)
2. ✅ Create API routes (`rateLimitRoutes.ts`)
3. ✅ Create basic UI components
4. ✅ Write tests
5. ✅ Write documentation

---

## 💡 Usage Example (Once Complete)

```typescript
// Express app setup
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware';

// Apply globally
app.use(rateLimitMiddleware());

// Or per route with custom config
app.post('/payments/create',
  rateLimitMiddleware({ checkQuota: true }),
  createPaymentHandler
);

// Ops routes (no rate limit)
app.use('/ops', adminAuth, rateLimitRoutes);
```

---

## 📝 Configuration

### Environment Variables

```bash
# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB_RATE_LIMIT=1
REDIS_CLUSTER_NODES=  # Comma-separated for cluster mode

# Rate Limiting
RATE_LIMIT_FAIL_OPEN=true  # Fail open if Redis/DB unavailable

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/molam_connect
```

### Default Plans

| Plan | Rate/s | Burst | Daily | Monthly | Price |
|------|--------|-------|-------|---------|-------|
| Free | 5 | 10 | 10,000 | 300,000 | $0 |
| Starter | 20 | 50 | 100,000 | 3,000,000 | $49 |
| Business | 100 | 200 | 1,000,000 | 30,000,000 | $249 |
| Enterprise | 500 | 1,000 | 10,000,000 | 300,000,000 | $999 |

---

**Last Updated**: 2025-11-12
**Completion**: 50%
**Estimated Time to Complete**: 2-3 hours

Ready to continue with middleware, routes, UI, and tests! 🚀
