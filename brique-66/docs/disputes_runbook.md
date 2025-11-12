# Disputes & Chargebacks Runbook

**Brique 66 — Disputes & Chargebacks Engine**

---

## 🚨 Emergency Procedures

### Emergency: High Volume of Disputes

When a merchant suddenly receives an unusual number of disputes:

1. **Check for Fraud Pattern:**
   ```sql
   SELECT
     reason,
     COUNT(*) as count,
     AVG(amount) as avg_amount
   FROM disputes
   WHERE merchant_id = 'MERCHANT_ID'
     AND created_at >= NOW() - INTERVAL '24 hours'
   GROUP BY reason
   ORDER BY count DESC;
   ```

2. **Identify Affected Transactions:**
   ```sql
   SELECT
     d.connect_tx_id,
     d.amount,
     d.reason,
     d.customer_note,
     d.network_ref
   FROM disputes d
   WHERE d.merchant_id = 'MERCHANT_ID'
     AND d.created_at >= NOW() - INTERVAL '24 hours'
   ORDER BY d.created_at DESC;
   ```

3. **Take Action:**
   - Contact merchant immediately
   - Review transaction patterns
   - Consider temporary account suspension if fraud suspected
   - Notify card networks if systematic fraud detected

---

## 📋 Common Operations

### Create Dispute Manually

```bash
curl -X POST http://localhost:4066/api/disputes \
  -H "Content-Type: application/json" \
  -d '{
    "connectTxId": "tx-123",
    "merchantId": "merchant-456",
    "amount": 10000,
    "currency": "USD",
    "reason": "fraud",
    "disputeType": "chargeback",
    "customerNote": "Did not authorize this transaction",
    "networkRef": "CB-VISA-123456"
  }'
```

### Submit Evidence

```bash
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/evidence \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "merchant-support",
    "evidence": {
      "tracking_number": "TRACK123",
      "delivery_date": "2025-01-05",
      "signature": "Customer signed on delivery",
      "ip_address": "192.168.1.1",
      "customer_email": "customer@example.com"
    }
  }'
```

### Upload Evidence Document

```bash
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/evidence/upload \
  -H "Content-Type: application/json" \
  -d '{
    "evidence_type": "delivery_proof",
    "file_url": "https://s3.amazonaws.com/evidence/proof.pdf",
    "file_name": "delivery_proof.pdf",
    "mime_type": "application/pdf",
    "uploaded_by": "merchant-support",
    "notes": "Signed delivery receipt"
  }'
```

### Resolve Dispute

```bash
# Mark as Won
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "admin",
    "outcome": "won",
    "notes": "Valid tracking and delivery proof provided"
  }'

# Mark as Lost
curl -X POST http://localhost:4066/api/disputes/DISPUTE_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "admin",
    "outcome": "lost",
    "notes": "Insufficient evidence to support merchant claim"
  }'
```

### Check Dispute Status

```bash
curl http://localhost:4066/api/disputes/DISPUTE_ID
```

### List Merchant Disputes

```bash
# All disputes
curl "http://localhost:4066/api/disputes?merchant_id=MERCHANT_ID"

# Filter by status
curl "http://localhost:4066/api/disputes?merchant_id=MERCHANT_ID&status=open"

# With pagination
curl "http://localhost:4066/api/disputes?merchant_id=MERCHANT_ID&limit=20&offset=0"
```

---

## 🔍 Investigating Disputes

### Scenario: Merchant Claims Dispute is Invalid

1. **Get Full Dispute Details:**
   ```sql
   SELECT
     d.*,
     JSONB_PRETTY(d.customer_note::jsonb) as customer_note_formatted
   FROM disputes d
   WHERE d.id = 'DISPUTE_ID';
   ```

2. **Check All Evidence:**
   ```sql
   SELECT * FROM dispute_evidence
   WHERE dispute_id = 'DISPUTE_ID'
   ORDER BY uploaded_at DESC;
   ```

3. **Review Activity Log:**
   ```sql
   SELECT * FROM dispute_logs
   WHERE dispute_id = 'DISPUTE_ID'
   ORDER BY created_at ASC;
   ```

4. **Check Original Transaction:**
   ```sql
   SELECT
     d.connect_tx_id,
     d.amount,
     d.currency,
     d.reason
   FROM disputes d
   WHERE d.id = 'DISPUTE_ID';

   -- Then look up transaction in Connect database
   ```

