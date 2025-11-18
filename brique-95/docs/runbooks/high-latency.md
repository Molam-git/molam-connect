# Runbook: RoutingLatencyP95High

**Alert:** `RoutingLatencyP95High`
**Severity:** Critical
**Component:** routing-service
**SLO Impact:** High - violates latency SLO (P95 < 120ms)

---

## Summary

The routing service P95 latency has exceeded 120ms for 10 minutes, violating the performance SLO. This means 5% of users are experiencing slow routing decisions.

## Impact

- **User Experience:** Slow payment processing, checkout delays
- **Business Impact:** Reduced conversion rates, user frustration
- **SLO Status:** Latency SLO violated

## Quick Reference

| Latency Range | Severity | Action |
|---------------|----------|--------|
| 100-120ms | Warning | Monitor, investigate |
| 120-200ms | Critical | Immediate action required |
| >200ms | Severe | Page leadership, incident response |

## Triage Steps

### 1. Verify Current Latency (1 minute)

```bash
# Check P50, P95, P99
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.50,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000'
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000'
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.99,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000'

# View dashboard
# https://grafana.molam.com/d/routing-overview
```

**Decision Tree:**
- P95 < 130ms: Monitor only
- P95 130-200ms: Active investigation
- P95 > 200ms: CRITICAL - escalate

### 2. Identify Bottleneck (3 minutes)

Check latency breakdown by component:

```bash
# SIRA latency
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_sira_latency_seconds_bucket[5m]))by(le))*1000'

# Redis latency
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_redis_latency_seconds_bucket[5m]))by(le))*1000'

# Database query latency
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_db_query_duration_seconds_bucket[5m]))by(le))*1000'

# Latency by route
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le,route))*1000'
```

## Diagnosis

### Scenario A: SIRA Latency High (>50ms)

**Symptoms:**
- SIRA P95 latency > 50ms
- SIRA cache hit rate low
- Overall latency correlates with SIRA latency

**Root Causes:**
1. SIRA service overloaded
2. SIRA cache not working (Redis issue)
3. Network latency to SIRA

**Actions:**

```bash
# Check SIRA cache hit rate
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_cache_hit_total{type="sira_cache"}[5m]))/(sum(rate(routing_cache_hit_total{type="sira_cache"}[5m]))+sum(rate(routing_cache_miss_total{type="sira_cache"}[5m])))'

# If cache hit rate < 50%:
# 1. Check Redis connectivity
redis-cli -h routing-redis ping

# 2. Check cache TTL configuration
kubectl get configmap routing-config -o yaml | grep SIRA_CACHE_TTL

# 3. Verify SIRA response times directly
curl -w "@curl-format.txt" -s http://sira:8083/v1/score -d '{"merchant_id":"test",...}'
```

**Mitigation:**
1. If SIRA is slow but cache is working:
   - Service will naturally recover as cache fills
   - Contact ML Platform team to investigate SIRA performance
2. If cache is broken:
   - Fix Redis connectivity (see Redis runbook)
   - Consider increasing cache TTL temporarily
3. If SIRA is critically slow (>500ms):
   - Consider temporarily increasing timeout to allow fallback

**Expected Resolution:** 10-20 minutes

---

### Scenario B: Database Slow Queries

**Symptoms:**
- Database query latency > 20ms
- Connection pool usage high
- Specific queries timing out in logs

**Root Causes:**
1. Missing indexes
2. Table locks
3. High concurrent load
4. Unoptimized queries

**Actions:**

```bash
# Check slow queries in PostgreSQL
kubectl exec -it postgres-0 -- psql -U postgres -d molam_routing -c "
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 20
ORDER BY mean_exec_time DESC
LIMIT 10;"

# Check active queries
kubectl exec -it postgres-0 -- psql -U postgres -d molam_routing -c "
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;"

# Check for locks
kubectl exec -it postgres-0 -- psql -U postgres -d molam_routing -c "
SELECT * FROM pg_locks WHERE NOT granted;"
```

**Mitigation:**
1. If specific query is slow:
   - Add index if missing (requires deployment)
   - Kill long-running query if blocking: `SELECT pg_terminate_backend(pid);`
2. If connection pool exhausted:
   - Increase pool size in config (requires restart)
   - Check for connection leaks in application
3. If table locked:
   - Identify locking transaction and kill if necessary

**Expected Resolution:** 15-30 minutes

---

### Scenario C: Redis Latency High

**Symptoms:**
- Redis P95 latency > 5ms
- Redis operations timing out
- Overall latency increased

