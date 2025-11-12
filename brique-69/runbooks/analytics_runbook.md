# Analytics Dashboard Runbook (Brique 69)

## Overview
This runbook provides operational procedures for managing and troubleshooting the Molam Analytics Dashboard system.

## Architecture

### Components
1. **Analytics API** - Express REST API with RBAC
2. **Kafka Consumer** - Real-time transaction ingestion
3. **Alerts Evaluator** - Periodic alert rule checking
4. **PostgreSQL** - OLAP storage with materialized views
5. **Redis** - Cache and live counters
6. **Kafka** - Event streaming

### Data Flow
```
Transaction Event → Kafka → Consumer → PostgreSQL (hourly_agg)
                                    ↓
                                  Redis (live counters)
                                    ↓
                                  SIRA (anomalies)

API ← PostgreSQL ← User Queries
    ↓
  Cache (Redis)
```

---

## Common Operations

### 1. Check System Health

```bash
# Check API health
curl http://localhost:8082/health

# Check metrics
curl http://localhost:8082/metrics

# Check database connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM txn_hourly_agg;"

# Check Redis
redis-cli ping

# Check Kafka consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group analytics-consumer-g
```

### 2. Refresh Materialized Views

The daily aggregate view should be refreshed periodically:

```bash
# Manual refresh
psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_txn_daily_agg;"

# Check last refresh time
psql $DATABASE_URL -c "SELECT last_refresh FROM pg_stat_user_tables WHERE relname = 'mv_txn_daily_agg';"
```

**Recommended Schedule**: Every 5-15 minutes via cron or K8s CronJob

### 3. Backfill Historical Data

If you need to backfill analytics from existing wallet transactions:

```bash
# Run backfill script
npm run backfill -- --from 2025-01-01 --to 2025-06-30
```

Backfill script (create as `scripts/backfill.ts`):
```typescript
// Batch process wallet_transactions and populate txn_hourly_agg
```

### 4. Clear Cache

```bash
# Clear all analytics cache
redis-cli --scan --pattern 'analytics:*' | xargs redis-cli DEL

# Clear specific merchant cache
redis-cli --scan --pattern 'live:merchant:MERCHANT_ID:*' | xargs redis-cli DEL
```

### 5. Monitor Kafka Consumer Lag

```bash
# Check consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group analytics-consumer-g

# If lag > 10000, consider scaling consumers
kubectl scale deployment analytics-consumer --replicas=4 -n molam
```

---

## Troubleshooting

### Problem: High API Latency

**Symptoms**: P95 latency > 500ms

**Diagnosis**:
```bash
# Check slow queries
psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check cache hit rate
redis-cli INFO stats | grep keyspace_hits
```

**Solutions**:
1. Increase cache TTL for summary queries
2. Add missing indices:
   ```sql
   CREATE INDEX CONCURRENTLY idx_custom ON txn_hourly_agg (merchant_id, hour) WHERE merchant_id IS NOT NULL;
   ```
3. Scale API pods: `kubectl scale deployment analytics-api --replicas=4`

---

### Problem: Consumer Lag Increasing

**Symptoms**: Consumer lag > 5000 messages

**Diagnosis**:
```bash
# Check consumer logs
kubectl logs -f deployment/analytics-consumer -n molam

# Check database insert rate
psql $DATABASE_URL -c "SELECT COUNT(*) FROM txn_hourly_agg WHERE created_at > NOW() - INTERVAL '1 minute';"
```

**Solutions**:
1. Scale consumer pods:
   ```bash
   kubectl scale deployment analytics-consumer --replicas=4 -n molam
   ```
2. Check database connection pool settings (increase `DB_POOL_MAX`)
3. Optimize upsert function if needed

---

### Problem: Incorrect Aggregate Values

**Symptoms**: KPIs don't match raw transaction data

