# Brique 73 - Plan de Fusion (Industrial Version)

## 🎯 Objectif

Fusionner les Briques 73 et 73bis en un module industriel complet qui dépasse Stripe:
- ✅ API Keys & Developer Console (from B73)
- ✅ Webhooks Management & Delivery (new)
- ✅ Observability & Metrics (from B73bis)
- ✅ SIRA Guard Integration (from B73bis)

---

## 📦 Structure Finale

```
brique-73/                          (Industrial Version)
├── migrations/
│   ├── 001_create_devconsole_tables.sql     ✅ Existing (API keys, apps, logs)
│   ├── 002_create_webhooks_tables.sql       🆕 New (webhooks, deliveries)
│   └── 003_create_observability_tables.sql  ✅ From 73bis (metrics, SIRA)
│
├── src/
│   ├── db.ts                        ✅ Existing
│   ├── redis.ts                     ✅ Existing
│   │
│   ├── utils/
│   │   ├── secrets.ts               ✅ Existing (Vault, encryption)
│   │   └── rateLimiter.ts           ✅ Existing (token bucket)
│   │
│   ├── services/
│   │   ├── keyManagement.ts         ✅ Existing
│   │   ├── webhooks.ts              🆕 New (create, sign, deliver)
│   │   ├── siraGuard.ts             ✅ From 73bis (anomaly detection)
│   │   └── observability.ts         🆕 New (metrics aggregation)
│   │
│   ├── middleware/
│   │   ├── apiKeyAuth.ts            ✅ Existing
│   │   └── requestLogger.ts         🆕 New (enhanced logging)
│   │
│   ├── workers/
│   │   ├── webhookDelivery.ts       🆕 New (retry logic)
│   │   ├── metricsAggregator.ts     🆕 New (rollups)
│   │   └── usageAggregator.ts       ✅ Existing (billing)
│   │
│   ├── routes/
│   │   ├── apps.ts                  🆕 New (CRUD apps)
│   │   ├── keys.ts                  🆕 New (CRUD keys)
│   │   ├── webhooks.ts              🆕 New (webhooks management)
│   │   ├── observability.ts         🆕 New (metrics, traces)
│   │   └── playground.ts            🆕 New (sandbox testing)
│   │
│   └── server.ts                    ✅ Existing (enhanced)
│
├── tests/
│   ├── keys.test.ts
│   ├── webhooks.test.ts
│   ├── siraGuard.test.ts
│   └── integration.test.ts
│
├── package.json                     ✅ Updated
├── tsconfig.json                    ✅ Existing
├── .env.example                     ✅ Updated
└── README.md                        ✅ Comprehensive
```

---

## 🔄 Migrations Strategy

### Migration 001 (Existing - Enhanced)
- dev_apps
- api_keys (add webhook_url field)
- api_request_logs
- api_quotas
- sandbox_bindings
- api_scopes
- api_key_audit

### Migration 002 (New - Webhooks)
- webhooks (endpoints configuration)
- webhook_events (event catalog)
- webhook_deliveries (delivery attempts)
- webhook_delivery_attempts (retry history)

### Migration 003 (From 73bis - Enhanced)
- api_key_metrics (aggregated metrics)
- api_suspicious_events (SIRA detections)
- api_request_traces (OpenTelemetry)
- api_debug_packs (debug bundles)
- api_sira_recommendations

---

## 🆕 New Components to Create

### 1. Webhooks Service (~400 lines)
```typescript
// src/services/webhooks.ts
- createWebhook(tenantId, url, events)
- signPayload(payload, secret)
- deliverWebhook(webhookId, event)
- retryFailedDelivery(deliveryId)
- verifyWebhookSignature(payload, signature, secret)
```

### 2. Webhook Delivery Worker (~300 lines)
```typescript
// src/workers/webhookDelivery.ts
- Poll webhook_deliveries where status = 'pending'
- Attempt delivery with exponential backoff
- Update status (delivered/failed)
- DLQ for permanent failures
- Metrics tracking
```

