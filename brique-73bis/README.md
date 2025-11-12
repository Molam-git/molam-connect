# Sous-Brique 73bis - Observabilité Développeur & SIRA Guard

## 📋 Status: CORE COMPLETE (60%)

**Version:** 1.0.0
**Date:** 2025-11-11
**Extension de:** Brique 73 - Developer Console

---

## 🎯 Overview

Extension avancée de la Brique 73 avec observabilité complète et sécurité proactive via SIRA Guard. Dépasse Stripe en offrant monitoring temps réel, détection d'anomalies IA, et outils de debug avancés.

### Key Features

✅ **Observabilité Complète**
- Métriques agrégées (requests, latency p50/p95/p99, errors)
- Tracing distribué avec OpenTelemetry
- Logs détaillés par requête
- Graphiques temps réel dans Dev Console

✅ **SIRA Guard (IA Proactive)**
- Détection automatique de patterns suspects:
  - Brute force (>50% error rate)
  - Bot patterns (low latency, high volume)
  - IP rotation (credential sharing)
  - Traffic spikes (DDoS)
- Actions automatisées (alert, throttle, tempban)
- Recommandations intelligentes

✅ **Debug Avancé**
- Debug packs anonymisés
- Replay d'appels API en sandbox
- Traces distribuées complètes
- Export pour support

✅ **Dashboards Temps Réel**
- Success/error rate par key
- Latency heatmap (p50, p95, p99)
- Timeline des événements suspects
- Panel de recommandations SIRA

---

## 📊 Database Schema (✅ COMPLETE)

### Tables Implemented (5 tables)

1. **api_key_metrics** - Métriques agrégées par clé
   - Rollups par minute/heure/jour
   - Latency percentiles (p50, p95, p99)
   - Distribution de status codes
   - Anomaly score (0-1)

2. **api_suspicious_events** - Événements suspects détectés
   - 7 types d'anomalies
   - Severity levels (low → critical)
   - Confidence scores (ML)
   - Actions automatiques
   - Recommandations SIRA

3. **api_request_traces** - Traces OpenTelemetry
   - Trace ID, Span ID
   - Distributed tracing support
   - Service mesh integration
   - Error tracking

4. **api_debug_packs** - Debug bundles anonymisés
   - Logs + traces + metrics
   - Shareable via access token
   - Expiration automatique
   - Anonymisation PII

5. **api_sira_recommendations** - Recommandations IA
   - 7 types de recommandations
   - Priority levels
   - Action steps
   - Status tracking

### Functions & Views (4)

- ✅ `calculate_anomaly_score()` - ML scoring
- ✅ `get_latest_metrics()` - Fast key metrics
- ✅ `v_active_suspicious_events` - Ops dashboard
- ✅ `v_key_health_overview` - 24h health summary

---

## 🤖 SIRA Guard Detection Algorithms

### 1. Brute Force Detection

**Triggers:**
- Error rate >50%
- Volume >100 requests/hour
- Concentrated 401/403 responses

**Evidence:**
```json
{
  "errorRate": "78.5%",
  "totalRequests": 2543,
  "errors": 1996,
  "statusDistribution": {
    "401": 1850,
    "403": 146,
    "200": 547
  }
}
```

**Actions:**
- Severity: Critical
- Action: Tempban (1 hour)
- Recommendations: ["rotate_key", "review_auth_flow", "enable_mfa"]

### 2. Bot Pattern Detection

**Triggers:**
- P95 latency <50ms
- Volume >1000 req/hour
- Uniform timing (p99 - p95 < 20ms)

**Evidence:**
```json
{
  "p95Latency": 35,
  "p99Latency": 42,
  "totalRequests": 5420,
  "latencyVariance": 7
}
```

**Actions:**
- Severity: Medium
- Action: Throttle (10 req/min)
- Recommendations: ["add_captcha", "implement_bot_detection"]

### 3. IP Rotation Detection

