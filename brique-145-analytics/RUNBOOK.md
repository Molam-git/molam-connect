# BRIQUE 145 — Analytics Platform Runbook

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Deployment](#deployment)
3. [Monitoring & Alerts](#monitoring--alerts)
4. [Scaling Guidelines](#scaling-guidelines)
5. [Troubleshooting](#troubleshooting)
6. [Backpressure Management](#backpressure-management)
7. [Data Retention](#data-retention)
8. [Disaster Recovery](#disaster-recovery)

---

## Architecture Overview

### Components

1. **ClickHouse** (OLAP Database)
   - Columnar storage for analytics events
   - AggregatingMergeTree for automatic rollups
   - Materialized views: raw → minute → hour → day

2. **Kafka** (Event Streaming)
   - Topics: `wallet_txn_created`, `payout.settled`, `invoice.paid`
   - Consumer group: `analytics-consumer`
   - Retention: 7 days

3. **Analytics Consumer** (Node.js)
   - Batch processing: 100 events / 5 seconds
   - Publishes deltas to Redis for WebSocket

4. **Analytics API** (Node.js + Express)
   - REST API for ClickHouse queries
   - NodeCache with 10s TTL

5. **WebSocket Service** (Socket.IO)
   - Real-time updates via Redis pub/sub
   - Room-based subscriptions (zone, country, city)

6. **React Dashboard**
   - Real-time KPIs and charts
   - WebSocket integration for live updates

---

## Deployment

### Docker Compose (Local/Dev)

```bash
cd brique-145-analytics
docker-compose up -d
```

Services:
- ClickHouse: `localhost:8123` (HTTP), `localhost:9000` (native)
- Kafka: `localhost:9092`
- Redis: `localhost:6379`
- Analytics API: `localhost:3002`
- WebSocket: `localhost:3003`
- Dashboard: `localhost:3004`

### Kubernetes (Production)

```bash
# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/

# Check deployment status
kubectl -n molam-analytics get pods
kubectl -n molam-analytics logs -f deployment/analytics-consumer

# Port forward for local access
kubectl -n molam-analytics port-forward svc/analytics-api 3002:3002
```

### Environment Variables

**Consumer:**
- `KAFKA_BROKERS`: Kafka broker list (comma-separated)
- `CLICKHOUSE_URL`: ClickHouse HTTP endpoint
- `REDIS_URL`: Redis connection string
- `BATCH_SIZE`: Events per batch (default: 100)

**API:**
- `CLICKHOUSE_URL`: ClickHouse HTTP endpoint
- `MOLAM_ID_PUBLIC_KEY`: JWT public key for auth
- `PORT`: API port (default: 3002)
- `CACHE_TTL`: Cache TTL in seconds (default: 10)

**WebSocket:**
- `REDIS_URL`: Redis connection string
- `MOLAM_ID_PUBLIC_KEY`: JWT public key for auth
- `WS_PORT`: WebSocket port (default: 3003)

---

## Monitoring & Alerts

### Prometheus Metrics

**Consumer metrics:**
- `analytics_events_processed_total{zone, country}`: Total events processed
- `analytics_kafka_messages_received_total{topic}`: Kafka messages received
- `analytics_clickhouse_insert_duration_seconds`: Insert latency histogram
- `analytics_errors_total{type}`: Error counter

**API metrics:**
- `http_request_duration_seconds`: API request latency
- `http_requests_total{method, path, status}`: Request counter

**WebSocket metrics:**
- `analytics_ws_connections_total{status}`: Connection counter
- `analytics_ws_messages_total{room}`: Messages sent to clients

### Key Alerts

**Consumer lag:**
```promql
kafka_consumergroup_lag{group="analytics-consumer"} > 10000
```
Action: Scale consumer replicas

**High insert latency:**
```promql
histogram_quantile(0.95, analytics_clickhouse_insert_duration_seconds) > 2
```
Action: Check ClickHouse CPU/disk, verify batch size

**API P95 > 500ms:**
```promql
histogram_quantile(0.95, http_request_duration_seconds{path="/api/analytics/overview"}) > 0.5
```
Action: Increase cache TTL, optimize queries

**WebSocket disconnections:**
```promql
rate(analytics_ws_connections_total{status="rejected"}[5m]) > 10
```
Action: Check JWT token validity, verify MOLAM_ID_PUBLIC_KEY

---

## Scaling Guidelines

### Horizontal Scaling

**Consumer:**
```bash
kubectl -n molam-analytics scale deployment/analytics-consumer --replicas=5
```
- Each replica processes different Kafka partitions
- Recommended: 1 replica per 2 Kafka partitions
- Max throughput: ~10K events/sec per replica

**API:**
```bash
kubectl -n molam-analytics scale deployment/analytics-api --replicas=10
```
- Stateless, can scale freely
- Use HPA with CPU target 60%
- Cache shared via ClickHouse query result cache

**WebSocket:**
```bash
kubectl -n molam-analytics scale deployment/analytics-ws --replicas=5
```
- Use sticky sessions (sessionAffinity) in Service
- Redis pub/sub broadcasts to all replicas

### Vertical Scaling

**ClickHouse:**
- CPU: 8+ cores recommended for production
- Memory: 32GB+ (cache MergeTree parts)
- Disk: NVMe SSD, 500GB+ with RAID 10
- Network: 10Gbps for distributed queries

**Kafka:**
- Increase partitions for `wallet_txn_created` topic:
```bash
kafka-topics --alter --topic wallet_txn_created --partitions 10
```

---

## Troubleshooting

### Consumer not processing events

**Check consumer lag:**
```bash
kafka-consumer-groups --bootstrap-server localhost:9092 --group analytics-consumer --describe
```

**Check consumer logs:**
```bash
kubectl -n molam-analytics logs -f deployment/analytics-consumer
```

**Common issues:**
- Kafka connection refused → Verify `KAFKA_BROKERS` env var
- ClickHouse insert failed → Check disk space, verify table schema
- Buffer not flushing → Check `BATCH_SIZE` and 5s timer

### API queries slow

**Check ClickHouse query log:**
```sql
SELECT
  query,
  query_duration_ms,
  read_rows,
  read_bytes
FROM system.query_log
WHERE type = 'QueryFinish'
ORDER BY query_start_time DESC
LIMIT 10;
```

**Optimize queries:**
- Use appropriate granularity (minute/hour/day tables)
- Add WHERE clauses for date range filtering
- Verify materialized views are populated:
```sql
SELECT table, total_rows FROM system.tables WHERE database = 'default' AND name LIKE 'analytics_agg%';
```

### WebSocket not receiving updates

**Check Redis pub/sub:**
```bash
redis-cli
> SUBSCRIBE analytics.delta
```

**Verify consumer is publishing:**
```bash
kubectl -n molam-analytics logs -f deployment/analytics-consumer | grep "Publishing delta"
```

**Check WebSocket connection:**
- Verify JWT token is valid (check expiration)
- Ensure `MOLAM_ID_PUBLIC_KEY` matches across API and WS services

### High memory usage

**ClickHouse:**
```sql
-- Check memory usage per query
SELECT query, memory_usage FROM system.processes;

-- Check part sizes
SELECT
  table,
  sum(bytes_on_disk) / 1024 / 1024 / 1024 AS size_gb,
  count() AS parts
FROM system.parts
WHERE active
GROUP BY table;
```

**Optimize:**
- Run `OPTIMIZE TABLE analytics_agg_minute FINAL;` to merge parts
- Adjust `max_memory_usage` in ClickHouse config

---

## Backpressure Management

### Detection

**Consumer lag increasing:**
```promql
rate(kafka_consumergroup_lag{group="analytics-consumer"}[5m]) > 0
```

**ClickHouse insert queue building:**
```sql
SELECT count() FROM system.replication_queue WHERE is_currently_executing = 0;
```

### Mitigation

**1. Increase batch size:**
```bash
kubectl -n molam-analytics set env deployment/analytics-consumer BATCH_SIZE=500
```

**2. Scale consumer replicas:**
```bash
kubectl -n molam-analytics scale deployment/analytics-consumer --replicas=10
```

**3. Optimize ClickHouse writes:**
- Enable async inserts: `SET async_insert=1, wait_for_async_insert=0`
- Increase `max_insert_threads` in ClickHouse config

**4. Rate limiting at source:**
- Implement backpressure in upstream services producing to Kafka

---

## Data Retention

### Automatic TTL

Tables are configured with TTL in `001_init.sql`:

- **analytics_events_raw**: 90 days
- **analytics_agg_minute**: 180 days
- **analytics_agg_hour**: 365 days
- **analytics_agg_day**: No TTL (permanent)

### Manual cleanup

**Drop old partitions:**
```sql
-- List partitions
SELECT partition, count() AS parts FROM system.parts WHERE table = 'analytics_events_raw' AND active GROUP BY partition ORDER BY partition DESC;

-- Drop partition (e.g., 202401 = January 2024)
ALTER TABLE analytics_events_raw DROP PARTITION '202401';
```

**Verify disk space:**
```sql
SELECT
  sum(bytes_on_disk) / 1024 / 1024 / 1024 AS total_size_gb
FROM system.parts
WHERE active;
```

---

## Disaster Recovery

### Backup ClickHouse

**Create backup:**
```bash
clickhouse-backup create backup_2025_01_19
clickhouse-backup upload backup_2025_01_19
```

**Restore backup:**
```bash
clickhouse-backup download backup_2025_01_19
clickhouse-backup restore backup_2025_01_19
```

**Schedule daily backups (cron):**
```cron
0 2 * * * clickhouse-backup create && clickhouse-backup upload
```

### Reprocess from Kafka

If data loss occurs and Kafka still has retention:

```bash
# Reset consumer group offset to beginning
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group analytics-consumer \
  --topic wallet_txn_created \
  --reset-offsets --to-earliest --execute

# Restart consumer to reprocess
kubectl -n molam-analytics rollout restart deployment/analytics-consumer
```

### Backfill from PostgreSQL

For historical data beyond Kafka retention:

```bash
cd scripts
ts-node backfill.ts "2024-01-01" "2025-01-01" 1000
```

**Dry run first:**
```bash
ts-node backfill.ts "2024-01-01" "2025-01-01" 1000 --dry-run
```

---

## Performance SLA

Target SLAs per specification:

- **P95 refresh < 5s** for streaming viewport (WebSocket deltas)
- **P95 < 500ms** for aggregated queries (API endpoints)

### Monitoring SLAs

**Streaming latency (WebSocket):**
```promql
# Time from Kafka message to WebSocket emit
histogram_quantile(0.95, rate(analytics_streaming_latency_seconds_bucket[5m]))
```

**API query latency:**
```promql
# P95 for overview endpoint
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{path="/api/analytics/overview"}[5m]))
```

### If SLA breached

1. **Check ClickHouse query performance** (see "API queries slow")
2. **Increase cache TTL** to reduce ClickHouse load
3. **Scale API replicas** for higher throughput
4. **Optimize materialized views** for faster aggregation

---

## Contact & Support

- **Team**: Molam Platform Engineering
- **Slack**: #molam-analytics
- **Runbook**: https://github.com/molam/molam-connect/blob/main/brique-145-analytics/RUNBOOK.md
- **Dashboards**: https://grafana.molam.io/d/analytics-overview
