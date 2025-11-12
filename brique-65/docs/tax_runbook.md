# Tax Engine Runbook

**Brique 65 — Tax & Compliance Engine**

---

## 🚨 Emergency Procedures

### Emergency Rate Change

When a tax authority announces an immediate rate change:

1. **Access the Ops UI:**
   - Navigate to TaxRulesManager UI
   - Or use direct API

2. **Add New Rule:**
   ```bash
   curl -X POST http://localhost:4065/api/tax/rules \
     -H "Content-Type: application/json" \
     -d '{
       "jurisdiction_id": "JURISDICTION_ID",
       "code": "VAT_STD",
       "rate": 20.0,
       "effective_from": "2025-01-07",
       "applies_to": ["payment", "charge"]
     }'
   ```

3. **Update Old Rule:**
   ```sql
   UPDATE tax_rules
   SET effective_to = '2025-01-06'
   WHERE code = 'VAT_STD'
     AND jurisdiction_id = 'JURISDICTION_ID'
     AND effective_to IS NULL;
   ```

4. **Verify:**
   - Check `tax_rule_snapshots` for audit trail
   - Test with sample transaction
   - Monitor `molam_audit_logs`

---

## 📊 Generate Tax Filing Report

### Monthly Report Generation

**Via Worker:**
```bash
cd brique-65
npm run worker:reports
```

**Manual Generation:**
```bash
curl -X POST http://localhost:4065/api/tax/reports \
  -H "Content-Type: application/json" \
  -d '{
    "jurisdiction_id": "JURISDICTION_ID",
    "period_start": "2025-01-01",
    "period_end": "2025-01-31",
    "format": "csv"
  }'
```

**Output:**
- CSV file with all transactions
- Summary totals by tax code
- Ready for submission to tax authority

### Validate Report Before Filing

```sql
-- Check totals match
SELECT
  jurisdiction_id,
  COUNT(*) as tx_count,
  SUM(total_tax) as total_collected
FROM tax_decisions
WHERE computed_at::date BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY jurisdiction_id;
```

---

## 🔍 Debug Unexpected Tax Delta

### Scenario: Merchant reports wrong tax amount

1. **Find the Tax Decision:**
   ```bash
   curl http://localhost:4065/api/tax/decisions/TX_ID
   ```

2. **Check Rules Applied:**
   ```sql
   SELECT
     td.connect_tx_id,
     td.total_tax,
     td.tax_lines,
     td.rules_applied,
     tj.name as jurisdiction
   FROM tax_decisions td
   JOIN tax_jurisdictions tj ON tj.id = td.jurisdiction_id
   WHERE td.connect_tx_id = 'TX_ID';
   ```

3. **Verify Rule Versions:**
   ```sql
   SELECT * FROM tax_rule_snapshots
   WHERE tax_rule_id IN (
     SELECT id FROM tax_rules WHERE code = 'VAT_STD'
   )
   ORDER BY taken_at DESC
   LIMIT 10;
   ```

4. **Check Audit Logs:**
   ```sql
   SELECT * FROM molam_audit_logs
   WHERE entity_type = 'tax_decision'
     AND entity_id = (
       SELECT id FROM tax_decisions WHERE connect_tx_id = 'TX_ID'
     )
   ORDER BY created_at DESC;
   ```

---

## 🔧 Common Operations

### Add New Jurisdiction

```sql
INSERT INTO tax_jurisdictions(code, name, country_codes, currency)
VALUES ('US_CA', 'California', ARRAY['US'], 'USD');
```

### Add Tax Rule

```sql
INSERT INTO tax_rules(
  jurisdiction_id,
  code,
  description,
  applies_to,
  is_percentage,
  rate,
  effective_from
) VALUES (
  (SELECT id FROM tax_jurisdictions WHERE code = 'US_CA'),
  'SALES_TAX',
  'California Sales Tax',
  ARRAY['payment', 'charge'],
  true,
  7.25,
  '2025-01-01'
);
```

### Mark Rule as Expired

```sql
UPDATE tax_rules
SET effective_to = CURRENT_DATE
WHERE code = 'OLD_RULE'
  AND effective_to IS NULL;
```

### Create Tax Exemption

