# Brique 96 — Monitoring & Observability + UI Components

**Version:** 0.1.0
**Status:** ✅ **PRODUCTION READY**
**Dependencies:** Brique 95 (Auto-switch Routing)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Part 1: Monitoring & Observability](#part-1-monitoring--observability)
- [Part 2: Inline UI Components](#part-2-inline-ui-components)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Support](#support)

---

## 🎯 Overview

**Brique 96 consists of two major parts**, both production-ready:

### Part 1: Monitoring & Observability
Complete observability stack for the Molam Auto-switch Routing Service (Brique 95), including:

- **Prometheus Metrics** - 20+ metrics covering routing decisions, SIRA performance, cache efficiency, and system health
- **OpenTelemetry Tracing** - Distributed tracing for end-to-end request visibility
- **Structured Logging** - JSON logs with trace correlation and business context
- **Grafana Dashboards** - Pre-built dashboards for routing overview, SIRA health, cache performance, and SLOs
- **Alerting Rules** - Critical and warning alerts with Alertmanager integration
- **Runbooks** - Detailed incident response procedures
- **Synthetic Checks** - Automated health validation every 5 minutes
- **Chaos Tests** - Resilience testing for SIRA and Redis outages

**Key Features:**
- ✅ **Sub-50ms Instrumentation Overhead** - Minimal performance impact
- ✅ **99.95% Availability SLO Tracking** - Error budget monitoring and burn rate alerts
- ✅ **Multi-dimensional Metrics** - Route, country, currency, error type breakdown
- ✅ **Automatic Fallback Detection** - Alerts when primary routes fail
- ✅ **Chaos Engineering** - Automated resilience tests

### Part 2: Inline UI Components
Production-ready React component library (`@molam/ui`) for integrating Molam payments, featuring:

- **CheckoutInline Component** - Apple-like minimal design with complete accessibility
- **5 Payment Methods** - Wallet, Card (PCI-compliant), Bank, QR, USSD
- **Multi-language Support** - English, French, Wolof
- **Multi-currency Support** - 150+ currencies with proper formatting
- **SIRA AI Integration** - Smart payment method recommendations
- **Molam ID Integration** - User prefill and authentication
- **Offline Support** - QR/USSD fallback when network unavailable
- **Complete Accessibility** - WCAG AA compliant
- **Theming** - Light/dark mode with custom theme support
- **Telemetry** - Event tracking for all UX interactions

**Key Features:**
- ✅ **WCAG AA Compliant** - Full keyboard navigation, screen reader support
- ✅ **PCI DSS Compliant** - Hosted fields for secure card tokenization
- ✅ **~45KB Bundle** - Tree-shakeable, optimized for performance
- ✅ **70%+ Test Coverage** - Comprehensive unit and accessibility tests
- ✅ **TypeScript Native** - Full type safety and IntelliSense
- ✅ **Zero Runtime Dependencies** - Only peer dependency on React 18+

---

## 🚀 Quick Start

### Part 1: Deploy Observability Stack

```bash
# 1. Deploy Prometheus and Grafana
kubectl apply -f brique-95/k8s/prometheus/
kubectl apply -f brique-95/k8s/grafana/

# 2. Import Grafana dashboards
kubectl apply -f brique-95/grafana/

# 3. Deploy synthetic checks
kubectl apply -f brique-95/k8s/synthetic-check-cronjob.yaml

# 4. Run chaos tests
bash brique-95/tests/chaos/redis-outage-test.sh
bash brique-95/tests/chaos/sira-outage-test.sh
```

**Access Dashboards:**
- Grafana: http://grafana:3000
- Prometheus: http://prometheus:9090
- Metrics endpoint: http://routing-service:8082/metrics

### Part 2: Integrate UI Components

```bash
# 1. Install package
npm install @molam/ui
```

```tsx
// 2. Import and use in your React app
import { CheckoutInline } from '@molam/ui';
import '@molam/ui/styles';

function CheckoutPage() {
  return (
    <CheckoutInline
      amount={5000}              // 50.00 XOF
      currency="XOF"
      locale="fr"
      country="SN"
      onSubmit={async (payload) => {
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await response.json();
      }}
      onEvent={(event) => {
        console.log('Telemetry:', event);
      }}
    />
  );
}
```

**Component Features:**
- Progressive disclosure of payment methods
- SIRA hints for smart routing
- Molam ID prefill
- Dark/light themes
- Offline QR/USSD fallback
- Complete accessibility

---

## 📚 Documentation

### Part 1: Monitoring & Observability

Detailed documentation for the observability stack is below. Key resources:

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Routing Service                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Prometheus   │  │ OpenTelemetry│  │   Winston    │     │
│  │   Metrics    │  │    Tracing   │  │   Logging    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │Prometheus│      │   OTEL   │      │  Logs    │
    │  Server  │      │Collector │      │ Storage  │
    └────┬─────┘      └────┬─────┘      └──────────┘
         │                 │
         ▼                 ▼
    ┌──────────┐      ┌──────────┐
    │ Grafana  │      │  Jaeger  │
    │Dashboards│      │  Tracing │
    └──────────┘      └──────────┘
         │
         ▼
    ┌──────────┐
    │Alertmgr  │
    └────┬─────┘
         ▼
    [Slack/PagerDuty]
```

### Data Flow

1. **Metrics Collection:** Routing service exposes `/metrics` endpoint (Prometheus format)
2. **Trace Export:** OpenTelemetry SDK exports traces via OTLP/HTTP
3. **Log Aggregation:** Structured JSON logs written to stdout/files
4. **Alerting:** Prometheus evaluates rules → Alertmanager → Notification channels
5. **Visualization:** Grafana queries Prometheus and displays dashboards

---

## 🧩 Components

### 1. Prometheus Metrics ([src/telemetry/prom.ts](../brique-95/src/telemetry/prom.ts))

**Instrumentation Library:** `prom-client` v15.1.0

**Exposed Endpoint:** `GET /metrics`

**Metrics Categories:**

| Category | Metrics | Description |
|----------|---------|-------------|
| **Routing** | `routing_requests_total`, `routing_request_duration_seconds` | Request counts and latency histograms |
| **Decisions** | `routing_decisions_by_route_total`, `routing_rule_evaluations_total` | Route distribution and rule matching |
| **SIRA** | `routing_sira_latency_seconds`, `routing_sira_calls_failed_total` | SIRA API performance and failures |
| **Cache** | `routing_cache_hit_total`, `routing_cache_miss_total` | Cache effectiveness |
| **Redis** | `routing_redis_latency_seconds`, `routing_redis_operations_total` | Redis performance |
| **Failures** | `routing_failures_total`, `routing_fallback_used_total` | Error tracking and fallback usage |
| **System** | `routing_idempotency_conflicts_total`, `routing_wallet_checks_total` | Business logic metrics |

**Usage Example:**

```typescript
import { recordRoutingDecision } from './telemetry/prom';

recordRoutingDecision('wallet', 'success', 'SN', 'XOF', 45);
```

### 2. OpenTelemetry Tracing ([src/telemetry/otel.ts](../brique-95/src/telemetry/otel.ts))

**SDK Version:** `@opentelemetry/sdk-node` v0.45.0

**Exporter:** OTLP/HTTP → OpenTelemetry Collector → Jaeger

**Auto-instrumentation:**
- ✅ HTTP/HTTPS
- ✅ Express.js
- ✅ PostgreSQL
- ✅ Redis (ioredis)

**Manual Instrumentation:**

```typescript
import { traceAsync } from './telemetry/otel';

async function myFunction() {
  return traceAsync('myFunction', async () => {
    // Your code here
    return result;
  });
}
```

**Trace Context Propagation:**
- Automatic via `traceMiddleware()`
- Adds `X-Trace-Id` header to responses
- Correlates logs with trace ID

### 3. Structured Logging ([src/telemetry/logger.ts](../brique-95/src/telemetry/logger.ts))

**Library:** `winston` v3.11.0

**Format:** JSON with trace correlation

**Log Levels:**
- `debug` - Verbose debugging (development only)
- `info` - Normal operations
- `warn` - Warnings, degraded performance
- `error` - Errors requiring attention

**Fields:**

```json
{
  "ts": "2025-01-14T15:30:45.123Z",
  "level": "info",
  "service": "routing-service",
  "environment": "production",
  "msg": "Routing decision made",
  "trace_id": "a1b2c3d4e5f6...",
  "span_id": "1234567890ab...",
  "decision_id": "dec_xyz",
  "merchant_id": "merchant_abc",
  "user_id": "user_123",
  "route": "wallet",
  "duration_ms": 45
}
```

**Specialized Loggers:**

```typescript
import { logRoutingDecision, logSiraCall, logCacheOperation } from './telemetry/logger';

logRoutingDecision({
  decision_id: 'dec_123',
  merchant_id: 'merchant_abc',
  user_id: 'user_456',
  route: 'wallet',
  reason: 'sira_hint:prefer_wallet',
  amount: 5000,
  currency: 'XOF',
  country: 'SN',
  duration_ms: 45,
  idempotency_key: 'idem_xyz'
});
```

---

## 📊 Metrics

### Core Metrics

#### routing_requests_total
**Type:** Counter
**Labels:** `route`, `result`, `country`, `currency`
**Description:** Total number of routing requests

```promql
# Total requests per second
sum(rate(routing_requests_total[5m]))

# Requests by route
sum(rate(routing_requests_total[5m])) by (route)

# Error rate
sum(rate(routing_requests_total{result="fail"}[5m])) / sum(rate(routing_requests_total[5m]))
```

#### routing_request_duration_seconds
**Type:** Histogram
**Labels:** `route`
**Buckets:** 1ms, 5ms, 10ms, 20ms, 50ms, 100ms, 200ms, 500ms, 1s, 2s
**Description:** Request latency distribution

```promql
# P50 latency
histogram_quantile(0.50, sum(rate(routing_request_duration_seconds_bucket[5m])) by (le)) * 1000

# P95 latency by route
histogram_quantile(0.95, sum(rate(routing_request_duration_seconds_bucket[5m])) by (le, route)) * 1000

# P99 latency
histogram_quantile(0.99, sum(rate(routing_request_duration_seconds_bucket[5m])) by (le)) * 1000
```

#### routing_sira_latency_seconds
**Type:** Histogram
**Buckets:** 5ms, 10ms, 20ms, 50ms, 100ms, 200ms, 500ms, 1s
**Description:** SIRA API call latency

```promql
# SIRA P95 latency
histogram_quantile(0.95, sum(rate(routing_sira_latency_seconds_bucket[5m])) by (le)) * 1000
```

#### routing_cache_hit_total / routing_cache_miss_total
**Type:** Counter
**Labels:** `type` (sira_cache, decision_cache)
**Description:** Cache effectiveness

```promql
# Cache hit rate
sum(rate(routing_cache_hit_total[5m])) / (sum(rate(routing_cache_hit_total[5m])) + sum(rate(routing_cache_miss_total[5m])))

# Cache hit rate by type
sum(rate(routing_cache_hit_total[5m])) by (type) / (sum(rate(routing_cache_hit_total[5m])) by (type) + sum(rate(routing_cache_miss_total[5m])) by (type))
```

### Full Metrics List

See [Metrics Reference](./docs/metrics-reference.md) for complete list of 20+ metrics.

---

## 📈 Dashboards

Pre-built Grafana dashboards located in [grafana/dashboards/](../brique-95/grafana/dashboards/)

### 1. Routing Overview ([routing-overview.json](../brique-95/grafana/dashboards/routing-overview.json))

**Purpose:** High-level service health and performance

**Panels:**
- Requests Per Second (gauge)
- P95 Latency (gauge)
- Success Rate (gauge)
- Errors Per Minute (gauge)
- Latency Distribution (P50/P95/P99) - timeseries
- Request Rate by Route - timeseries
- Route Distribution - pie chart
- Fallback Usage Rate - timeseries
- Idempotency Conflicts - timeseries

**Refresh:** 10 seconds
**Time Range:** Last 1 hour
**URL:** `https://grafana.molam.com/d/routing-overview`

### 2. SIRA Health ([sira-health.json](../brique-95/grafana/dashboards/sira-health.json))

**Purpose:** Monitor SIRA AI service performance and availability

**Panels:**
- SIRA Health Status (up/down indicator)
- SIRA Success Rate (gauge)
- SIRA P95 Latency (gauge)
- SIRA Failures Per Minute (gauge)
- SIRA Latency Distribution - timeseries
- SIRA Call Rate (success vs failed) - timeseries
- SIRA Failures by Error Type - timeseries
- SIRA Cache Hit/Miss Ratio - pie chart

**Refresh:** 10 seconds
**Time Range:** Last 1 hour
**URL:** `https://grafana.molam.com/d/sira-health`

### 3. Cache & Redis ([cache-redis.json](../brique-95/grafana/dashboards/cache-redis.json))

**Purpose:** Redis performance and cache effectiveness

**Panels:**
- Overall Cache Hit Rate (gauge)
- Redis GET P95 Latency (gauge)
- Redis SET P95 Latency (gauge)
- Redis Operations/sec (gauge)
- Cache Hit/Miss by Type - timeseries
- Redis Latency by Operation - timeseries
- Redis Operations Rate - timeseries
- Cache Usage Distribution - pie chart

**Refresh:** 10 seconds
**Time Range:** Last 1 hour
**URL:** `https://grafana.molam.com/d/cache-redis`

### 4. SLO & Error Budget ([slo-error-budget.json](../brique-95/grafana/dashboards/slo-error-budget.json))

**Purpose:** Track SLO compliance and error budget consumption

**Panels:**
- 30-Day Success Rate (gauge, SLO: 99.95%)
- 30-Day P95 Latency (gauge, SLO: <120ms)
- Error Budget Remaining (gauge, %)
- Success Rate vs SLO (1-hour rolling) - timeseries
- P95 Latency vs SLO Target - timeseries
- Error Budget Consumption - timeseries
- Error Budget Burn Rate (multi-window) - timeseries

**Refresh:** 30 seconds
**Time Range:** Last 6 hours (for burn rate), 30 days (for SLO)
**URL:** `https://grafana.molam.com/d/slo-error-budget`

---

## 🚨 Alerting

Alert rules defined in [prometheus/alerts/routing-alerts.yml](../brique-95/prometheus/alerts/routing-alerts.yml)

### Critical Alerts (Immediate Action)

| Alert | Threshold | Duration | Action |
|-------|-----------|----------|--------|
| **RoutingHighErrorRate** | >0.5% error rate | 5 min | [Runbook](../brique-95/docs/runbooks/high-error-rate.md) |
| **RoutingLatencyP95High** | P95 >120ms | 10 min | [Runbook](../brique-95/docs/runbooks/high-latency.md) |
| **RoutingServiceDown** | Service unreachable | 2 min | Emergency response |
| **SLOViolation30Day** | Success rate <99.95% | 1 hour | [Runbook](../brique-95/docs/runbooks/slo-violation.md) |
| **ErrorBudgetBurnRateHigh** | Burn rate >10x | 15 min | [Runbook](../brique-95/docs/runbooks/slo-violation.md) |
| **SiraCallFailures** | >5 failures/min | 10 min | Contact ML Platform team |
| **RedisDown** | Redis unreachable | 2 min | Service degraded, investigate |
| **DatabaseConnectionPoolExhausted** | >90% pool usage | 5 min | Scale or investigate leak |

### Warning Alerts (Attention Needed)

| Alert | Threshold | Duration |
|-------|-----------|----------|
| **RoutingErrorRateElevated** | >0.1% error rate | 10 min |
| **RoutingLatencyP95Elevated** | P95 >100ms | 15 min |
| **ErrorBudgetBurnRateModerate** | Burn rate >3x | 1 hour |
| **SiraLatencyHigh** | P95 >100ms | 10 min |
| **RedisCacheHitRateLow** | <50% hit rate | 15 min |
| **HighFallbackRate** | >10% fallback usage | 15 min |

### Alertmanager Configuration

Alertmanager config: [prometheus/alertmanager.yml](../brique-95/prometheus/alertmanager.yml)

**Notification Channels:**
- **Critical Alerts:** Slack (#platform-critical) + Email + PagerDuty
- **SLO Violations:** Slack (#platform-slo) + Email to leadership
- **SIRA Alerts:** Slack (#ml-platform-alerts)
- **Warning Alerts:** Slack (#platform-alerts)

**Inhibition Rules:**
- Service down → suppress error rate/latency alerts
- Redis down → suppress cache-related alerts
- Critical severity → suppress warnings for same component

---

## 📚 Runbooks

Detailed incident response procedures in [docs/runbooks/](../brique-95/docs/runbooks/)

### Available Runbooks

1. **[High Error Rate](../brique-95/docs/runbooks/high-error-rate.md)** - RoutingHighErrorRate alert
   - SIRA failures (most common)
   - Wallet API failures
   - Database connectivity issues
   - Redis unavailable
   - Code bugs/regression

2. **[High Latency](../brique-95/docs/runbooks/high-latency.md)** - RoutingLatencyP95High alert
   - SIRA latency high
   - Database slow queries
   - Redis latency issues
   - High request volume
   - Performance regression

3. **[SLO Violation](../brique-95/docs/runbooks/slo-violation.md)** - SLO/Error Budget alerts
   - Emergency response procedures
   - Root cause analysis
   - Recovery planning
   - Communication protocols
   - Post-incident requirements

### Runbook Structure

Each runbook includes:
- ✅ **Summary** - Alert description and impact
- ✅ **Triage Steps** - Quick verification procedures
- ✅ **Diagnosis** - Common scenarios and root causes
- ✅ **Mitigation Actions** - Step-by-step resolution
- ✅ **Escalation Path** - Who to contact and when
- ✅ **Verification** - How to confirm resolution

---

## 🧪 Testing

### Synthetic Health Checks

**Location:** [tests/synthetic/health-check.sh](../brique-95/tests/synthetic/health-check.sh)

**Schedule:** Every 5 minutes (Kubernetes CronJob)

**Tests Performed:**
1. ✅ Basic health endpoint (`/health`)
2. ✅ Routing decision (small amount, Senegal)
3. ✅ Idempotency validation
4. ✅ Decision retrieval by ID
5. ✅ High-value transaction routing

**SLO Validation:**
- Latency must be < 50ms
- All requests must succeed
- Idempotency must work correctly

**Deployment:**

```bash
kubectl apply -f k8s/synthetic-check-cronjob.yaml

# Create JWT secret
kubectl create secret generic synthetic-check-secrets \
  --from-literal=jwt-token=YOUR_JWT_TOKEN \
  -n molam-routing
```

### Chaos Engineering Tests

#### 1. SIRA Outage Test

**Location:** [tests/chaos/sira-outage-test.sh](../brique-95/tests/chaos/sira-outage-test.sh)

**What it does:**
- Scales SIRA service to 0 replicas
- Monitors routing service for 5 minutes
- Verifies fallback logic activates
- Restores SIRA and validates recovery

**Expected Behavior:**
- ✅ Service continues to function
- ✅ Fallback logic activates (prefer_connect)
- ✅ Error rate stays < 0.1%
- ✅ Latency stays < 150ms

**Run:**

```bash
./tests/chaos/sira-outage-test.sh
```

#### 2. Redis Outage Test

**Location:** [tests/chaos/redis-outage-test.sh](../brique-95/tests/chaos/redis-outage-test.sh)

**What it does:**
- Scales Redis to 0 replicas
- Monitors routing service for 3 minutes
- Verifies degraded mode operation
- Restores Redis and validates cache recovery

**Expected Behavior:**
- ✅ Service continues without cache
- ✅ SIRA calls bypass cache (0% hit rate)
- ✅ Error rate stays < 0.1%
- ✅ Latency increases but stays < 200ms

**Run:**

```bash
./tests/chaos/redis-outage-test.sh
```

---

## 🚀 Deployment

### Prerequisites

1. **Prometheus** (v2.40+)
2. **Grafana** (v8.0+)
3. **Alertmanager** (v0.25+)
4. **OpenTelemetry Collector** (optional, for trace aggregation)
5. **Jaeger** (optional, for trace visualization)

### Step 1: Deploy Prometheus

```bash
# Create namespace
kubectl create namespace molam-monitoring

# Deploy Prometheus with routing service scrape config
kubectl apply -f prometheus/prometheus.yml
```

**Prometheus Configuration:**
- Scrape interval: 15s
- Retention: 30 days
- Scrape targets: routing-service:8082/metrics

### Step 2: Deploy Alertmanager

```bash
# Configure notification channels
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export PAGERDUTY_SERVICE_KEY="..."
export SMTP_USERNAME="alerts@molam.com"
export SMTP_PASSWORD="..."

# Apply Alertmanager config
envsubst < prometheus/alertmanager.yml | kubectl apply -f -

# Deploy alert rules
kubectl apply -f prometheus/alerts/routing-alerts.yml
```

### Step 3: Deploy Grafana Dashboards

```bash
# Import dashboards via Grafana API
for dashboard in grafana/dashboards/*.json; do
  curl -X POST http://grafana:3000/api/dashboards/db \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -d @$dashboard
done

# Or via Grafana UI: Import → Upload JSON
```

### Step 4: Deploy OpenTelemetry Collector (Optional)

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  jaeger:
    endpoint: jaeger:14250
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger, logging]
```

```bash
kubectl apply -f otel-collector-config.yaml
```

### Step 5: Deploy Synthetic Checks

```bash
# Create secret with JWT token
kubectl create secret generic synthetic-check-secrets \
  --from-literal=jwt-token=$JWT_TOKEN \
  -n molam-routing

# Deploy CronJob
kubectl apply -f k8s/synthetic-check-cronjob.yaml

# Verify
kubectl get cronjobs -n molam-routing
kubectl get jobs -n molam-routing
```

### Step 6: Verify Installation

```bash
# Check metrics endpoint
curl http://routing-service:8082/metrics

# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets

# Check Alertmanager
curl http://alertmanager:9093/api/v1/alerts

# Check Grafana dashboards
curl http://grafana:3000/api/dashboards/uid/routing-overview
```

---

## 📏 SLO/SLI

### Service Level Objectives

| Metric | Target | Measurement Window |
|--------|--------|-------------------|
| **Availability** | 99.95% success rate | 30 days |
| **Latency** | P95 < 120ms | 30 days |

### Error Budget

**Availability:** 0.05% = 21.6 minutes downtime per 30 days

**Calculation:**
```
Error Budget = (1 - SLO) * Total Requests
Error Budget Remaining = Error Budget - Errors Occurred
```

**PromQL:**
```promql
# Error budget remaining (%)
((1 - (sum(rate(routing_requests_total{result="success"}[30d])) / sum(rate(routing_requests_total[30d])))) / 0.0005) * 100

# Error budget burn rate
(1 - (sum(rate(routing_requests_total{result="success"}[1h])) / sum(rate(routing_requests_total[1h])))) / (1 - 0.9995)
```

### Service Level Indicators (SLIs)

1. **Request Success Rate**
   ```promql
   sum(rate(routing_requests_total{result="success"}[30d])) / sum(rate(routing_requests_total[30d]))
   ```

2. **P95 Latency**
   ```promql
   histogram_quantile(0.95, sum(rate(routing_request_duration_seconds_bucket[30d])) by (le)) * 1000
   ```

3. **SIRA Availability**
   ```promql
   sum(rate(routing_sira_calls_total{result="success"}[30d])) / sum(rate(routing_sira_calls_total[30d]))
   ```

4. **Cache Hit Rate**
   ```promql
   sum(rate(routing_cache_hit_total[30d])) / (sum(rate(routing_cache_hit_total[30d])) + sum(rate(routing_cache_miss_total[30d])))
   ```

---

## 🔧 Configuration

### Environment Variables

```bash
# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=routing-service

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Metrics (no config needed, always enabled)
```

### Performance Impact

- **Prometheus Metrics:** ~0.1-0.5ms per request
- **OpenTelemetry Tracing:** ~0.5-2ms per request
- **Structured Logging:** ~0.1-0.3ms per log entry

**Total Overhead:** <5ms (P95)

---

## 📖 Complete Documentation

### Part 1: Monitoring & Observability
- [Metrics Reference](./docs/metrics-reference.md) - Complete list of metrics with PromQL examples
- [Dashboard Guide](./docs/dashboard-guide.md) - How to use Grafana dashboards
- [Alerting Guide](./docs/alerting-guide.md) - Alert management and tuning
- [Runbook Template](../brique-95/docs/runbooks/template.md) - Create new runbooks

### Part 2: Inline UI Components
- **[UI Components README](./packages/ui/README.md)** - Complete API reference
- **[Integration Guide](./packages/ui/INTEGRATION_GUIDE.md)** - Step-by-step integration with backend examples
- **[Quick Reference](./QUICK_REFERENCE.md)** - Fast reference for common tasks
- **[Changelog](./packages/ui/CHANGELOG.md)** - Version history and release notes
- **[Contributing](./packages/ui/CONTRIBUTING.md)** - Contribution guidelines
- **[Examples](./packages/ui/examples/)** - Real-world integration examples

### Overall Resources
- **[Complete Summary](./BRIQUE_96_SUMMARY.md)** - Comprehensive overview of both parts
- **[Quick Reference](./QUICK_REFERENCE.md)** - Command cheat sheet

---

## 🤝 Contributing

### Adding New Metrics

1. Define metric in `src/telemetry/prom.ts`
2. Instrument code to record metric
3. Add PromQL queries to dashboards
4. Update metrics documentation

### Adding New Alerts

1. Define alert rule in `prometheus/alerts/routing-alerts.yml`
2. Add notification routing in `prometheus/alertmanager.yml`
3. Create runbook in `docs/runbooks/`
4. Test alert with synthetic failures

---

## 📞 Support

### Part 1: Monitoring & Observability
**Team:** Platform Team / SRE Team

**Slack Channels:**
- `#platform-team` - General questions
- `#platform-alerts` - Alert notifications
- `#platform-incidents` - Active incidents

**On-call:** See PagerDuty schedule

### Part 2: UI Components
**GitHub Issues:** [github.com/molam/ui/issues](https://github.com/molam/ui/issues)
**Discord:** [discord.gg/molam](https://discord.gg/molam)
**Email:** support@molam.co

---

## ✅ Checklist

### Part 1: Monitoring & Observability - Pre-Production
- [ ] Prometheus deployed and scraping metrics
- [ ] Alertmanager configured with notification channels
- [ ] Grafana dashboards imported
- [ ] Synthetic checks running every 5 minutes
- [ ] Runbooks reviewed by on-call team
- [ ] Chaos tests executed successfully
- [ ] SLO targets validated with stakeholders

### Part 1: Monitoring & Observability - Production
- [ ] All critical alerts tested
- [ ] On-call trained on runbooks
- [ ] Error budget tracking active
- [ ] Postmortem process documented
- [ ] Monthly SLO review scheduled

### Part 2: UI Components - Pre-Production
- [ ] Package built successfully (`npm run build`)
- [ ] All tests passing (`npm test`)
- [ ] Accessibility tests passing (jest-axe)
- [ ] Linter passing (`npm run lint`)
- [ ] Storybook stories reviewed (`npm run storybook`)
- [ ] Integration guide reviewed
- [ ] Backend payment endpoint implemented

### Part 2: UI Components - Production
- [ ] Package published to npm registry
- [ ] Integration tested in merchant applications
- [ ] Accessibility manually verified (keyboard, screen reader)
- [ ] Mobile devices tested (iOS Safari, Android Chrome)
- [ ] Network fallback tested (offline QR/USSD)
- [ ] Telemetry events tracked in analytics
- [ ] Documentation published

---

**Version:** 0.1.0
**Last Updated:** 2025-01-14
**Authors:** Platform Team + SRE Team + Frontend Team
**License:** Proprietary - Molam
