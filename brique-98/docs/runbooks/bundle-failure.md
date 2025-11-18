# Runbook: Offline Bundle Failure

**Severity**: High
**Owner**: Platform Team
**Last Updated**: 2025-01-15

---

## Overview

This runbook covers troubleshooting and resolution of offline payment bundle failures, including push failures, reconciliation errors, and quarantined bundles.

---

## Symptoms

- High bundle rejection rate alert firing
- Bundles stuck in `pending_review` or `quarantined` status
- Reconciliation worker failures
- Customer reports of offline payments not syncing

---

## Diagnosis

### Step 1: Check Bundle Status

```bash
# Connect to database
psql -U molam -d molam_offline

# Check recent bundle statuses
SELECT
  status,
  COUNT(*) as count,
  AVG(push_attempts) as avg_attempts
FROM offline_tx_bundles
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;

# Expected output:
#    status    | count | avg_attempts
# -------------+-------+--------------
#  accepted    |  150  |     1.0
#  rejected    |    5  |     2.4
#  quarantined |    2  |     1.0
```

### Step 2: Identify Rejected Bundles

```sql
-- Get rejected bundles with reasons
SELECT
  bundle_id,
  device_id,
  rejected_reason,
  push_attempts,
  created_at
FROM offline_tx_bundles
WHERE status = 'rejected'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### Step 3: Check Audit Logs

```sql
-- Get audit trail for failed bundle
SELECT
  action,
  details,
  created_at
FROM offline_audit_logs
WHERE bundle_id = 'bundle_xxx'
ORDER BY created_at DESC;
```

### Step 4: Check Sync Queue

```sql
-- Check if bundles are stuck in queue
SELECT
  COUNT(*) as pending_bundles,
  MIN(created_at) as oldest_bundle
FROM offline_sync_queue
WHERE status = 'pending';

-- If oldest_bundle > 1 hour, reconciliation worker may be stuck
```

---

## Common Issues

### Issue 1: Invalid Device Signature

**Symptom**: Bundle rejected with `invalid_signature` reason

**Diagnosis**:
```sql
-- Check device registration
SELECT
  device_id,
  status,
  created_at,
  last_seen_at
FROM offline_devices
WHERE device_id = 'DEVICE_XXX';
```

**Resolution**:

1. **If device not found**: Device never registered
   ```bash
   # Register device via API (requires pay_admin role)
   curl -X POST https://api.molam.com/offline/devices \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "device_id": "DEVICE_XXX",
       "tenant_type": "merchant",
       "tenant_id": "merchant_123",
       "pubkey_pem": "-----BEGIN PUBLIC KEY-----\n...",
       "country": "SN"
     }'
   ```

2. **If device inactive**: Reactivate device
   ```sql
   UPDATE offline_devices
   SET status = 'active'
   WHERE device_id = 'DEVICE_XXX';
   ```

3. **If signature truly invalid**: Device may have regenerated keys
   - Contact merchant to get new public key
   - Update device registration

---

### Issue 2: Clock Skew Violation

**Symptom**: Bundle rejected with `Clock skew too large` error

**Diagnosis**:
```sql
SELECT
  bundle_id,
  device_id,
  rejected_reason
FROM offline_tx_bundles
WHERE rejected_reason LIKE '%clock skew%';
```

**Resolution**:

1. **Verify device clock settings**:
   - Check if device has automatic time sync enabled
   - Verify correct timezone configuration

2. **Adjust threshold (temporary)**:
   ```sql
   -- If legitimate (e.g., remote area with poor NTP access)
   -- Increase max clock skew in .env or deployment config
   MAX_CLOCK_SKEW_MINUTES=60
   ```

3. **Reject bundle if tampering suspected**:
   ```sql
   -- Mark bundle as fraudulent
   UPDATE offline_tx_bundles
   SET status = 'rejected',
       rejected_reason = 'suspected_clock_tampering'
   WHERE bundle_id = 'bundle_xxx';

   -- Block device (severe cases)
   UPDATE offline_devices
   SET status = 'blocked'
   WHERE device_id = 'DEVICE_XXX';
   ```

---

### Issue 3: Bundle Too Old

**Symptom**: Bundle rejected with `Bundle too old` error

**Diagnosis**:
```sql
SELECT
  bundle_id,
  device_id,
  created_at,
  rejected_reason
FROM offline_tx_bundles
WHERE rejected_reason LIKE '%too old%'
ORDER BY created_at DESC;
```

**Resolution**:

1. **If legitimate delay** (e.g., device was offline for days):
   ```sql
   -- Check if transactions are valid
   SELECT
     local_id,
     amount,
     initiated_at,
     EXTRACT(EPOCH FROM (NOW() - initiated_at::timestamp))/3600 as age_hours
   FROM offline_transactions
   WHERE bundle_id = 'bundle_xxx';

   -- If age reasonable, manually accept bundle
   UPDATE offline_tx_bundles
   SET status = 'accepted',
       rejected_reason = NULL
   WHERE bundle_id = 'bundle_xxx';

   -- Queue for reconciliation
   INSERT INTO offline_sync_queue (bundle_id, priority)
   VALUES ('bundle_xxx', 1);
   ```

2. **If suspicious**: Reject and investigate
   ```sql
   UPDATE offline_tx_bundles
   SET status = 'rejected',
       rejected_reason = 'exceeded_max_age_policy'
   WHERE bundle_id = 'bundle_xxx';
   ```

---

### Issue 4: Daily Limit Exceeded

**Symptom**: Bundle rejected with `daily limit exceeded` error

**Diagnosis**:
```sql
-- Check device activity
SELECT
  device_id,
  activity_date,
  total_amount,
  tx_count