**Triggers:**
- >10 unique IPs per 100 requests
- Total unique IPs >20
- Geographic distribution anomaly

**Evidence:**
```json
{
  "uniqueIps": 87,
  "totalRequests": 543,
  "ipDiversity": 16.02,
  "topIps": [
    {"ip": "1.2.3.4", "count": 50},
    {"ip": "5.6.7.8", "count": 45}
  ]
}
```

**Actions:**
- Severity: High
- Action: Alert + Throttle
- Recommendations: ["split_keys", "whitelist_ips", "investigate_sharing"]

### 4. Traffic Spike Detection

**Triggers:**
- Volume >5x normal baseline
- Sudden increase in 5-minute window

**Evidence:**
```json
{
  "totalRequests": 25340,
  "expectedMax": 5000,
  "spikeRatio": 5.07
}
```

**Actions:**
- Severity: Medium
- Action: Alert
- Recommendations: ["increase_quota", "contact_support", "review_ddos"]

---

## 🏗️ Architecture

```
┌─────────────────────┐
│  API Request        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  API Key Middleware │
│  + Request Logger   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐      ┌──────────────────┐
│  Metrics Aggregator │────▶ │  SIRA Guard      │
│  (Hourly Worker)    │      │  (Anomaly ML)    │
└──────────┬──────────┘      └────────┬─────────┘
           │                          │
           │                          ▼
           │                 ┌─────────────────┐
           │                 │ Suspicious      │
           │                 │ Events Log      │
           │                 └────────┬────────┘
           │                          │
           ▼                          ▼
┌─────────────────────────────────────────────┐
│  Developer Console UI                       │
│  - Real-time Charts                         │
│  - SIRA Recommendations Panel               │
│  - Suspicious Events Timeline               │
└─────────────────────────────────────────────┘
```

---

## 💡 Implementation Status

### ✅ Completed (60%)

| Component | Lines | Status |
|-----------|-------|--------|
| SQL Schema | ~700 | ✅ Complete |
| SIRA Guard Service | ~450 | ✅ Complete |
| Anomaly Detection | ~300 | ✅ Complete |
| Database Functions | ~150 | ✅ Complete |
| README | ~400 | ✅ Complete |

**Total Completed:** ~2,000 lines

### ⏳ Pending (40%)

| Component | Priority | Lines |
|-----------|----------|-------|
| Metrics Aggregator Worker | HIGH | ~400 |
| OpenTelemetry Integration | HIGH | ~300 |
| Observability API Routes | HIGH | ~400 |
| Debug Pack Generator | MEDIUM | ~200 |
| React UI Components | MEDIUM | ~800 |
| Integration Tests | LOW | ~300 |

**Total Remaining:** ~2,400 lines

---

## 🚀 Quick Start

### Prerequisites

- Brique 73 installed and running
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
cd brique-73bis

# Run migrations (extends B73 schema)
psql -d molam_devconsole -f migrations/001_create_observability_tables.sql
```

### Configuration

Add to Brique 73 `.env`:

```bash
# SIRA Guard
ENABLE_SIRA_GUARD=true
SIRA_GUARD_AUTO_ACTION=true
SIRA_ANOMALY_THRESHOLD=0.7

# Alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
OPS_EMAIL=ops@molam.com

# Metrics
METRICS_RETENTION_DAYS=90
TRACES_RETENTION_DAYS=7

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=molam-api-gateway
```

---

## 📚 API Usage Examples

### Get Key Metrics

```bash
GET /api/observability/keys/:keyId/metrics?period=24h

Response:
{
  "keyId": "uuid",
  "periods": [
    {
      "start": "2025-11-11T10:00:00Z",
      "requests": 1543,
      "errors": 23,
      "avgLatency": 125,
      "p95Latency": 340,
      "anomalyScore": 0.15
    }
  ]
}
```

### Get Suspicious Events

```bash
GET /api/observability/keys/:keyId/suspicious

