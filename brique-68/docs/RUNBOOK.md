# Operational Runbook — RBAC Service

**Service:** Molam RBAC (Role-Based Access Control)
**Port:** 4068
**SLO:** P50 < 5ms (cache), P95 < 30ms (DB fallback)
**Owner:** Platform Team

---

## Emergency Procedures

### 1. Complete Authorization Failure

**Symptoms:** All requests failing with 403 Forbidden

**Immediate Actions:**
```bash
# Check Redis connectivity
redis-cli -h <REDIS_HOST> ping
# Expected: PONG

# Check DB connectivity
psql -h <DB_HOST> -U <DB_USER> -d molam_rbac -c "SELECT 1;"

# Check service logs
kubectl logs -f deployment/rbac-service --tail=100

# If Redis is down, flush and restart
redis-cli FLUSHDB
kubectl rollout restart deployment/rbac-service
```

**Root Cause Analysis:**
- Check Redis connection errors
- Check PostgreSQL query failures
- Check cache expiration issues

---

### 2. High Latency (P95 > 100ms)

**Symptoms:** Slow permission checks, timeouts

**Immediate Actions:**
```bash
# Check cache hit ratio
redis-cli INFO stats | grep keyspace_hits

# Check active DB connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='molam_rbac';"

# Warm up cache for hot users
curl -X POST http://localhost:4068/api/rbac/cache/warmup \
  -H "Content-Type: application/json" \
  -d '{"user_ids": ["user-1", "user-2", "user-3"]}'
```

**Optimization:**
1. Increase Redis cache TTL (default: 30s)
2. Scale Redis cluster
3. Add DB read replicas
4. Review slow queries in `pg_stat_statements`

---

### 3. Permission Cache Inconsistency

**Symptoms:** Users have permissions they shouldn't have (or vice versa)

**Immediate Actions:**
```bash
# Flush all permission caches (emergency only)
curl -X POST http://localhost:4068/api/rbac/cache/flush \
  -H "X-User-Id: admin-123"

# Or flush specific user
curl -X DELETE http://localhost:4068/api/rbac/cache/user/{userId}
```

**Prevention:**
- Ensure cache invalidation is called after role/grant changes
- Monitor cache invalidation worker health

---

## Common Operations

### 1. Create Organisation

```sql
INSERT INTO organisations (name, legal_entity, country, currency_default, metadata)
VALUES (
  'Acme Corp',
  'Acme Inc.',
  'US',
  'USD',
  '{"rbac_config": {"default_approvals": 2}}'::jsonb
);
```

### 2. Create Permission

```sql
INSERT INTO permissions (code, name, description, resource_kind, actions)
VALUES (
  'connect:payments:export',
  'Export Payments',
  'Export payment data to CSV',
  'payment',
  ARRAY['export']
);
```

### 3. Create Role Template

```bash
curl -X POST http://localhost:4068/api/rbac/templates \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin-123" \
  -d '{
    "name": "Finance Analyst",
    "description": "Read-only access to financial data",
    "permissions": [
      "<perm-id-1>",
      "<perm-id-2>"
    ],
    "sensitive": false
  }'
```

### 4. Create Role for Organisation

```bash
curl -X POST http://localhost:4068/api/rbac/roles \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin-123" \
  -d '{
    "template_id": "<template-uuid>",
    "organisation_id": "<org-uuid>",
    "name": "Finance Analyst - Acme"
  }'
```

### 5. Assign Role to User

```bash
curl -X POST http://localhost:4068/api/rbac/roles/{roleId}/assign \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin-123" \
  -d '{
    "target_user_id": "user-456",
    "reason": "New hire onboarding"
  }'

# Response (non-sensitive):
# {"status": "assigned"}

# Response (sensitive):
# {"status": "approval_required", "request": {...}}
```

### 6. Revoke Role from User

```bash
curl -X DELETE http://localhost:4068/api/rbac/roles/{roleId}/bindings/{userId} \
  -H "X-User-Id: admin-123"
```

### 7. Approve Role Request

