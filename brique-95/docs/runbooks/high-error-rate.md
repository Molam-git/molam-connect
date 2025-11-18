# Runbook: RoutingHighErrorRate

**Alert:** `RoutingHighErrorRate`
**Severity:** Critical
**Component:** routing-service
**SLO Impact:** High - directly affects availability SLO

---

## Summary

The routing service error rate has exceeded 0.5% for 5 minutes. This indicates a significant number of routing decisions are failing or falling back to secondary routes.

## Impact

- **User Experience:** Users may experience payment failures or delayed transactions
- **Business Impact:** Revenue loss, merchant complaints
- **SLO Status:** Error budget consumption accelerated

## Triage Steps

### 1. Verify the Alert (1 minute)

```bash
# Check current error rate
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total{result=~"fail|fallback"}[5m]))/sum(rate(routing_requests_total[5m]))'

# View Grafana dashboard
# https://grafana.molam.com/d/routing-overview
```

**Decision Point:**
- Error rate < 0.3%: False alarm, monitor
- Error rate 0.3-1%: Proceed to diagnosis
- Error rate > 1%: CRITICAL - escalate immediately

### 2. Identify Error Pattern (3 minutes)

Check error distribution:

```bash
# Errors by route
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total{result="fail"}[5m]))by(route)'

# Errors by country
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total{result="fail"}[5m]))by(country)'

# Check recent failures in logs
kubectl logs -l app=routing-service --tail=100 | grep "ERROR"
```

**Common Patterns:**
- **Specific route failing:** SIRA down, Wallet API issues
- **Specific country/currency:** Regulatory block, partner downtime
- **All routes failing:** Database issue, Redis issue, service bug

### 3. Check Dependencies (2 minutes)

```bash
# Check SIRA health
curl -s http://routing-service:8082/health | jq '.checks.sira'

# Check database connectivity
curl -s http://routing-service:8082/health | jq '.checks.database'

# Check Redis connectivity
curl -s http://routing-service:8082/health | jq '.checks.cache'
```

## Diagnosis

### Scenario A: SIRA Failures (most common)

**Symptoms:**
- SIRA call failures > 5/min
- Fallback route usage elevated
- Error logs show "SIRA timeout" or "SIRA unavailable"

**Root Cause:**
- SIRA service down/overloaded
- Network connectivity issues

**Action:**
1. Verify SIRA is using fallback logic (should auto-fallback)
2. Check SIRA service status: `curl http://sira:8083/health`
3. If SIRA is down, contact ML Platform team (#ml-platform)
4. Monitor fallback route performance

**Expected Resolution Time:** 5-15 minutes (automatic fallback)

---

### Scenario B: Wallet API Failures

**Symptoms:**
- High wallet check failure rate
- Errors show "wallet_check_failed"
- Fallback to Connect route elevated

**Root Cause:**
- Wallet service down/degraded
- Database connectivity issues

**Action:**
1. Check wallet service health
2. Verify wallet database connectivity
3. If wallet is down, routing should auto-fallback to Connect
4. Contact Wallet team (#wallet-team) if issue persists

**Expected Resolution Time:** 2-10 minutes (automatic fallback)

---

### Scenario C: Database Connectivity Issues

**Symptoms:**
- All routes failing
- Error logs show "connection pool exhausted" or "query timeout"
- Database health check fails

**Root Cause:**
- Database overload
- Connection pool exhaustion
- Network issues

**Action:**
1. Check database connection pool:
   ```bash
   curl -s http://prometheus:9090/api/v1/query?query='routing_db_connections_active/routing_db_connections_max'
   ```
2. If pool > 90%, possible connection leak or high load
3. Check slow queries in PostgreSQL
4. Consider restarting routing service pods (will reset connections)
5. Escalate to Database team if DB is unresponsive

**Expected Resolution Time:** 5-20 minutes

---

### Scenario D: Redis Unavailable

**Symptoms:**
- SIRA cache misses at 100%
- Error logs show "Redis connection error"
- Latency increased (no caching)

**Root Cause:**
- Redis instance down
- Network partition

**Action:**
1. Service should continue to function without cache (degraded mode)
2. Verify Redis health: `redis-cli ping`
3. Check Redis logs for errors
4. If Redis is down, contact Infrastructure team (#infrastructure)
5. Monitor latency increase (expect P95 to rise to ~80-100ms)

**Expected Resolution Time:** 10-30 minutes (service degraded but functional)

---

### Scenario E: Code Bug / Regression

**Symptoms:**
- Errors started after recent deployment
- Specific error message in logs (e.g., "TypeError", "undefined")
- No infrastructure issues detected

**Root Cause:**
- Recent code deployment introduced bug
- Bad configuration change

**Action:**
1. Check recent deployments:
   ```bash
   kubectl rollout history deployment/routing-service
   ```
2. Review error logs for stack traces
3. If bug is confirmed, rollback immediately:
   ```bash
   kubectl rollout undo deployment/routing-service
   ```
4. Notify Engineering team to investigate

**Expected Resolution Time:** 5-10 minutes (rollback)

## Mitigation Actions

### Immediate (0-5 minutes)

1. **Acknowledge the alert** in PagerDuty/Slack
2. **Post incident update** in #platform-incidents
3. **Verify automatic fallbacks are working**
   - Check fallback rate metric
   - Confirm Connect route is handling overflow

### Short-term (5-30 minutes)

1. **If SIRA down:** Service continues with fallback logic
2. **If database issue:** Restart service pods to reset connections
3. **If code bug:** Rollback to previous version
4. **If dependency down:** Contact responsible team

### Long-term (30+ minutes)

1. **Root cause analysis:** Identify why dependency failed
2. **Monitor error budget impact**
3. **Update postmortem document**

## Escalation Path

1. **On-call SRE** (you) - 0-15 minutes
2. **Platform Team Lead** - if unresolved after 15 min
3. **VP Engineering** - if SLO violation imminent (>30 min critical outage)

**Contact Info:**
- Platform Team: #platform-team
- ML Platform (SIRA): #ml-platform
- Database Team: #database-team
- Wallet Team: #wallet-team

## Verification

After mitigation, verify:

```bash
# Error rate back to normal (<0.1%)
curl -s http://prometheus:9090/api/v1/query?query='sum(rate(routing_requests_total{result="fail"}[5m]))/sum(rate(routing_requests_total[5m]))'

# Check health endpoint
curl http://routing-service:8082/health

# Monitor for 10 minutes to ensure stability
```

## Postmortem

If outage lasted > 30 minutes or caused SLO violation:
1. Create incident ticket: [Create Incident](https://molam.atlassian.net/incidents/create)
2. Schedule postmortem meeting within 48 hours
3. Document in [Postmortem Template](../postmortems/template.md)

## Related Runbooks

- [RoutingLatencyP95High](./high-latency.md)
- [RoutingServiceDown](./service-down.md)
- [SiraCallFailures](./sira-failures.md)

## Recent Incidents

- **2025-01-10:** SIRA timeout causing 2% error rate - resolved in 12 min
- **2025-01-05:** Database connection pool exhausted - resolved in 18 min

---

**Last Updated:** 2025-01-14
**Owner:** Platform Team
**Reviewers:** SRE Team
