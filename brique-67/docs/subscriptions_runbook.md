# Subscriptions & Recurring Billing Runbook

**Brique 67 — Subscriptions & Recurring Billing Engine**

---

## 🚨 Emergency Procedures

### High Volume of Failed Payments

When multiple subscriptions fail payment collection:

1. **Check Payment Gateway Status:**
   ```bash
   # Check if payment provider is operational
   curl https://status.stripe.com/api/v2/status.json
   ```

2. **Identify Affected Subscriptions:**
   ```sql
   SELECT
     s.id,
     s.merchant_id,
     d.attempts,
     d.last_error,
     d.next_retry_at
   FROM subscriptions s
   JOIN subscription_dunning d ON d.subscription_id = s.id
   WHERE d.dunning_state = 'retrying'
     AND d.last_attempt_at >= NOW() - INTERVAL '1 hour'
   ORDER BY d.attempts DESC
   LIMIT 50;
   ```

3. **Manual Retry for Critical Subscriptions:**
   ```bash
   curl -X POST http://localhost:4067/api/admin/subscriptions/SUBSCRIPTION_ID/retry
   ```

---

## 📋 Common Operations

### Create Plan

```bash
curl -X POST http://localhost:4067/api/admin/plans \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "enterprise-monthly",
    "name": "Enterprise Monthly",
    "description": "Full suite for large organizations",
    "billing_interval": "monthly",
    "interval_count": 1,
    "currency": "USD",
    "unit_amount": 499.00,
    "trial_period_days": 30
  }'
```

### Create Subscription

```bash
curl -X POST http://localhost:4067/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: sub_$(date +%s)_$(openssl rand -hex 4)" \
  -d '{
    "merchant_id": "merchant-123",
    "plan_id": "plan-456",
    "customer_id": "customer-789",
    "billing_currency": "USD",
    "payment_method": {
      "type": "card",
      "token": "tok_visa_4242"
    }
  }'
```

### Change Plan (Immediate with Proration)

```bash
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/change-plan \
  -H "Content-Type: application/json" \
  -d '{
    "new_plan_id": "plan-pro",
    "effective_immediately": true,
    "actor": "admin"
  }'
```

### Cancel Subscription

```bash
# Cancel at period end
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": true,
    "reason": "User requested",
    "actor": "merchant-user"
  }'

# Cancel immediately
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "cancel_at_period_end": false,
    "reason": "Fraud detected",
    "actor": "admin"
  }'
```

### Record Usage (Metered Billing)

```bash
curl -X POST http://localhost:4067/api/subscriptions/SUB_ID/usage \
  -H "Content-Type: application/json" \
  -d '{
    "period_start": "2025-01-01",
    "period_end": "2025-01-31",
    "unit_count": 15000,
    "unit_price": 0.01,
    "description": "API calls for January 2025"
  }'
```

---

## 🔍 Monitoring & Diagnostics

### Check Worker Status

```bash
# Check if billing worker is running
ps aux | grep "subscriptions.*cron"

# Check worker logs
tail -f logs/subscription-worker.log
```

### Subscription Health Metrics

```sql
-- Overall subscription health
SELECT
  status,
  COUNT(*) as count,
  SUM((plan_snapshot->>'unit_amount')::numeric) as revenue
FROM subscriptions
GROUP BY status
ORDER BY count DESC;
```

### Dunning Status

```sql
-- Subscriptions in dunning
SELECT
  d.dunning_state,
  COUNT(*) as count,
  AVG(d.attempts) as avg_attempts
FROM subscription_dunning d
GROUP BY d.dunning_state;
```

### Failed Renewals (Last 24h)

```sql
SELECT
  s.id,
  s.merchant_id,
  s.status,
  d.attempts,
  d.last_error,
  d.next_retry_at
FROM subscriptions s
JOIN subscription_dunning d ON d.subscription_id = s.id
WHERE d.last_attempt_at >= NOW() - INTERVAL '24 hours'
  AND d.dunning_state IN ('retrying', 'suspended')
ORDER BY d.attempts DESC;
```