```bash
curl -X POST http://localhost:4068/api/rbac/requests/{requestId}/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Id: approver-123" \
  -d '{
    "note": "Approved for Q1 project"
  }'
```

### 8. Create Direct Grant (Temporary Access)

```bash
curl -X POST http://localhost:4068/api/rbac/grants \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin-123" \
  -d '{
    "user_id": "contractor-789",
    "permission_id": "<perm-uuid>",
    "organisation_id": "<org-uuid>",
    "expires_at": "2025-12-31T23:59:59Z",
    "reason": "Emergency access for incident response"
  }'
```

---

## Monitoring

### Key Metrics

```bash
# Cache hit ratio (target: > 95%)
redis-cli INFO stats | grep keyspace_hits

# Permission check latency (target: P50 < 5ms, P95 < 30ms)
curl http://localhost:4068/metrics | grep rbac_authz_duration_ms

# Active role bindings
psql -c "SELECT COUNT(*) FROM role_bindings WHERE expires_at IS NULL OR expires_at > now();"

# Pending approval requests
psql -c "SELECT COUNT(*) FROM role_requests WHERE status = 'pending';"

# Audit log volume (last 24h)
psql -c "SELECT COUNT(*) FROM rbac_audit_logs WHERE created_at > now() - INTERVAL '24 hours';"
```

### Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| Cache hit ratio | < 90% | Investigate cache misses, increase TTL |
| P95 latency | > 50ms | Scale Redis/DB, optimize queries |
| DB connections | > 80% of max | Scale DB pool, check connection leaks |
| Pending approvals | > 100 | Notify approval managers |
| Failed authz attempts | > 100/min | Check for attacks, review logs |

---

## Database Queries

### Find User Permissions

```sql
-- All permissions for a user
SELECT DISTINCT p.code, p.name
FROM permissions p
WHERE p.id IN (
  -- Direct grants
  SELECT permission_id FROM grants
  WHERE user_id = 'user-123'
    AND (expires_at IS NULL OR expires_at > now())

  UNION

  -- Role-based permissions
  SELECT UNNEST(rt.permissions)
  FROM role_bindings rb
  JOIN roles r ON r.id = rb.role_id
  JOIN role_templates rt ON rt.id = r.template_id
  WHERE rb.user_id = 'user-123'
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
)
ORDER BY p.code;
```

### Find All Users with Specific Permission

```sql
SELECT DISTINCT rb.user_id
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
JOIN role_templates rt ON rt.id = r.template_id,
UNNEST(rt.permissions) perm_id
JOIN permissions p ON p.id = perm_id
WHERE p.code = 'connect:payments:refund'
  AND (rb.expires_at IS NULL OR rb.expires_at > now())

UNION

SELECT user_id
FROM grants g
JOIN permissions p ON p.id = g.permission_id
WHERE p.code = 'connect:payments:refund'
  AND (g.expires_at IS NULL OR g.expires_at > now());
```

### Audit: Role Changes in Last 7 Days

```sql
SELECT
  created_at,
  action,
  actor_id,
  target->>'user_id' AS affected_user,
  target->>'role_id' AS role_id
FROM rbac_audit_logs
WHERE action IN ('assign_role', 'revoke_role', 'approve_role_request', 'reject_role_request')
  AND created_at > now() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;
```

### Find Expiring Role Bindings (Next 7 Days)

```sql
SELECT
  rb.user_id,
  r.name AS role_name,
  rb.expires_at,
  rb.expires_at - now() AS time_remaining
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
WHERE rb.expires_at BETWEEN now() AND now() + INTERVAL '7 days'
ORDER BY rb.expires_at ASC;
```

### Sensitive Roles Assigned Without Approval

```sql
-- Should return 0 rows (integrity check)
SELECT
  rb.*,
  r.name AS role_name,
  rt.sensitive
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
JOIN role_templates rt ON rt.id = r.template_id
WHERE rt.sensitive = true
  AND NOT EXISTS (
    SELECT 1 FROM role_requests rr
    WHERE rr.role_id = rb.role_id
      AND rr.target_user_id = rb.user_id
      AND rr.status = 'approved'
  );
```