**Root Causes:**
1. Redis overloaded (too many keys, high memory)
2. Redis slow commands (KEYS *, large SETs)
3. Network issues

**Actions:**

```bash
# Check Redis stats
redis-cli -h routing-redis INFO stats | grep instantaneous_ops_per_sec
redis-cli -h routing-redis INFO memory | grep used_memory_human
redis-cli -h routing-redis SLOWLOG GET 10

# Check for expensive commands
redis-cli -h routing-redis --latency
redis-cli -h routing-redis --latency-history

# Check keyspace
redis-cli -h routing-redis INFO keyspace
```

**Mitigation:**
1. If Redis is overloaded:
   - Identify and remove unnecessary keys
   - Consider increasing Redis memory
   - Implement key expiration if missing
2. If slow commands detected:
   - Review application code for inefficient Redis usage
   - Avoid KEYS * in production
3. If memory exhausted:
   - Clear old cache: `redis-cli FLUSHDB` (use with caution!)
   - Increase Redis memory allocation

**Expected Resolution:** 5-15 minutes

---

### Scenario D: High Request Volume

**Symptoms:**
- Request rate significantly elevated (>500 RPS)
- All components slightly slower
- No specific bottleneck

**Root Causes:**
1. Traffic spike (legitimate or attack)
2. Retry storm from upstream
3. Marketing campaign

**Actions:**

```bash
# Check request rate
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total[5m]))'

# Check by merchant (identify if specific merchant)
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total[5m]))by(merchant_id)'

# Check for idempotency conflicts (retry storm indicator)
curl -s http://prometheus:9090/api/v1/query?query='rate(routing_idempotency_conflicts_total[5m])'
```

**Mitigation:**
1. If legitimate traffic spike:
   - Scale up routing service replicas:
     ```bash
     kubectl scale deployment routing-service --replicas=10
     ```
   - Verify autoscaling is working
2. If retry storm:
   - Investigate upstream service (why retrying?)
   - Consider rate limiting if malicious
3. If specific merchant:
   - Contact merchant to understand load
   - Consider merchant-specific rate limits

**Expected Resolution:** 5-10 minutes (auto-scaling)

---

### Scenario E: Application Performance Regression

**Symptoms:**
- Latency increased after recent deployment
- No infrastructure issues
- Memory/CPU usage elevated

**Root Causes:**
1. Inefficient code introduced
2. Memory leak
3. Blocking I/O introduced

**Actions:**

```bash
# Check deployment history
kubectl rollout history deployment/routing-service

# Check memory usage
kubectl top pods -l app=routing-service

# Check for memory leaks (RSS increasing over time)
kubectl exec -it routing-service-xxx -- node -e "console.log(process.memoryUsage())"

# Profile application (if profiling enabled)
curl http://routing-service:8082/debug/pprof/profile?seconds=10
```

**Mitigation:**
1. If regression confirmed, rollback:
   ```bash
   kubectl rollout undo deployment/routing-service
   ```
2. File bug with engineering team
3. Review code changes for performance issues

**Expected Resolution:** 5 minutes (rollback)

## Immediate Actions

1. **Identify primary bottleneck** (SIRA/DB/Redis/Volume)
2. **Post status update** in #platform-incidents
3. **Apply quick fix** based on scenario above
4. **Monitor latency trend** - should decrease within 5-10 min

## Escalation

- **0-10 min:** On-call SRE investigates
- **10-20 min:** Platform Team Lead engaged
- **20-30 min:** Engineering team engaged for code issues
- **>30 min:** VP Engineering notified (SLO violation)

## Verification

```bash
# Latency back to normal
curl -s http://prometheus:9090/api/v1/query?query='histogram_quantile(0.95,sum(rate(routing_request_duration_seconds_bucket[5m]))by(le))*1000'

# Should be < 120ms consistently for 10 minutes
```

## Prevention

- **SIRA:** Ensure cache TTL is optimal (15s default)
- **Database:** Monitor slow queries, add indexes proactively
- **Redis:** Set key expiration, monitor memory usage
- **Scaling:** Ensure HPA is configured correctly
- **Load Testing:** Regular load tests to identify bottlenecks

## Related Runbooks

- [RoutingHighErrorRate](./high-error-rate.md)
- [SiraLatencyHigh](./sira-latency.md)
- [RedisLatencyHigh](./redis-latency.md)

---

**Last Updated:** 2025-01-14
**Owner:** Platform Team