5. **Review Fees:**
   ```sql
   SELECT
     fee_type,
     amount,
     currency,
     status,
     charged_at
   FROM dispute_fees
   WHERE dispute_id = 'DISPUTE_ID';
   ```

---

## 💰 Fee Management

### Check Fee Status for Dispute

```sql
SELECT
  fee_type,
  amount,
  currency,
  status,
  CASE
    WHEN status = 'pending' THEN 'Not yet charged'
    WHEN status = 'waived' THEN 'Waived (merchant won)'
    WHEN status = 'charged' THEN 'Charged to merchant'
  END as fee_status_description
FROM dispute_fees
WHERE dispute_id = 'DISPUTE_ID';
```

### Manually Waive Bank Fee

```sql
UPDATE dispute_fees
SET status = 'waived',
    waived_at = NOW()
WHERE dispute_id = 'DISPUTE_ID'
  AND fee_type = 'bank_fee';
```

### Calculate Total Fees for Merchant

```sql
SELECT
  merchant_id,
  COUNT(*) as total_disputes,
  SUM(amount) FILTER (WHERE fee_type = 'bank_fee' AND status = 'charged') as bank_fees,
  SUM(amount) FILTER (WHERE fee_type = 'chargeback_loss' AND status = 'charged') as chargeback_losses,
  SUM(amount) FILTER (WHERE status = 'charged') as total_fees_charged
FROM dispute_fees df
JOIN disputes d ON d.id = df.dispute_id
WHERE d.merchant_id = 'MERCHANT_ID'
  AND df.charged_at >= '2025-01-01'
GROUP BY merchant_id;
```

---

## 📊 Monitoring & Metrics

### Dispute Rate by Merchant

```sql
SELECT
  merchant_id,
  COUNT(*) as total_disputes,
  COUNT(*) FILTER (WHERE status = 'open') as open_disputes,
  COUNT(*) FILTER (WHERE status = 'won') as won_disputes,
  COUNT(*) FILTER (WHERE status = 'lost') as lost_disputes,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'won') /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('won', 'lost')), 0),
    2
  ) as win_rate_pct
FROM disputes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY merchant_id
ORDER BY total_disputes DESC
LIMIT 20;
```

### Disputes Approaching Deadline

```sql
SELECT
  d.id,
  d.connect_tx_id,
  d.merchant_id,
  d.amount,
  d.currency,
  d.respond_by,
  DATE_PART('day', d.respond_by - NOW()) as days_remaining,
  d.status
FROM disputes d
WHERE d.status IN ('open', 'evidence_submitted')
  AND d.respond_by <= NOW() + INTERVAL '3 days'
  AND d.respond_by > NOW()
ORDER BY d.respond_by ASC;
```

### Daily Dispute Volume

```sql
SELECT
  DATE(created_at) as dispute_date,
  COUNT(*) as total_disputes,
  COUNT(*) FILTER (WHERE dispute_type = 'chargeback') as chargebacks,
  COUNT(*) FILTER (WHERE dispute_type = 'inquiry') as inquiries,
  COUNT(*) FILTER (WHERE dispute_type = 'fraud_claim') as fraud_claims,
  SUM(amount) as total_disputed_amount
FROM disputes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY dispute_date DESC;
```

### Evidence Submission Rate

```sql
SELECT
  COUNT(*) as total_open_disputes,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM dispute_evidence de WHERE de.dispute_id = d.id
  )) as disputes_with_evidence,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM dispute_evidence de WHERE de.dispute_id = d.id
    )) / COUNT(*),
    2
  ) as evidence_submission_rate_pct
FROM disputes d
WHERE d.status IN ('open', 'evidence_submitted', 'under_review')
  AND d.created_at >= NOW() - INTERVAL '30 days';
```

---

## 🔄 Worker Operations

### Check Worker Status

```bash
# Check if worker is running
ps aux | grep "disputes.*worker"

# Check worker logs
tail -f logs/dispute-worker.log
```

### Manually Run Worker Tasks

```bash
# Trigger network polling
curl -X POST http://localhost:4066/api/admin/worker/poll-networks

# Check deadlines
curl -X POST http://localhost:4066/api/admin/worker/check-deadlines

# Auto-escalate expired disputes
curl -X POST http://localhost:4066/api/admin/worker/auto-escalate

# Generate reports
curl -X POST http://localhost:4066/api/admin/worker/generate-reports
```