### MRR (Monthly Recurring Revenue)

```sql
SELECT
  SUM(
    CASE
      WHEN plan_snapshot->>'billing_interval' = 'monthly'
      THEN (plan_snapshot->>'unit_amount')::numeric
      WHEN plan_snapshot->>'billing_interval' = 'annual'
      THEN (plan_snapshot->>'unit_amount')::numeric / 12
      WHEN plan_snapshot->>'billing_interval' = 'weekly'
      THEN (plan_snapshot->>'unit_amount')::numeric * 4.33
      ELSE 0
    END
  ) as mrr_total
FROM subscriptions
WHERE status IN ('active', 'trialing');
```

### Churn Rate (Last 30 Days)

```sql
WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE canceled_at >= NOW() - INTERVAL '30 days') as canceled,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_subs,
    COUNT(*) FILTER (WHERE status = 'active') as active
  FROM subscriptions
)
SELECT
  canceled,
  new_subs,
  active,
  ROUND(100.0 * canceled / NULLIF(active + canceled, 0), 2) as churn_rate_pct
FROM stats;
```

---

## 🔧 Troubleshooting

### Issue: Subscription Not Renewing

**Diagnostic:**
```sql
SELECT
  s.*,
  d.dunning_state,
  d.attempts,
  d.last_error
FROM subscriptions s
LEFT JOIN subscription_dunning d ON d.subscription_id = s.id
WHERE s.id = 'SUBSCRIPTION_ID';
```

**Common Causes:**
- Payment method expired
- Insufficient funds
- Payment gateway downtime
- Worker not running

**Resolution:**
1. Check dunning state and error message
2. Verify payment method is valid
3. Manually retry collection
4. Update payment method if needed

### Issue: Incorrect Proration

**Diagnostic:**
```sql
SELECT
  sl.*
FROM subscription_logs sl
WHERE sl.subscription_id = 'SUBSCRIPTION_ID'
  AND sl.action = 'plan_changed_immediate'
ORDER BY sl.created_at DESC
LIMIT 1;
```

**Check Calculation:**
- Verify period dates (current_period_start, current_period_end)
- Check credit ratio calculation
- Verify old and new plan prices

### Issue: Metered Usage Not Billed

**Diagnostic:**
```sql
SELECT * FROM usage_records
WHERE subscription_id = 'SUBSCRIPTION_ID'
  AND posted = false
ORDER BY created_at DESC;
```

**Resolution:**
1. Check if subscription plan is marked as `is_metered`
2. Verify usage records exist for billing period
3. Manually trigger billing worker for subscription
4. Check if worker processed the period

---

## 🎯 Alert Thresholds

### Critical Alerts

1. **Payment Failure Rate > 5%**
   - Check payment gateway status
   - Review dunning configuration
   - Alert finance team

2. **Worker Not Running > 10 minutes**
   - Restart worker service
   - Check database connectivity
   - Review system resources

3. **Churn Rate > 10%**
   - Analyze cancellation reasons
   - Review pricing strategy
   - Alert customer success team

### Warning Alerts

1. **Dunning Retries > 100/hour**
   - Investigate payment method issues
   - Check for batch payment failures
   - Review retry schedule

2. **Subscriptions Past Due > 50**
   - Send batch payment reminders
   - Review automatic suspension threshold
   - Alert merchant success team

---

## 📊 Reporting

### Monthly Subscription Report

```sql
SELECT
  DATE_TRUNC('month', s.created_at) as month,
  COUNT(*) as new_subscriptions,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'canceled') as canceled,
  SUM((plan_snapshot->>'unit_amount')::numeric) as revenue
FROM subscriptions s
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month DESC;
```

### Top Plans by Revenue

