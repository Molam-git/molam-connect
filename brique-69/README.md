# Brique 69 — Real-Time Analytics Dashboard

> Industrial-grade analytics platform for Molam Connect with real-time ingestion, OLAP storage, RBAC, and Apple-like UI.

## Overview

Brique 69 provides a comprehensive analytics solution for Molam Connect, delivering real-time business and operational KPIs with:

- **Real-time data ingestion** via Kafka
- **OLAP storage** with PostgreSQL materialized views
- **Multi-currency consolidation** with daily FX rates
- **RBAC integration** (Brique 68)
- **SIRA anomaly detection** integration
- **Apple-like responsive UI** with React
- **Prometheus metrics** and Grafana dashboards
- **Configurable alerts** and notifications

## Features

### Core Analytics
- Gross volume, net revenue, fees, refunds, chargebacks
- Transaction counts and success rates
- Multi-dimensional analysis (region, country, merchant, product, payment method)
- Hourly and daily aggregations
- Real-time live counters (last hour)

### Data Processing
- Kafka consumer for event ingestion
- Incremental upsert for hourly aggregates
- Materialized views for daily rollups
- Redis caching for hot queries
- FX rate conversion to USD

### Alerts & Monitoring
- Configurable alert rules (thresholds, anomalies, patterns)
- SIRA integration for ML-based anomaly detection
- Webhook notifications
- Auto-actions (pause payouts, flag merchants)
- Alert management UI

### Observability
- Prometheus metrics export
- Grafana dashboard templates
- Request tracing
- Slow query logging
- Consumer lag monitoring

## Architecture

```
┌─────────────┐
│  Wallet     │
│  Service    │
└──────┬──────┘
       │ Events
       ▼
┌─────────────┐      ┌──────────────┐
│   Kafka     │─────▶│   Consumer   │
│  (Events)   │      │  (Ingest)    │
└─────────────┘      └──────┬───────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  PostgreSQL  │
                     │  (OLAP)      │
                     └──────┬───────┘
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐      ┌──────────────┐    ┌─────────────┐
│   Redis     │      │  Analytics   │    │   Alerts    │
│  (Cache)    │◀────▶│     API      │◀───│  Evaluator  │
└─────────────┘      └──────┬───────┘    └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  React UI    │
                     │  (Dashboard) │
                     └──────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Kafka 3.6+

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate

# Start services
npm run dev          # API server
npm run consumer     # Kafka consumer
npm run alerts       # Alert evaluator

# Start web UI
cd web && npm install && npm run dev
```

### Docker Compose

```bash
docker-compose up -d
```

This starts:
- Analytics API (port 8082)
- Kafka consumer
- Alert evaluator
- PostgreSQL, Redis, Kafka

### Kubernetes

```bash
# Apply configurations
kubectl apply -f kubernetes/

# Check status
kubectl get pods -n molam -l brique=69
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `KAFKA_BROKERS` | Kafka broker list | `localhost:9092` |
| `KAFKA_TOPIC_TRANSACTIONS` | Transaction events topic | `wallet_txn_created` |
| `KAFKA_TOPIC_ANOMALIES` | SIRA anomalies topic | `analytics.anomaly` |
| `JWT_SECRET` | JWT signing secret | - |
| `SIRA_ENABLED` | Enable SIRA integration | `false` |
| `PORT` | API server port | `8082` |

### Alert Rules

Create alert rules via API:

```bash
curl -X POST http://localhost:8082/api/analytics/alerts/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Refund Rate",
    "metric": "refund_rate",
    "comparator": ">",
    "threshold": 5.0,
    "window_minutes": 60,
    "severity": "warn",
    "notify_channels": ["webhook"],
    "webhook_url": "https://alerts.molam.io/webhook"
  }'