FROM offline_device_activity
WHERE device_id = 'DEVICE_XXX'
  AND activity_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY activity_date DESC;
```

**Resolution**:

1. **If legitimate high volume**:
   ```sql
   -- Check policy limits
   SELECT * FROM offline_policies WHERE country = 'SN';

   -- Increase limit temporarily (requires approval)
   UPDATE offline_policies
   SET max_offline_per_device_per_day = 100
   WHERE country = 'SN';
   ```

2. **If suspicious activity**:
   ```sql
   -- Block device
   UPDATE offline_devices
   SET status = 'blocked'
   WHERE device_id = 'DEVICE_XXX';

   -- Escalate to fraud team
   -- (Create ticket in fraud management system)
   ```

---

### Issue 5: SIRA Quarantine

**Symptom**: Bundle quarantined due to high fraud score

**Diagnosis**:
```sql
SELECT
  b.bundle_id,
  b.device_id,
  COUNT(t.id) as tx_count,
  SUM(t.amount) as total_amount,
  AVG(t.sira_score) as avg_sira_score
FROM offline_tx_bundles b
JOIN offline_transactions t ON t.bundle_id = b.bundle_id
WHERE b.status = 'quarantined'
GROUP BY b.bundle_id, b.device_id;
```

**Resolution**:

1. **Manual review required**:
   ```sql
   -- Get transaction details
   SELECT
     local_id,
     type,
     amount,
     sender,
     receiver,
     sira_score,
     initiated_at
   FROM offline_transactions
   WHERE bundle_id = 'bundle_xxx'
   ORDER BY sira_score DESC;
   ```

2. **If legitimate**:
   ```sql
   -- Approve bundle
   UPDATE offline_tx_bundles
   SET status = 'accepted'
   WHERE bundle_id = 'bundle_xxx';

   -- Queue for reconciliation
   INSERT INTO offline_sync_queue (bundle_id, priority)
   VALUES ('bundle_xxx', 1);

   -- Audit log
   INSERT INTO offline_audit_logs (bundle_id, actor, action, details)
   VALUES (
     'bundle_xxx',
     'ops_user_email@molam.co',
     'manual_approval',
     '{"reason": "False positive - verified with merchant"}'
   );
   ```

3. **If fraudulent**:
   ```sql
   -- Reject bundle
   UPDATE offline_tx_bundles
   SET status = 'rejected',
       rejected_reason = 'confirmed_fraud'
   WHERE bundle_id = 'bundle_xxx';

   -- Block device
   UPDATE offline_devices
   SET status = 'blocked'
   WHERE device_id = 'DEVICE_XXX';
   ```

---

### Issue 6: Reconciliation Worker Stuck

**Symptom**: Large sync queue backlog, worker not processing bundles

**Diagnosis**:
```bash
# Check worker logs
kubectl logs -n molam -l app=molam-offline-worker --tail=100

# Check if worker pod is running
kubectl get pods -n molam -l app=molam-offline-worker

# Check database locks
psql -U molam -d molam_offline -c "
  SELECT
    pid,
    usename,
    application_name,
    state,
    query_start,
    state_change
  FROM pg_stat_activity
  WHERE datname = 'molam_offline'
    AND state = 'active'
  ORDER BY query_start;
"
```

**Resolution**:

1. **Restart worker pod**:
   ```bash
   kubectl rollout restart deployment/molam-offline-worker -n molam

   # Or delete pod to force restart
   kubectl delete pod -n molam -l app=molam-offline-worker
   ```

2. **Kill stuck database queries**:
   ```sql
   -- Find long-running queries
   SELECT pid, query_start, query
   FROM pg_stat_activity
   WHERE state = 'active'
     AND query_start < NOW() - INTERVAL '5 minutes';

   -- Kill stuck query
   SELECT pg_terminate_backend(PID);
   ```

3. **Manual reconciliation** (if worker remains stuck):
   ```bash
   # Run worker manually
   kubectl run manual-worker \
     --image=molam/offline:1.0.0 \
     --restart=Never \
     --env="WORKER_MODE=once" \
     --env="BATCH_SIZE=5" \
     -- npm run worker:reconciliation
   ```

---

## Escalation

### When to Escalate

- Bundles rejected at rate > 10% for 1 hour
- Worker stuck for > 30 minutes
- Confirmed fraud detected
- Unknown rejection reason

### Escalation Path

1. **Level 1**: Platform Engineer on-call (PagerDuty)
2. **Level 2**: Platform Team Lead
3. **Level 3**: Security Team (for fraud cases)

### Contact Information

- **Slack**: `#platform-offline`, `#platform-oncall`
- **PagerDuty**: Platform - Offline Payments
- **Email**: platform@molam.co

---

## Prevention

### Monitoring

- Set up alerts for bundle rejection rate > 5%
- Monitor sync queue size (alert if > 500)
- Track reconciliation worker success rate

### Regular Maintenance

- Weekly review of rejected bundles
- Monthly review of device activity patterns
- Quarterly review of offline policies

### Device Onboarding

- Ensure proper device registration process
- Verify clock sync enabled on devices
- Test offline flow before production use

---

## Post-Incident

### Follow-up Actions

1. Update runbook with new learnings
2. Add monitoring for failure pattern
3. Review and adjust policies if needed
4. Communicate with affected merchants

### Incident Report Template

```
## Incident Summary
- Date/Time:
- Duration:
- Impact:

## Root Cause
[Description]

## Resolution
[Steps taken]

## Prevention
[Changes to prevent recurrence]
```

---

## Related Documentation

- [Deployment Guide](../DEPLOYMENT_GUIDE.md)
- [API Documentation](../API.md)
- [Security Architecture](../SECURITY.md)