```sql
UPDATE tax_rules
SET exempt_conditions = jsonb_build_object(
  'merchant_exempt_if', 'has_tax_id',
  'product_codes', jsonb_build_array('FOOD', 'MEDICINE')
)
WHERE code = 'VAT_STD';
```

---

## 🎯 Monitoring & Alerts

### Key Metrics to Monitor

1. **Tax Computation Latency:**
   ```sql
   SELECT
     AVG(EXTRACT(EPOCH FROM (computed_at - created_at))) as avg_latency_seconds
   FROM tax_decisions
   WHERE computed_at >= NOW() - INTERVAL '1 hour';
   ```

2. **Failed Computations:**
   ```sql
   SELECT COUNT(*) as error_count
   FROM molam_audit_logs
   WHERE brique_id = 'brique-65'
     AND action = 'tax_compute_failed'
     AND created_at >= NOW() - INTERVAL '1 hour';
   ```

3. **Revenue by Jurisdiction:**
   ```sql
   SELECT
     tj.code,
     tj.name,
     SUM(td.total_tax) as total_tax_collected,
     td.currency
   FROM tax_decisions td
   JOIN tax_jurisdictions tj ON tj.id = td.jurisdiction_id
   WHERE td.computed_at::date = CURRENT_DATE
   GROUP BY tj.code, tj.name, td.currency;
   ```

### Alert Thresholds

- **Latency > 500ms:** Investigate database performance
- **Error rate > 1%:** Check rule configurations
- **Missing FX rates:** Update `fx_rates` table
- **Zero tax decisions for 1+ hours:** Service down?

---

## 🔄 Tax Refund/Reversal Process

### When to Reverse Tax

- Customer refund processed
- Dispute resolved in customer favor
- Transaction cancelled

### How to Reverse

```bash
curl -X POST http://localhost:4065/api/tax/reverse \
  -H "Content-Type: application/json" \
  -d '{
    "original_tx_id": "ORIGINAL_TX_ID",
    "reversal_tx_id": "REVERSAL_TX_ID"
  }'
```

**Result:**
- Creates negative tax decision
- Total tax becomes `-X`
- Linked to original for audit

---

## 🏦 Withholding Tax Management

### Check Withholdings for Payout

```sql
SELECT * FROM withholding_reservations
WHERE payout_id = 'PAYOUT_ID'
  AND status = 'reserved';
```

### Release Withholding

```sql
UPDATE withholding_reservations
SET status = 'released',
    released_at = NOW()
WHERE id = 'WITHHOLDING_ID';
```

### Mark as Paid to Authority

```sql
UPDATE withholding_reservations
SET status = 'paid_to_authority',
    paid_at = NOW()
WHERE id = 'WITHHOLDING_ID';
```

---

## 📞 Escalation

### L1 Support (Ops Team)
- View tax decisions
- Generate reports
- Basic troubleshooting

### L2 Support (Finance/Tax Team)
- Rate changes
- Exemption rules
- Report validation

### L3 Support (Engineering)
- Service down
- Database issues
- Bug fixes

**Emergency Contact:**
- Slack: `#tax-engine-alerts`
- PagerDuty: `tax-engine`

---

## 🧪 Testing in Production

### Dry Run Test

```bash
curl -X POST http://localhost:4065/api/tax/compute \
  -H "Content-Type: application/json" \
  -d '{
    "connectTxId": "TEST_TX_DRYRUN",
    "amount": 10000,
    "currency": "USD",
    "eventType": "payment",
    "buyerCountry": "US"
  }'
```

### Verify Against Expected

```sql
-- Should match expected calculation
SELECT total_tax
FROM tax_decisions
WHERE connect_tx_id = 'TEST_TX_DRYRUN';
```

### Cleanup Test Data

```sql
DELETE FROM tax_decisions
WHERE connect_tx_id LIKE 'TEST_%';
```

---

## 📖 Additional Resources

- **Tax Rate Changes:** [Internal Wiki]
- **Jurisdiction Codes:** ISO 3166-1 alpha-2
- **FX Rate Source:** [Provider API Docs]
- **Compliance Calendar:** [Tax Filing Deadlines]

---

**Last Updated:** 2025-01-06
**Owner:** Finance Operations Team
**On-Call:** See PagerDuty schedule