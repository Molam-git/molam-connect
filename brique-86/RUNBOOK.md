# Brique 86 — Reconciliation Runbook

**Operational playbook for common incidents and maintenance tasks**

## Table of Contents

- [System Health Checks](#system-health-checks)
- [Common Incidents](#common-incidents)
- [Maintenance Tasks](#maintenance-tasks)
- [Escalation Procedures](#escalation-procedures)

---

## System Health Checks

### Daily Health Check (5 min)

```bash
# 1. Check worker status
ps aux | grep statement-consumer
# Should see running process

# 2. Check API health
curl http://localhost:3086/health
# Should return: {"status":"ok"}

# 3. Check queue size
curl http://localhost:3086/api/reco/stats | jq '.lines.manual_review_count'
# Should be < 100

# 4. Check match rate
curl http://localhost:3086/api/reco/stats | jq '.lines.match_rate_pct'
# Should be > 90
```

### Database Health

```sql
-- Check for stuck parsing jobs
SELECT id, file_type, imported_at, status
FROM bank_statements_raw
WHERE status = 'parsing'
AND imported_at < NOW() - INTERVAL '1 hour';

-- Check queue growth
SELECT severity, COUNT(*) as count
FROM reconciliation_queue
WHERE status IN ('open', 'in_review')
GROUP BY severity;

-- Check match rate (last 24h)
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE reconciliation_status = 'matched') as matched,
  ROUND(100.0 * COUNT(*) FILTER (WHERE reconciliation_status = 'matched') / COUNT(*), 2) as match_rate_pct
FROM bank_statement_lines
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

---

## Common Incidents

### 🔥 INCIDENT: Worker Crashed

**Symptoms:**
- No new lines being processed
- `ps aux | grep statement-consumer` returns nothing
- Queue growing

**Resolution:**

```bash
# 1. Check logs for crash reason
tail -n 100 /var/log/brique-86/worker.log

# 2. Check for common causes
# - Database connection lost
# - S3 access denied
# - OOM (out of memory)

# 3. Restart worker
npm run worker:ingest

# 4. Monitor startup
tail -f /var/log/brique-86/worker.log

# 5. Verify processing resumed
curl http://localhost:3086/api/reco/stats
```

**Post-Incident:**
- Update on-call log
- Create Jira ticket if root cause needs investigation

---

### 🔥 INCIDENT: Match Rate Drop (<90%)

**Symptoms:**
- Match rate metric drops below 90%
- Queue size increasing rapidly
- Alert: "Reconciliation match rate < 95% for 1h"

**Investigation:**

```sql
-- 1. Check which banks are affected
SELECT
  bank_profile_id,
  COUNT(*) as unmatched_count,
  ROUND(AVG(amount), 2) as avg_amount
FROM bank_statement_lines
WHERE reconciliation_status = 'unmatched'
AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY bank_profile_id
ORDER BY unmatched_count DESC;

-- 2. Check common unmatched reasons
SELECT
  reason,
  COUNT(*) as count
FROM reconciliation_queue
WHERE status = 'open'
AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY reason
ORDER BY count DESC;

-- 3. Sample unmatched lines
SELECT
  id, value_date, amount, currency, description, reference, provider_ref
FROM bank_statement_lines
WHERE reconciliation_status = 'unmatched'
AND created_at >= NOW() - INTERVAL '24 hours'
LIMIT 20;
```

**Common Causes & Fixes:**

#### Cause 1: Missing Provider References

**Symptom**: `provider_ref` is NULL for many lines

**Fix**: Check if provider (e.g., Stripe) is sending references in payouts

```sql
-- Check payouts without provider_ref
SELECT COUNT(*)
FROM payouts
WHERE provider_ref IS NULL
AND created_at >= NOW() - INTERVAL '24 hours';
```

**Action**: Contact provider integration team to fix

#### Cause 2: Bank Changed Statement Format

**Symptom**: Parser errors increasing

**Fix**: Add bank-specific adapter

```typescript
// src/parsers/adapters/bank-xyz.ts
export function adaptBankXYZ(content: string): string {
  // Transform new format to standard
  return content
    .replace(/NEW_PATTERN/, 'STANDARD_PATTERN')
    .replace(/DATE:(\d{8})/, ':61:$1');
}
```

#### Cause 3: Tolerance Too Strict

**Symptom**: Fuzzy matches failing on amount differences

**Fix**: Adjust tolerance config

```sql
-- Increase tolerance for affected bank
UPDATE reconciliation_config
SET tolerance_pct = 0.02,  -- 2% tolerance
    tolerance_cents = 200   -- $2 tolerance
WHERE bank_profile_id = 'affected_bank_id';
```

---

### 🔥 INCIDENT: Queue Overload (>500 items)

**Symptoms:**
- Manual review queue > 500 items
- Ops team overwhelmed
- Alert: "Reconciliation queue size critical"

**Triage:**

```sql
-- 1. Assess severity distribution
SELECT severity, COUNT(*) as count
FROM reconciliation_queue
WHERE status = 'open'
GROUP BY severity;

-- 2. Identify bulk patterns
SELECT
  LEFT(description, 30) as desc_prefix,
  COUNT(*) as count
FROM reconciliation_queue q
JOIN bank_statement_lines l ON l.id = q.bank_statement_line_id
WHERE q.status = 'open'
GROUP BY LEFT(description, 30)
HAVING COUNT(*) > 10
ORDER BY count DESC;
```

**Resolution Strategies:**

#### Strategy 1: Bulk Match by Pattern

If many lines share a common pattern (e.g., same description prefix):

```sql
-- Example: Bulk match lines with known pattern
BEGIN;

-- Find candidate payouts
WITH candidates AS (
  SELECT
    l.id as line_id,
    p.id as payout_id,
    l.amount,
    p.amount as payout_amount
  FROM bank_statement_lines l
  JOIN payouts p ON
    p.currency = l.currency
    AND ABS(p.amount - ABS(l.amount)) < 5
    AND l.description LIKE 'KNOWN_PATTERN%'
  WHERE l.reconciliation_status = 'unmatched'
)
-- Insert matches (review first!)
INSERT INTO reconciliation_matches (
  bank_statement_line_id, matched_type, matched_entity_id,
  match_score, match_rule, matched_by
)
SELECT
  line_id, 'payout', payout_id,
  0.95, 'bulk_ops', 'system'
FROM candidates;

-- Update lines
UPDATE bank_statement_lines
SET reconciliation_status = 'matched', matched_at = now()
WHERE id IN (SELECT line_id FROM candidates);

-- Update payouts
UPDATE payouts
SET status = 'settled', settled_at = now()
WHERE id IN (SELECT payout_id FROM candidates);

COMMIT;
```

**⚠️ WARNING**: Always review candidates manually before committing!

#### Strategy 2: Bulk Ignore Low-Value Test Transactions

```sql
-- Ignore test/demo transactions
UPDATE reconciliation_queue
SET status = 'ignored',
    resolution = 'test_transaction',
    resolved_by = 'ops_bulk',
    notes = 'Bulk ignored: test transaction pattern'
WHERE bank_statement_line_id IN (
  SELECT id FROM bank_statement_lines
  WHERE description LIKE '%TEST%'
  OR description LIKE '%DEMO%'
  OR amount < 0.01
);
```

---

### 🔥 INCIDENT: Parsing Failures

**Symptoms:**
- Many files stuck in `parse_failed` status
- `reco_parse_errors_total` metric increasing

**Investigation:**

```sql
-- Check recent failures
SELECT
  id, file_type, imported_at, parsed_error
FROM bank_statements_raw
WHERE status = 'parse_failed'
AND imported_at >= NOW() - INTERVAL '24 hours'
ORDER BY imported_at DESC;
```

**Resolution:**

```bash
# 1. Download failed file for manual inspection
aws s3 cp s3://molam-bank-statements/{file_s3_key} /tmp/failed_statement.txt

# 2. Inspect file format
cat /tmp/failed_statement.txt | head -n 50

# 3. Test parser locally
npm run parse:test /tmp/failed_statement.txt

# 4. Fix parser or add adapter

# 5. Retry failed files
UPDATE bank_statements_raw
SET status = 'uploaded', parsed_error = NULL
WHERE id = 'failed_file_id';
```

---

### 🔥 INCIDENT: SIRA Integration Down

**Symptoms:**
- SIRA API returning 500/503
- Suspicious lines not being flagged

**Resolution:**

```bash
# 1. Check SIRA health
curl http://localhost:3059/health

# 2. Check SIRA logs
kubectl logs -n molam-prod sira-api-xxx

# 3. Temporary mitigation: Queue suspicious patterns
# (System will retry when SIRA recovers)

# 4. Manual review high-severity patterns
SELECT
  l.id, l.amount, l.currency, l.description,
  q.severity, q.reason
FROM bank_statement_lines l
JOIN reconciliation_queue q ON q.bank_statement_line_id = l.id
WHERE q.severity IN ('high', 'critical')
AND q.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY q.severity DESC, l.amount DESC;
```

---

## Maintenance Tasks

### Weekly: Refresh Metrics Materialized View

```sql
-- Refresh reconciliation metrics view
REFRESH MATERIALIZED VIEW CONCURRENTLY reconciliation_metrics;

-- Verify refresh
SELECT metric_date, bank_profile_id, match_rate_pct
FROM reconciliation_metrics
ORDER BY metric_date DESC
LIMIT 10;
```

### Monthly: Archive Old Reconciliations

```sql
-- Archive reconciliations older than 6 months
BEGIN;

-- Move to archive table
INSERT INTO reconciliation_matches_archive
SELECT * FROM reconciliation_matches
WHERE reconciled_at < NOW() - INTERVAL '6 months';

-- Verify count
SELECT COUNT(*) FROM reconciliation_matches_archive
WHERE reconciled_at >= NOW() - INTERVAL '7 months'
AND reconciled_at < NOW() - INTERVAL '6 months';

-- Delete from main table
DELETE FROM reconciliation_matches
WHERE reconciled_at < NOW() - INTERVAL '6 months';

COMMIT;
```

### Quarterly: Audit Bank Configurations

```sql
-- Review all bank reconciliation configs
SELECT
  bank_profile_id,
  tolerance_pct,
  tolerance_cents,
  date_window_days,
  auto_match_threshold,
  enabled
FROM reconciliation_config
ORDER BY bank_profile_id;

-- Check for banks without config (using defaults)
SELECT DISTINCT bank_profile_id
FROM bank_statement_lines
WHERE bank_profile_id NOT IN (
  SELECT bank_profile_id FROM reconciliation_config
);
```

### On-Demand: Backfill Reconciliation

If matching logic improved, re-run matching on old unmatched lines:

```sql
-- Get IDs of old unmatched lines
SELECT id, bank_profile_id
FROM bank_statement_lines
WHERE reconciliation_status = 'unmatched'
AND created_at >= NOW() - INTERVAL '30 days'
AND created_at < NOW() - INTERVAL '7 days';
```

Then run via script:

```typescript
// scripts/backfill-reconciliation.ts
import { matchLine } from '../src/services/matcher';
import { pool } from '../src/utils/db';

async function backfill() {
  const { rows } = await pool.query(`
    SELECT id, bank_profile_id
    FROM bank_statement_lines
    WHERE reconciliation_status = 'unmatched'
    AND created_at >= NOW() - INTERVAL '30 days'
  `);

  console.log(`Backfilling ${rows.length} lines...`);

  for (const row of rows) {
    try {
      await matchLine(row.id, row.bank_profile_id);
    } catch (error) {
      console.error(`Failed to backfill ${row.id}:`, error);
    }
  }

  console.log('Backfill complete!');
}

backfill();
```

---

## Escalation Procedures

### Level 1: Ops Team (Response Time: 15 min)

**Handles:**
- Manual queue review
- Bulk matching
- Config adjustments

**Escalate if:**
- Worker repeatedly crashing
- Database performance issues
- Match rate < 80% with no clear pattern

### Level 2: Engineering On-Call (Response Time: 30 min)

**Handles:**
- Worker/API debugging
- Parser fixes
- Database query optimization
- Metric alerting issues

**Escalate if:**
- Data corruption suspected
- Security incident (fraud pattern)
- Integration failures (SIRA, S3)

### Level 3: Senior Engineering + Product (Response Time: 2 hrs)

**Handles:**
- Major algorithm changes
- Bank integration changes
- Architecture decisions

---

## Emergency Contacts

- **Ops On-Call**: ops-oncall@molam.com / Slack #ops-oncall
- **Eng On-Call**: eng-oncall@molam.com / PagerDuty
- **Security**: security@molam.com (for fraud/suspicious activity)
- **Compliance**: compliance@molam.com (for regulatory issues)

---

## Useful Queries

### Find Duplicate Matches

```sql
-- Lines matched to multiple payouts (should not happen!)
SELECT bank_statement_line_id, COUNT(*) as match_count
FROM reconciliation_matches
GROUP BY bank_statement_line_id
HAVING COUNT(*) > 1;
```

### Find Payouts Settled Without Match

```sql
-- Payouts marked settled but no reconciliation match
SELECT p.id, p.reference_code, p.amount, p.settled_at
FROM payouts p
WHERE p.status = 'settled'
AND NOT EXISTS (
  SELECT 1 FROM reconciliation_matches m
  WHERE m.matched_entity_id = p.id
  AND m.matched_type = 'payout'
);
```

### Reconciliation Performance

```sql
-- Average time from line creation to match
SELECT
  AVG(EXTRACT(EPOCH FROM (matched_at - created_at))) / 60 as avg_minutes_to_match
FROM bank_statement_lines
WHERE reconciliation_status = 'matched'
AND created_at >= NOW() - INTERVAL '7 days';
```

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2023-11-15 | Initial runbook | ops-team |
| 2023-12-01 | Added bulk match procedures | eng-team |