---

## Cache Management

### Warm Up Cache (On Startup)

```bash
# Get top 1000 active users
psql -t -c "
  SELECT DISTINCT user_id
  FROM role_bindings
  WHERE expires_at IS NULL OR expires_at > now()
  ORDER BY assigned_at DESC
  LIMIT 1000
" | while read user_id; do
  curl -X GET "http://localhost:4068/api/rbac/users/$user_id/permissions" > /dev/null
done
```

### Check Cache Stats

```bash
# Total keys
redis-cli DBSIZE

# Permission cache keys
redis-cli KEYS "rbac:user_perms:*" | wc -l

# Sample cached permissions
redis-cli GET "rbac:user_perms:user-123"

# Memory usage
redis-cli INFO memory | grep used_memory_human
```

### Clear Cache (by Pattern)

```bash
# Clear all user permission caches
redis-cli --scan --pattern "rbac:user_perms:*" | xargs redis-cli DEL

# Clear specific user
redis-cli DEL "rbac:user_perms:user-123"

# Clear organisation's users (requires custom script)
# See src/jobs/cacheInvalidation.ts -> invalidateOrganisation()
```

---

## Security Procedures

### Revoke All Access for User (Offboarding)

```sql
BEGIN;

-- Delete all role bindings
DELETE FROM role_bindings WHERE user_id = 'user-offboard';

-- Delete all direct grants
DELETE FROM grants WHERE user_id = 'user-offboard';

-- Cancel pending role requests
UPDATE role_requests
SET status = 'cancelled'
WHERE target_user_id = 'user-offboard' AND status = 'pending';

-- Audit log
INSERT INTO rbac_audit_logs (actor_id, action, target, details)
VALUES (
  'system',
  'revoke_all_access',
  '{"user_id": "user-offboard"}'::jsonb,
  '{"reason": "User offboarding"}'::jsonb
);

COMMIT;

-- Invalidate cache
curl -X DELETE http://localhost:4068/api/rbac/cache/user/user-offboard
```

### Emergency: Revoke Admin Access

```sql
-- Find all users with admin/owner roles
SELECT rb.user_id, r.name
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
JOIN role_templates rt ON rt.id = r.template_id
WHERE rt.name IN ('connect_owner', 'system_admin');

-- Revoke specific user
DELETE FROM role_bindings
WHERE user_id = 'compromised-admin'
  AND role_id IN (
    SELECT r.id FROM roles r
    JOIN role_templates rt ON rt.id = r.template_id
    WHERE rt.name IN ('connect_owner', 'system_admin')
  );
```

### Audit: Privilege Escalation Detection

```sql
-- Users who assigned themselves roles
SELECT
  actor_id,
  target->>'user_id' AS beneficiary,
  COUNT(*) AS self_assignments
FROM rbac_audit_logs
WHERE action = 'assign_role'
  AND actor_id = target->>'user_id'
  AND created_at > now() - INTERVAL '30 days'
GROUP BY actor_id, target->>'user_id'
HAVING COUNT(*) > 1;
```

---

## Backup & Recovery

### Backup RBAC Data

```bash
# Backup permissions and roles (structure)
pg_dump -h <DB_HOST> -U <DB_USER> -d molam_rbac \
  -t permissions \
  -t role_templates \
  -t organisations \
  --data-only \
  -f rbac_structure_$(date +%Y%m%d).sql

# Backup bindings and grants (assignments)
pg_dump -h <DB_HOST> -U <DB_USER> -d molam_rbac \
  -t role_bindings \
  -t grants \
  -t role_requests \
  --data-only \
  -f rbac_assignments_$(date +%Y%m%d).sql

# Backup audit logs (compliance)
pg_dump -h <DB_HOST> -U <DB_USER> -d molam_rbac \
  -t rbac_audit_logs \
  --data-only \
  -f rbac_audit_$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
psql -h <DB_HOST> -U <DB_USER> -d molam_rbac -f rbac_structure_20250101.sql
psql -h <DB_HOST> -U <DB_USER> -d molam_rbac -f rbac_assignments_20250101.sql
```