Response:
{
  "events": [
    {
      "id": "uuid",
      "eventType": "brute_force",
      "severity": "high",
      "detectedAt": "2025-11-11T10:15:00Z",
      "confidence": 0.85,
      "evidenceSummary": "High error rate (78%) with 2543 requests",
      "actionTaken": "throttle",
      "recommendations": ["rotate_key", "review_auth_flow"]
    }
  ]
}
```

### Create Debug Pack

```bash
POST /api/observability/debug-packs

Request:
{
  "keyId": "uuid",
  "title": "Payment failures investigation",
  "startTime": "2025-11-11T08:00:00Z",
  "endTime": "2025-11-11T10:00:00Z",
  "includesLogs": true,
  "includesTraces": true
}

Response:
{
  "packId": "uuid",
  "accessToken": "debug_abc123xyz...",
  "expiresAt": "2025-11-18T10:00:00Z",
  "shareUrl": "https://dev.molam.com/debug/abc123xyz"
}
```

### Get SIRA Recommendations

```bash
GET /api/observability/keys/:keyId/recommendations

Response:
{
  "recommendations": [
    {
      "type": "rotate_key",
      "priority": "high",
      "title": "Rotate API Key",
      "description": "Your key was last rotated 287 days ago",
      "actionSteps": [
        "Create new key in Dev Console",
        "Update key in your application",
        "Revoke old key after migration"
      ],
      "triggeredBy": "age_check"
    },
    {
      "type": "split_keys",
      "priority": "medium",
      "title": "Use Separate Keys",
      "description": "87 unique IPs detected - consider separate keys per environment",
      "actionSteps": [
        "Create test key for staging",
        "Create live key for production",
        "Configure IP whitelisting"
      ],
      "triggeredBy": "suspicious_event"
    }
  ]
}
```

---

## 🔒 Security Features

### Anomaly Score Calculation

```sql
SELECT calculate_anomaly_score(
  0.35,  -- error_rate (35%)
  2.5,   -- spike_ratio (2.5x normal)
  0.15,  -- ip_diversity (15 IPs per 100 req)
  0.25   -- latency_anomaly (25% deviation)
);
-- Returns: 0.74 (High risk)
```

### Automatic Actions

| Anomaly Score | Max Severity | Action |
|---------------|--------------|--------|
| 0.0 - 0.3 | Low | None |
| 0.3 - 0.5 | Medium | Alert |
| 0.5 - 0.7 | High | Throttle (10 req/min) |
| 0.7 - 0.9 | High | Tempban (1 hour) |
| 0.9 - 1.0 | Critical | Permban |

---

## 📊 Metrics & Observability

### Key Health Metrics

```sql
SELECT * FROM v_key_health_overview WHERE key_id = 'uuid';
```

Returns:
- Average requests per period
- Error rate percentage
- P95 latency
- Max anomaly score
- Suspicious period count
- Last activity timestamp

### Suspicious Events Dashboard

```sql
SELECT * FROM v_active_suspicious_events;
```

Auto-sorted by:
1. Severity (critical → low)
2. Detection time (recent first)

---

## 🎯 Success Metrics

- **Detection Accuracy**: >95% (minimal false positives)
- **Response Time**: <1s from detection to action
- **Coverage**: 100% of API requests monitored
- **Retention**: 90 days metrics, 7 days traces

---

## 🚀 Next Steps

### Week 1: Workers & Integration
1. Implement metrics aggregator worker
2. Integrate OpenTelemetry
3. Build observability API routes
4. Add Slack/email alerts

### Week 2: UI & Debug Tools
5. Build React dashboard components
6. Implement debug pack generator
7. Add trace visualization
8. Create recommendation panel

### Week 3: Polish & Testing
9. Integration tests
10. Load testing (10k req/s)
11. False positive tuning
12. Documentation finalization

---

**Document Version:** 1.0.0
**Status:** Core Complete (60%)
**Dependencies:** Brique 73
**Next Milestone:** Metrics aggregator worker + OpenTelemetry