**Diagnosis**:
```sql
-- Compare aggregates to raw transactions
SELECT DATE(occurred_at) as day, COUNT(*), SUM(amount)
FROM wallet_transactions
WHERE occurred_at >= '2025-07-01'
GROUP BY day
ORDER BY day;

SELECT day, SUM(tx_count), SUM(gross_volume_local)
FROM mv_txn_daily_agg
WHERE day >= '2025-07-01'
GROUP BY day
ORDER BY day;
```

**Solutions**:
1. Force refresh materialized view:
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_txn_daily_agg;
   ```
2. Re-run backfill for affected period
3. Check for duplicate event processing (idempotency issues)

---

### Problem: Alerts Not Firing

**Symptoms**: Expected alerts not created

**Diagnosis**:
```bash
# Check alerts evaluator logs
kubectl logs -f deployment/analytics-alerts -n molam

# Verify alert rules are active
psql $DATABASE_URL -c "SELECT * FROM analytics_alert_rules WHERE is_active = true;"

# Manually test alert rule
psql $DATABASE_URL -c "SELECT * FROM txn_hourly_agg WHERE hour >= NOW() - INTERVAL '1 hour';"
```

**Solutions**:
1. Verify alert rule configuration is correct
2. Check alert evaluator is running
3. Reduce `window_minutes` if data is sparse
4. Check notification webhooks are reachable

---

### Problem: SIRA Anomalies Not Detected

**Symptoms**: No anomaly events in Kafka

**Diagnosis**:
```bash
# Check SIRA is enabled
echo $SIRA_ENABLED

# Check Kafka topic
kafka-console-consumer --bootstrap-server localhost:9092 --topic analytics.anomaly --from-beginning

# Check consumer logs for anomaly detection
kubectl logs -f deployment/analytics-consumer -n molam | grep "Anomaly detected"
```

**Solutions**:
1. Enable SIRA: `export SIRA_ENABLED=true`
2. Check moving average calculation in Redis
3. Adjust z-score threshold (currently 3 standard deviations)

---

## Emergency Procedures

### Emergency: Database Overload

**Immediate Actions**:
1. Pause consumer: `kubectl scale deployment analytics-consumer --replicas=0`
2. Clear cache to reduce query load
3. Increase database resources
4. Scale down API if needed

**Recovery**:
1. Optimize slow queries
2. Add missing indices
3. Scale up database (more CPU/memory)
4. Resume consumer: `kubectl scale deployment analytics-consumer --replicas=2`

---

### Emergency: Incorrect Data Displayed

**Immediate Actions**:
1. Clear all cache: `redis-cli FLUSHDB`
2. Investigate root cause in logs
3. Notify users via status page

**Recovery**:
1. Identify source of incorrect data
2. Correct data in database
3. Refresh materialized views
4. Validate KPIs manually
5. Resume normal operations

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| API P95 latency | > 500ms | Scale API or optimize queries |
| Consumer lag | > 5000 | Scale consumers |
| Cache hit rate | < 70% | Increase cache TTL or size |
| Database connections | > 80% of max | Increase pool size |
| Aggregation lag | > 5 minutes | Check consumer health |
| Alert rule failures | > 10/hour | Check alert evaluator |

### Prometheus Queries

```promql
# API request rate
rate(analytics_api_requests_total[5m])

# Consumer ingestion rate
rate(analytics_ingest_events_total[5m])

# Error rate
rate(analytics_ingest_errors_total[5m])

# Cache hit ratio
analytics_cache_hits_total / (analytics_cache_hits_total + analytics_cache_misses_total)
```

---

## Maintenance Windows

### Weekly Tasks
- Review slow query log
- Check materialized view refresh schedule
- Review alert rule effectiveness
- Clean up old resolved alerts (> 30 days)

### Monthly Tasks
- Analyze partition performance
- Review and optimize indices
- Update FX rates data source
- Review SIRA anomaly detection accuracy

---

## Contacts

- **Ops Team**: ops@molam.io
- **On-Call**: +XXX-XXX-XXXX
- **Slack**: #molam-analytics-alerts
- **Runbook Source**: github.com/molam/analytics/runbook

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-07-15 | Analytics Team | Initial version |