```

## API Documentation

### Endpoints

#### GET `/api/analytics/summary`
Returns aggregated transaction metrics.

**Query Parameters:**
- `from` (required): Start date (YYYY-MM-DD)
- `to` (required): End date (YYYY-MM-DD)
- `granularity`: `day` or `hour` (default: `day`)
- `merchantId`: Filter by merchant UUID
- `region`: Filter by region
- `country`: Filter by country code

**Response:**
```json
[
  {
    "hour": "2025-07-15T10:00:00Z",
    "region": "CEDEAO",
    "country": "SN",
    "merchant_id": "...",
    "gross_usd": 12500.50,
    "net_usd": 11250.45,
    "fees_usd": 1250.05,
    "tx_count": 150,
    "success_count": 148
  }
]
```

#### GET `/api/analytics/kpis`
Returns aggregated KPIs for a period.

**Response:**
```json
{
  "gross_volume": 125000.50,
  "net_revenue": 112500.45,
  "fees_collected": 12500.05,
  "refunds": 500.00,
  "tx_count": 1500,
  "success_count": 1485,
  "success_rate": 99.0
}
```

#### GET `/api/analytics/timeseries`
Returns time-series data for charting.

**Query Parameters:**
- `metric`: `gross`, `net`, or `fees`
- `from`, `to`: Date range
- `interval`: `day` or `hour`
- `merchantId`: Optional merchant filter

**Response:**
```json
[
  { "t": "2025-07-15", "v": 12500.50 },
  { "t": "2025-07-16", "v": 13200.75 }
]
```

#### GET `/api/analytics/top/merchants`
Returns top merchants by volume (requires `analytics:ops` permission).

#### GET `/api/analytics/alerts`
Returns alerts with filtering.

**Query Parameters:**
- `status`: `open`, `acknowledged`, `resolved`, `closed`
- `severity`: `info`, `warn`, `critical`
- `limit`: Max results (default: 50)

#### PATCH `/api/analytics/alerts/:id`
Update alert status.

**Body:**
```json
{
  "status": "acknowledged",
  "resolution_notes": "Investigated and resolved"
}
```

## UI Dashboard

The React dashboard provides:

- **Overview page** with KPI cards and charts
- **Drill-down capabilities** by region, country, merchant
- **Real-time updates** with live counters
- **Alert management** interface
- **Date range picker** and granularity selector
- **Export to CSV/PDF** (planned)

Access at: `http://localhost:3000`

## RBAC Permissions

| Permission | Description |
|------------|-------------|
| `analytics:view` | View analytics for own merchant |
| `analytics:ops` | View cross-merchant analytics |
| `analytics:admin` | Manage alert rules and configurations |

Merchants can only see their own data. Ops and admin roles have wider access.

## Performance

### Targets
- **Ingestion**: 2,000 events/sec per consumer pod
- **Aggregation latency**: < 60 seconds for hourly buckets
- **API latency**: P50 < 30ms (cached), P95 < 200ms
- **Cache hit rate**: > 70%

### Scaling
- **Horizontal**: Scale API and consumer pods via HPA
- **Vertical**: Increase database resources as needed
- **Caching**: Redis for hot queries and live counters
- **Partitioning**: Date-based partitioning for large datasets

## Testing

```bash
# Run tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Monitoring

### Prometheus Metrics
- `analytics_ingest_events_total` - Events ingested
- `analytics_ingest_errors_total` - Ingestion errors
- `analytics_api_request_duration_seconds` - API latency
- `analytics_cache_hits_total` - Cache hits
- `analytics_anomalies_detected_total` - Anomalies detected

### Grafana Dashboards
Import dashboard template from `grafana/dashboard_analytics.json`.

## Troubleshooting

See [Runbook](./runbooks/analytics_runbook.md) for detailed troubleshooting procedures.

### Common Issues

**High API Latency**
- Check cache hit rate
- Review slow query log
- Scale API pods

**Consumer Lag**
- Scale consumer pods
- Increase database connection pool
- Check Kafka partition assignment

**Incorrect Aggregates**
- Refresh materialized view
- Check for duplicate events
- Run backfill script

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file

## Support

- **Email**: support@molam.io
- **Slack**: #molam-analytics
- **Issues**: github.com/molam/analytics/issues

---

**Brique 69** | Molam Connect Analytics | Version 1.0.0