```sql
SELECT
  plan_snapshot->>'slug' as plan,
  plan_snapshot->>'name' as plan_name,
  COUNT(*) as subscription_count,
  SUM((plan_snapshot->>'unit_amount')::numeric) as total_revenue
FROM subscriptions
WHERE status IN ('active', 'trialing')
GROUP BY plan, plan_name
ORDER BY total_revenue DESC
LIMIT 10;
```

### Merchant Subscription Summary

```sql
SELECT
  merchant_id,
  COUNT(*) as total_subscriptions,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  SUM((plan_snapshot->>'unit_amount')::numeric) as total_spend
FROM subscriptions
GROUP BY merchant_id
ORDER BY total_spend DESC
LIMIT 20;
```

---

## 🔄 Dunning Management

### Dunning Configuration

Default retry schedule (in seconds):
- 1st retry: 3600s (1 hour)
- 2nd retry: 21600s (6 hours)
- 3rd retry: 86400s (24 hours)
- 4th retry: 259200s (72 hours)

After max attempts: subscription status → `past_due`

### Update Dunning Schedule for Merchant

```sql
UPDATE subscription_dunning
SET retry_schedule = '[7200, 43200, 172800, 432000]'::jsonb,
    max_attempts = 5
WHERE subscription_id IN (
  SELECT id FROM subscriptions WHERE merchant_id = 'MERCHANT_ID'
);
```

### Manually Clear Dunning

```sql
-- After resolving payment issues
UPDATE subscription_dunning
SET dunning_state = 'ok',
    attempts = 0,
    next_retry_at = NULL,
    last_error = NULL
WHERE subscription_id = 'SUBSCRIPTION_ID';

UPDATE subscriptions
SET status = 'active'
WHERE id = 'SUBSCRIPTION_ID';
```

---

## 🔐 Security

### PCI Compliance

- **Never store raw card numbers** - Use tokenized payment methods only
- Payment tokens stored in `payment_method` JSONB field
- All card processing via PCI-compliant vault
- Audit all payment method changes

### Access Control (RBAC)

- `merchant_admin`: Create/manage own subscriptions
- `billing_ops`: Manage all subscriptions, update plans
- `finance_ops`: View reports, manage dunning
- `admin`: Full access including plan creation

### Audit Trail

All subscription changes logged in `subscription_logs`:
```sql
SELECT
  sl.created_at,
  sl.action,
  sl.actor,
  sl.details
FROM subscription_logs sl
WHERE sl.subscription_id = 'SUBSCRIPTION_ID'
ORDER BY sl.created_at DESC;
```

---

## 🚀 Operational Tasks

### Daily

- Monitor dunning retry success rate
- Check for subscriptions past due > 7 days
- Review failed payments
- Verify worker is running

### Weekly

- Generate MRR report
- Analyze churn rate
- Review top cancellation reasons
- Check usage posting for metered plans

### Monthly

- Generate revenue reports by plan
- Analyze subscription growth
- Review dunning configuration effectiveness
- Update plan pricing if needed

---

## 📞 Escalation

### L1 Support (Customer Service)
- View subscription details
- Check billing history
- Update payment methods
- Basic troubleshooting

### L2 Support (Billing Operations)
- Manage subscriptions
- Process refunds and credits
- Adjust dunning settings
- Generate custom reports

### L3 Support (Engineering)
- Worker failures
- Database issues
- Integration problems
- Bug fixes

**Emergency Contact:**
- Slack: `#subscriptions-alerts`
- PagerDuty: `subscriptions-engine`
- Email: billing-ops@molam.com

---

## 🧪 Testing

### Test Subscription Creation

```bash
# Create test subscription
curl -X POST http://localhost:4067/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test_$(date +%s)" \
  -d '{
    "merchant_id": "TEST_MERCHANT",
    "plan_id": "plan-starter-monthly"
  }'
```

### Cleanup Test Data

```sql
DELETE FROM subscriptions
WHERE merchant_id LIKE 'TEST_%'
  OR metadata->>'test' = 'true';
```

---

**Last Updated:** 2025-01-07
**Owner:** Billing Operations Team
**On-Call:** See PagerDuty schedule