### Ingest Network Disputes Manually

```sql
-- Example: Manual insert from network data
INSERT INTO disputes(
  connect_tx_id,
  merchant_id,
  amount,
  currency,
  reason,
  dispute_type,
  network_ref,
  status,
  respond_by
) VALUES (
  'tx-network-123',
  'merchant-456',
  15000,
  'USD',
  'fraud',
  'chargeback',
  'VISA-CB-789456',
  'open',
  NOW() + INTERVAL '7 days'
)
ON CONFLICT (network_ref) DO NOTHING;
```

---

## 🎯 Alert Thresholds

### Critical Alerts

1. **High Dispute Rate (> 1% of transactions)**
   - Check merchant legitimacy
   - Review product/service quality
   - Consider account review

2. **Multiple Fraud Claims (> 5 per day)**
   - Potential fraud ring
   - Immediate investigation required
   - Notify fraud team

3. **Disputes Expiring Without Evidence (> 10 per day)**
   - Merchant support issues
   - Send urgent notifications
   - Consider automatic extension

### Warning Alerts

1. **Win Rate < 30%**
   - Merchant needs training on evidence submission
   - Review dispute handling process

2. **Evidence Submission Rate < 50%**
   - Merchants not responding to disputes
   - Increase notification frequency

---

## 🔧 Maintenance Tasks

### Daily

- Review new disputes
- Check approaching deadlines
- Monitor dispute rate by merchant
- Review auto-escalated disputes

### Weekly

- Generate dispute reports
- Review win rates by merchant
- Analyze common dispute reasons
- Update dispute templates

### Monthly

- Fee reconciliation
- Merchant performance review
- Update card network policies
- Review and update runbook

---

## 📞 Escalation

### L1 Support (Customer Service)
- View dispute details
- Check status
- Basic troubleshooting
- Notify merchants of new disputes

### L2 Support (Dispute Specialists)
- Review evidence
- Submit evidence on behalf of merchants
- Resolve disputes
- Fee adjustments

### L3 Support (Engineering)
- Service down
- Database issues
- Worker failures
- Bug fixes

**Emergency Contact:**
- Slack: `#disputes-alerts`
- PagerDuty: `disputes-engine`
- Email: disputes-team@molam.com

---

## 🧪 Testing in Production

### Test Dispute Creation

```bash
curl -X POST http://localhost:4066/api/disputes \
  -H "Content-Type: application/json" \
  -d '{
    "connectTxId": "TEST-TX-001",
    "merchantId": "TEST-MERCHANT",
    "amount": 100,
    "currency": "USD",
    "reason": "test",
    "disputeType": "inquiry"
  }'
```

### Verify Dispute Workflow

```bash
# 1. Create test dispute
DISPUTE_ID=$(curl -X POST http://localhost:4066/api/disputes \
  -H "Content-Type: application/json" \
  -d '{"connectTxId":"TEST-001","merchantId":"TEST","amount":100,"currency":"USD","reason":"test","disputeType":"inquiry"}' \
  | jq -r '.id')

# 2. Submit evidence
curl -X POST http://localhost:4066/api/disputes/$DISPUTE_ID/evidence \
  -H "Content-Type: application/json" \
  -d '{"actor":"test","evidence":{"test":"data"}}'

# 3. Resolve
curl -X POST http://localhost:4066/api/disputes/$DISPUTE_ID/resolve \
  -H "Content-Type: application/json" \
  -d '{"actor":"test","outcome":"won","notes":"Test resolution"}'

# 4. Verify
curl http://localhost:4066/api/disputes/$DISPUTE_ID
```

### Cleanup Test Data

```sql
DELETE FROM disputes
WHERE connect_tx_id LIKE 'TEST-%'
  OR merchant_id = 'TEST-MERCHANT';
```

---

## 📖 Additional Resources

- **Card Network Rules:**
  - Visa: [Dispute Resolution Guide]
  - Mastercard: [Chargeback Guide]
  - Amex: [Dispute Management]

- **Internal Documentation:**
  - Dispute Templates Wiki
  - Evidence Best Practices
  - Fee Schedule

- **Training Materials:**
  - Merchant Dispute Training
  - Support Team Onboarding

---

**Last Updated:** 2025-01-07
**Owner:** Disputes Operations Team
**On-Call:** See PagerDuty schedule