---

## Troubleshooting

### Issue: User Can't Access Resource Despite Having Role

**Diagnosis:**
```sql
-- Check if user has role binding
SELECT * FROM role_bindings WHERE user_id = 'user-problem';

-- Check if role has permissions
SELECT rt.permissions
FROM role_bindings rb
JOIN roles r ON r.id = rb.role_id
JOIN role_templates rt ON rt.id = r.template_id
WHERE rb.user_id = 'user-problem';

-- Check if permission exists
SELECT * FROM permissions WHERE code = 'connect:payments:read';

-- Check cache
redis-cli GET "rbac:user_perms:user-problem"
```

**Resolution:**
1. Verify role binding exists and hasn't expired
2. Verify role template has correct permissions
3. Clear cache for user
4. Check ABAC rules (KYC level, SIRA score, country restrictions)

---

### Issue: Approval Workflow Stuck

**Diagnosis:**
```sql
SELECT * FROM role_requests
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '7 days'
ORDER BY created_at ASC;
```

**Resolution:**
```sql
-- Manually approve stalled request
UPDATE role_requests
SET status = 'approved',
    approvals = approvals || '[{"by": "admin-override", "at": "2025-11-08T12:00:00Z", "note": "Manual approval"}]'::jsonb
WHERE id = 'stuck-request-id';

-- Create corresponding role binding
INSERT INTO role_bindings (role_id, user_id, assigned_by)
SELECT role_id, target_user_id, 'admin-override'
FROM role_requests
WHERE id = 'stuck-request-id';
```

---

## Performance Tuning

### Redis Configuration

```bash
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

### PostgreSQL Configuration

```sql
-- Increase connection pool
ALTER SYSTEM SET max_connections = 200;

-- Optimize query planner
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET work_mem = '16MB';

-- Enable query stats
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Index Optimization

```sql
-- Check missing indexes
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND tablename IN ('role_bindings', 'grants', 'role_requests')
ORDER BY correlation DESC;

-- Create composite index for common queries
CREATE INDEX CONCURRENTLY idx_role_bindings_user_expires
  ON role_bindings(user_id, expires_at) WHERE expires_at > now();
```

---

## Compliance & Audit

### Generate Compliance Report

```sql
-- Role assignments in last quarter
COPY (
  SELECT
    DATE_TRUNC('day', created_at) AS date,
    actor_id,
    action,
    target->>'user_id' AS user_id,
    target->>'role_id' AS role_id,
    details
  FROM rbac_audit_logs
  WHERE created_at > now() - INTERVAL '90 days'
    AND action IN ('assign_role', 'revoke_role')
  ORDER BY created_at DESC
) TO '/tmp/rbac_audit_q1_2025.csv' WITH CSV HEADER;
```

### WORM Storage (Write-Once-Read-Many)

Audit logs should be immutable. Configure:

1. **Database Level:**
```sql
-- Revoke DELETE/UPDATE on audit logs
REVOKE DELETE, UPDATE ON rbac_audit_logs FROM PUBLIC;
```

2. **Application Level:**
   - No DELETE/UPDATE routes for audit logs
   - Only INSERT allowed

3. **Backup:**
   - Daily backups to S3 with versioning
   - Glacier for long-term retention (7 years)

---

## Deployment

### Rolling Update

```bash
# Scale up new version
kubectl scale deployment/rbac-service --replicas=6

# Wait for health checks
kubectl rollout status deployment/rbac-service

# Scale down old version
kubectl delete pod -l app=rbac-service,version=old

# Verify
curl http://localhost:4068/health
```

### Rollback

```bash
kubectl rollout undo deployment/rbac-service
kubectl rollout status deployment/rbac-service
```

---

## Contacts

- **On-Call:** PagerDuty - Platform Team
- **Escalation:** CTO
- **Security Incidents:** security@molam.com