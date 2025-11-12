# Brique 70octies - Industrial Runbooks

## 📚 Table of Contents

1. [Campaign Launch Checklist](#campaign-launch-checklist)
2. [Emergency Freeze Procedures](#emergency-freeze-procedures)
3. [Dispute Resolution Flow](#dispute-resolution-flow)
4. [Budget Exhaustion Response](#budget-exhaustion-response)
5. [Fraud Investigation Protocol](#fraud-investigation-protocol)
6. [Worker Failure Recovery](#worker-failure-recovery)
7. [Database Migration Procedures](#database-migration-procedures)
8. [Performance Degradation Response](#performance-degradation-response)

---

## 1. Campaign Launch Checklist

### Pre-Launch (T-24h)

**1. Campaign Configuration Review**
```bash
# Verify campaign configuration
psql -d molam_connect -c "
SELECT id, name, campaign_type, target_segment, bonus_points,
       start_date, end_date, status
FROM loyalty_campaigns
WHERE id = '<campaign_id>';
"
```

**Checklist:**
- [ ] Target segment validated (query tested)
- [ ] Bonus points/multiplier within budget
- [ ] Start/end dates correct (timezone verified)
- [ ] Campaign name and description clear
- [ ] Program budget sufficient
- [ ] Approval obtained (if required)

**2. Budget Impact Analysis**
```bash
# Calculate estimated budget impact
psql -d molam_connect -c "
SELECT
  COUNT(*) as target_users,
  <bonus_points> * COUNT(*) as estimated_cost,
  lp.budget_limit - lp.budget_spent as budget_remaining
FROM loyalty_balances lb
JOIN loyalty_programs lp ON lb.program_id = lp.id
WHERE lp.id = '<program_id>'
  AND <segment_conditions>;
"
```

**Checklist:**
- [ ] Estimated cost < budget remaining
- [ ] Target user count reasonable (not too high/low)
- [ ] ROI projection reviewed

**3. Test Campaign (Staging)**
```bash
# Execute campaign on staging with 1-2 test users
curl -X POST http://localhost:3077/api/workers/campaign-execution \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "<staging_campaign_id>"}'
```

**Checklist:**
- [ ] Test execution successful
- [ ] Points awarded correctly
- [ ] Webhooks published
- [ ] Audit logs created
- [ ] Metrics recorded

### Launch (T=0)

**1. Update Campaign Status**
```bash
psql -d molam_connect -c "
UPDATE loyalty_campaigns
SET status = 'scheduled', start_date = NOW()
WHERE id = '<campaign_id>';
"
```

**2. Monitor Execution**
```bash
# Watch Prometheus metrics
curl http://localhost:9090/metrics | grep loyalty_campaign_executions_total

# Check worker logs
tail -f /var/log/loyalty/workers.log | grep CAMPAIGN_EXECUTOR
```

### Post-Launch (T+1h)

**1. Verify Execution**
```bash
psql -d molam_connect -c "
SELECT
  id, name, status, users_awarded, total_points_awarded, executed_at
FROM loyalty_campaigns
WHERE id = '<campaign_id>';
"
```

**Checklist:**
- [ ] Status = 'completed'
- [ ] users_awarded > 0
- [ ] total_points_awarded matches estimate (±10%)
- [ ] executed_at timestamp present

**2. Budget Check**
```bash
psql -d molam_connect -c "
SELECT budget_spent, budget_limit, (budget_spent / budget_limit * 100) as pct_used
FROM loyalty_programs
WHERE id = '<program_id>';
"
```

**3. User Validation (Sample)**
```bash
# Check random user received points
psql -d molam_connect -c "
SELECT user_id, points_balance, updated_at
FROM loyalty_balances
WHERE program_id = '<program_id>'
  AND updated_at >= '<campaign_executed_at>'
LIMIT 5;
"
```

---

## 2. Emergency Freeze Procedures

### Scenario: Fraud Detection Alert

**1. Immediate Response (Within 5 minutes)**

```bash
# Freeze specific user account
psql -d molam_connect -c "
UPDATE loyalty_balances
SET is_frozen = TRUE,
    fraud_flags = fraud_flags || '[\"emergency_freeze_<date>\"]'::jsonb,
    updated_at = NOW()
WHERE user_id = '<suspicious_user_id>' AND program_id = '<program_id>';
"
```

**2. Audit Log Review**
```bash
psql -d molam_connect -c "
SELECT *
FROM loyalty_audit_logs
WHERE entity_type = 'balance'
  AND entity_id IN (
    SELECT id FROM loyalty_balances WHERE user_id = '<user_id>'
  )
ORDER BY created_at DESC
LIMIT 20;
"
```

**3. Transaction Pattern Analysis**
```bash
psql -d molam_connect -c "
SELECT
  DATE(created_at) as date,
  event_type,
  COUNT(*) as txn_count,
  SUM(amount) as total_points
FROM loyalty_transactions
WHERE balance_id IN (
  SELECT id FROM loyalty_balances WHERE user_id = '<user_id>'
)
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), event_type
ORDER BY date DESC;
"
```

**4. Lock Points (Pending Investigation)**
```bash
psql -d molam_connect -c "
UPDATE loyalty_balances
SET locked = points_balance, updated_at = NOW()
WHERE user_id = '<user_id>' AND program_id = '<program_id>';
"
```

### Scenario: Suspend Entire Program

**⚠️ CRITICAL - Requires finance_ops + ops_marketing approval**

```bash
# Suspend program (emergency stop)
curl -X POST http://localhost:3077/api/programs/<program_id>/suspend \
  -H "Authorization: Bearer <finance_ops_token>" \
  -H "X-Approval-Request-Id: <multi_sig_approval_id>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Suspected fraud spike - urgent investigation needed"}'
```

**Verification:**
```bash
psql -d molam_connect -c "
SELECT id, name, status, updated_at
FROM loyalty_programs
WHERE id = '<program_id>';
"
```

**Status should be:** `suspended`

---

## 3. Dispute Resolution Flow

### User Claims: "Points Not Awarded"

**Step 1: Verify Transaction Exists**
```bash
psql -d molam_connect -c "
SELECT *
FROM loyalty_transactions
WHERE origin_txn_id = '<external_transaction_id>'
  AND balance_id IN (
    SELECT id FROM loyalty_balances WHERE user_id = '<user_id>'
  );
"
```

**If NOT FOUND:**
```bash
# Check if idempotency key was used
psql -d molam_connect -c "
SELECT *
FROM loyalty_transactions
WHERE idempotency_key LIKE '%<external_txn_id>%';
"
```

**Step 2: Check Audit Trail**
```bash
psql -d molam_connect -c "
SELECT *
FROM loyalty_audit_logs
WHERE entity_type = 'transaction'
  AND created_at >= '<transaction_date>' - INTERVAL '1 hour'
  AND created_at <= '<transaction_date>' + INTERVAL '1 hour'
ORDER BY created_at DESC;
"
```

**Step 3: Manual Adjustment (If Warranted)**

**⚠️ Requires multi-sig approval for adjustments >10,000 points**

```bash
# Create adjustment request
curl -X POST http://localhost:3077/api/balances/<balance_id>/adjust \
  -H "Authorization: Bearer <ops_marketing_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "reason": "Manual adjustment - Ticket #12345: Points not awarded for purchase",
    "actorId": "<ops_user_id>",
    "actorRole": "ops_marketing"
  }'
```

**Response (if multi-sig required):**
```json
{
  "status": "approval_required",
  "approvalRequestId": "uuid-here",
  "requiredRoles": ["ops_marketing", "finance_ops"]
}
```

**Step 4: Finance Approval**
```bash
curl -X POST http://localhost:3077/api/approvals/<approval_request_id>/approve \
  -H "Authorization: Bearer <finance_ops_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": true,
    "comments": "Verified - legitimate dispute"
  }'
```

**Step 5: Execute Adjustment**
```bash
# Resubmit with approval ID
curl -X POST http://localhost:3077/api/balances/<balance_id>/adjust \
  -H "Authorization: Bearer <ops_marketing_token>" \
  -H "X-Approval-Request-Id: <approval_request_id>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "reason": "Manual adjustment - Ticket #12345",
    "actorId": "<ops_user_id>",
    "actorRole": "ops_marketing"
  }'
```

---

## 4. Budget Exhaustion Response

### Alert: Program Budget at 90%

**1. Check Budget Status**
```bash
psql -d molam_connect -c "
SELECT
  id, name,
  budget_limit,
  budget_spent,
  ROUND((budget_spent / budget_limit * 100)::numeric, 2) as pct_used,
  budget_limit - budget_spent as remaining
FROM loyalty_programs
WHERE budget_spent / budget_limit >= 0.90;
"
```

**2. Analyze Spending Rate**
```bash
psql -d molam_connect -c "
SELECT
  DATE(created_at) as date,
  COUNT(*) as txn_count,
  SUM(amount) as points_awarded
FROM loyalty_transactions lt
JOIN loyalty_balances lb ON lt.balance_id = lb.id
WHERE lb.program_id = '<program_id>'
  AND lt.event_type = 'earn'
  AND lt.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
"
```

**3. Decision Matrix**

| Budget Remaining | Action |
|------------------|--------|
| > 10% | Monitor closely |
| 5-10% | Alert merchant, prepare budget increase |
| < 5% | Immediate action required |

**4. Increase Budget (Multi-Sig Required)**
```bash
curl -X PUT http://localhost:3077/api/programs/<program_id> \
  -H "Authorization: Bearer <ops_marketing_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "budgetLimit": 100000,
    "reason": "Budget exhaustion - merchant approved increase"
  }'
```

**5. Temporary Measures (If Increase Not Possible)**
```bash
# Reduce earn rate temporarily
psql -d molam_connect -c "
UPDATE loyalty_programs
SET earn_rate = earn_rate * 0.5, -- 50% reduction
    updated_at = NOW()
WHERE id = '<program_id>';
"
```

---

## 5. Fraud Investigation Protocol

### Red Flags
- Sudden spike in points earned
- Multiple accounts from same IP
- High-frequency redemptions
- Abnormal transaction patterns

**1. Identify Suspicious Activity**
```bash
# High-frequency earners (last 24h)
psql -d molam_connect -c "
SELECT
  lb.user_id,
  COUNT(*) as txn_count,
  SUM(lt.amount) as total_points,
  ARRAY_AGG(DISTINCT lt.ip_address) as ip_addresses
FROM loyalty_transactions lt
JOIN loyalty_balances lb ON lt.balance_id = lb.id
WHERE lt.created_at >= NOW() - INTERVAL '24 hours'
  AND lt.event_type = 'earn'
GROUP BY lb.user_id
HAVING COUNT(*) > 50 OR SUM(lt.amount) > 10000
ORDER BY total_points DESC;
"
```

**2. IP Address Analysis**
```bash
psql -d molam_connect -c "
SELECT
  ip_address,
  COUNT(DISTINCT user_id) as user_count,
  SUM(amount) as total_points
FROM loyalty_audit_logs lal
JOIN loyalty_transactions lt ON lal.entity_id = lt.id
WHERE lal.entity_type = 'transaction'
  AND lal.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY ip_address
HAVING COUNT(DISTINCT user_id) > 5
ORDER BY user_count DESC;
"
```

**3. Flag for Review**
```bash
psql -d molam_connect -c "
UPDATE loyalty_balances
SET fraud_flags = fraud_flags || '[\"suspicious_pattern_detected\", \"under_investigation\"]'::jsonb,
    updated_at = NOW()
WHERE user_id IN (<suspicious_user_ids>);
"
```

**4. Freeze if Confirmed**
```bash
psql -d molam_connect -c "
UPDATE loyalty_balances
SET is_frozen = TRUE,
    locked = points_balance, -- Lock all points
    fraud_flags = fraud_flags || '[\"confirmed_fraud\"]'::jsonb,
    updated_at = NOW()
WHERE user_id IN (<confirmed_fraud_user_ids>);
"
```

---

## 6. Worker Failure Recovery

### Scenario: Tier Evaluator Failed

**1. Check Worker Status**
```bash
# View Prometheus metrics
curl http://localhost:9090/metrics | grep loyalty_worker_executions_total

# Check logs
tail -100 /var/log/loyalty/workers.log | grep TIER_EVALUATOR
```

**2. Manual Trigger**
```bash
curl -X POST http://localhost:3077/api/workers/tier-evaluation \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"programId": "<program_id_optional>"}'
```

**3. Verify Completion**
```bash
# Check for recent tier upgrades
psql -d molam_connect -c "
SELECT COUNT(*) as upgrades_today
FROM loyalty_tier_snapshots
WHERE created_at >= CURRENT_DATE;
"
```

### Scenario: Campaign Executor Stuck

**1. Find Stuck Campaigns**
```bash
psql -d molam_connect -c "
SELECT id, name, status, start_date, created_at
FROM loyalty_campaigns
WHERE status = 'scheduled'
  AND start_date < NOW() - INTERVAL '2 hours';
"
```

**2. Manual Execution**
```bash
curl -X POST http://localhost:3077/api/workers/campaign-execution \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "<stuck_campaign_id>"}'
```

**3. Mark Failed (If Unfixable)**
```bash
psql -d molam_connect -c "
UPDATE loyalty_campaigns
SET status = 'failed',
    updated_at = NOW()
WHERE id = '<campaign_id>';
"
```

---

## 7. Database Migration Procedures

### Running Industrial Upgrade

**1. Pre-Migration Backup**
```bash
pg_dump -U postgres -d molam_connect -F c -b -v -f "molam_loyalty_backup_$(date +%Y%m%d_%H%M%S).dump"
```

**2. Verify Connection**
```bash
psql -U postgres -d molam_connect -c "SELECT NOW();"
```

**3. Run Migration**
```bash
psql -U postgres -d molam_connect -f migrations/002_upgrade_industrial.sql
```

**4. Verify Tables Created**
```bash
psql -U postgres -d molam_connect -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'loyalty_%'
ORDER BY table_name;
"
```

**Expected tables:**
- loyalty_programs
- loyalty_balances
- loyalty_transactions
- loyalty_tiers
- loyalty_rewards
- loyalty_redemptions
- loyalty_campaigns
- loyalty_rules
- **loyalty_vouchers** (new)
- **loyalty_tier_snapshots** (new)
- **loyalty_audit_logs** (new)
- **loyalty_approval_requests** (new)
- **loyalty_sira_feedback** (new)

**5. Verify Triggers**
```bash
psql -U postgres -d molam_connect -c "
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table LIKE 'loyalty_%';
"
```

**6. Test Budget Trigger**
```bash
psql -U postgres -d molam_connect -c "
-- Set budget limit
UPDATE loyalty_programs SET budget_limit = 1000 WHERE id = '<test_program_id>';

-- Try to exceed budget (should fail)
INSERT INTO loyalty_transactions (balance_id, event_type, amount)
VALUES ('<test_balance_id>', 'earn', 2000);
"
```

**Expected:** Error "Program budget exhausted"

---

## 8. Performance Degradation Response

### Alert: API Latency >500ms (P95)

**1. Check Prometheus Metrics**
```bash
curl http://localhost:9090/metrics | grep loyalty_api_latency_seconds
```

**2. Identify Slow Endpoints**
```bash
# Top 5 slowest endpoints
curl http://localhost:9090/api/v1/query?query=topk(5,loyalty_api_latency_seconds)
```

**3. Check Database Load**
```bash
psql -d molam_connect -c "
SELECT pid, usename, application_name, state, query_start,
       NOW() - query_start as duration, query
FROM pg_stat_activity
WHERE datname = 'molam_connect'
  AND state != 'idle'
  AND NOW() - query_start > INTERVAL '1 second'
ORDER BY duration DESC;
"
```

**4. Check Connection Pool**
```bash
psql -d molam_connect -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE datname = 'molam_connect';
"
```

**5. Mitigation Actions**

**Immediate (< 5 min):**
- Increase connection pool size
- Enable query result caching
- Add read replicas for analytics queries

**Short-term (< 1 hour):**
- Analyze slow queries with EXPLAIN
- Add missing indexes
- Optimize worker batch sizes

**Long-term:**
- Implement Redis caching layer
- Partition large tables (loyalty_transactions)
- Archive old audit logs

---

## 📞 Emergency Contacts

| Role | Contact | Escalation Path |
|------|---------|-----------------|
| On-Call Engineer | +XXX-XXXX | → Tech Lead |
| Tech Lead | +XXX-XXXX | → VP Engineering |
| Finance Ops Manager | +XXX-XXXX | → CFO |
| Security Team | security@molam.com | → CISO |

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-10
**Owner:** MoLam Platform Team