### 3. Unified API Routes (~1200 lines total)
```typescript
// src/routes/apps.ts (~300 lines)
POST   /api/apps
GET    /api/apps
GET    /api/apps/:id
PATCH  /api/apps/:id
DELETE /api/apps/:id

// src/routes/keys.ts (~300 lines)
POST   /api/apps/:id/keys
GET    /api/apps/:id/keys
POST   /api/keys/:id/rotate
POST   /api/keys/:id/revoke

// src/routes/webhooks.ts (~300 lines)
POST   /api/apps/:id/webhooks
GET    /api/apps/:id/webhooks
PATCH  /api/webhooks/:id
DELETE /api/webhooks/:id
GET    /api/webhooks/:id/deliveries
POST   /api/webhooks/:id/test

// src/routes/observability.ts (~300 lines)
GET    /api/keys/:id/metrics
GET    /api/keys/:id/suspicious
GET    /api/keys/:id/recommendations
POST   /api/debug-packs
```

### 4. Enhanced Request Logger (~150 lines)
```typescript
// src/middleware/requestLogger.ts
- Log to api_request_logs (async)
- Capture request/response details
- Track latency
- Feed to SIRA Guard
- OpenTelemetry integration
```

### 5. Metrics Aggregator Worker (~300 lines)
```typescript
// src/workers/metricsAggregator.ts
- Hourly rollup of api_request_logs
- Calculate p50/p95/p99 latency
- Aggregate by key_id
- Run SIRA Guard analysis
- Store in api_key_metrics
```

---

## 📊 Enhanced Schema

### Webhooks Table (New)
```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES dev_apps(id),
  tenant_type TEXT,
  tenant_id UUID,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,              -- HMAC signing secret
  enabled BOOLEAN DEFAULT TRUE,
  event_types TEXT[],                -- ['payment.succeeded', 'refund.created']
  version TEXT DEFAULT 'v1',
  retry_config JSONB,                -- {max_attempts: 3, backoff: 'exponential'}
  headers JSONB,                     -- Custom headers
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  event_id UUID,                     -- Original event ID
  payload JSONB NOT NULL,
  signature TEXT,                    -- HMAC signature
  status TEXT,                       -- 'pending', 'delivered', 'failed'
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  response_code INTEGER,
  response_body TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);
```

---

## 🔗 Integration Points

### With Existing Briques
1. **Brique 45 (Webhooks)** - Reuse delivery infrastructure
2. **Brique 72 (Limits)** - Enforce rate limits on webhook deliveries
3. **SIRA (ML)** - Real-time anomaly detection

### External Services
1. **Vault/KMS** - Secret encryption
2. **OpenTelemetry** - Distributed tracing
3. **Prometheus** - Metrics collection
4. **Slack/PagerDuty** - Ops alerts

---

## 🚀 Implementation Priority

### Phase 1: Foundation (Week 1)
- [x] Merge SQL schemas
- [ ] Create webhooks tables
- [ ] Build webhooks service
- [ ] Create webhook delivery worker

### Phase 2: API Routes (Week 2)
- [ ] Apps CRUD routes
- [ ] Keys CRUD routes
- [ ] Webhooks CRUD routes
- [ ] Observability routes

### Phase 3: Observability (Week 3)
- [ ] Metrics aggregator worker
- [ ] Enhanced request logging
- [ ] SIRA Guard integration
- [ ] Debug pack generator

### Phase 4: UI & Polish (Week 4)
- [ ] React Developer Console
- [ ] Webhook delivery dashboard
- [ ] Metrics visualization
- [ ] Integration tests

---

## 📈 Success Metrics

- **API Key Creation**: <500ms (with Vault)
- **Webhook Delivery**: <2s (p95)
- **SIRA Detection**: <1s from anomaly to action
- **UI Responsiveness**: <100ms API calls
- **Uptime**: >99.9%

---

## 🎯 Differentiation vs Stripe

| Feature | Stripe | MoLam (B73 Industrial) |
|---------|--------|------------------------|
| API Keys | ✅ | ✅ Enhanced (Vault, rotation) |
| Webhooks | ✅ | ✅ + Replay + DLQ |
| Test Mode | ✅ | ✅ + Full sandbox isolation |
| Logs | Basic | ✅ Advanced (traces, metrics) |
| Rate Limiting | Manual | ✅ Auto + SIRA Guard |
| Anomaly Detection | ❌ | ✅ SIRA Guard (ML) |
| Debug Tools | Basic | ✅ Debug packs + replay |
| Recommendations | ❌ | ✅ AI-powered suggestions |
| Observability | Basic | ✅ Full (OTel + Prometheus) |

---

**Next Action:** Create Migration 002 (webhooks tables) and webhooks service.
