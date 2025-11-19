**# Brique 122 — Statement Ingestion & Reconciliation Worker

## 🎯 Objectif

Système industriel d'**ingestion automatique** et de **réconciliation intelligente** des extraits bancaires avec :

- ✅ **Ingestion multi-source** : MT940, CSV, ISO20022, REST APIs
- ✅ **Matching intelligent** : Exact, fuzzy, probabiliste
- ✅ **Détection d'anomalies** : SIRA integration
- ✅ **Gestion des doublons** : Detection automatique
- ✅ **Webhooks temps réel** : Notifications automatiques
- ✅ **Dashboard Ops** : Queue de révision manuelle
- ✅ **Audit trail complet** : Conformité réglementaire

---

## 📊 Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Statement Ingestion Flow                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Bank → MT940/CSV/API → B121 Connector → Parse          │
│                                ↓                          │
│                    bank_statements_raw                    │
│                                ↓                          │
│                    bank_statement_lines                   │
│                                ↓                          │
│                   Reconciliation Worker                   │
│              ┌──────────────────────────────┐            │
│              │  1. Duplicate Detection      │            │
│              │  2. Find Candidates          │            │
│              │  3. Exact Matching           │            │
│              │  4. Fuzzy Matching           │            │
│              │  5. Anomaly Detection        │            │
│              │  6. SIRA Scoring             │            │
│              │  7. Auto-Match or Review     │            │
│              └──────────────────────────────┘            │
│                                ↓                          │
│         ┌────────────┬──────────────┬───────────┐        │
│         ↓            ↓              ↓           ↓        │
│     Matched    Manual Review    Duplicate   Anomaly      │
│         ↓            ↓              ↓           ↓        │
│   Update Payout  Exception Queue   Ignore    Alert Ops   │
│         ↓                                                 │
│   Webhook Event                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🗄️ Schema Database

### Tables principales

#### **bank_statement_lines** (Enhanced from B121)
```sql
- id, bank_profile_id
- statement_date, value_date, amount, currency
- description, reference, bank_reference
- counterparty_name, counterparty_account
- reconciliation_status (unmatched|matched|duplicate|anomaly|manual_review)
- matched_payout_slice_id, match_confidence, match_method
- anomaly_score, anomaly_type, anomaly_details
- duplicate_of, is_duplicate
- requires_manual_review
```

#### **reconciliation_rules**
Configuration des règles de matching par banque :
```sql
- rule_type (exact|fuzzy|pattern|ml)
- conditions (amount_tolerance, require_reference, etc.)
- actions (auto_match, confidence, notify_ops)
```

#### **reconciliation_exceptions**
Queue de révision manuelle :
```sql
- statement_line_id
- exception_type (amount_mismatch, duplicate, multiple_matches, etc.)
- severity (low|medium|high|critical)
- suggested_match_id, suggested_match_confidence
- status (open|investigating|resolved)
- assigned_to
```

#### **reconciliation_audit**
Audit trail complet :
```sql
- statement_line_id
- action (matched, unmatched, corrected)
- previous_status, new_status
- match_confidence, match_method
- performed_by
```

#### **reconciliation_metrics**
Métriques quotidiennes :
```sql
- total_lines_ingested, matched, unmatched
- matches_exact, matches_fuzzy, matches_manual
- anomalies_amount, anomalies_duplicate
- avg_reconciliation_time_ms
```

---

## 💻 Reconciliation Worker

### Configuration

```typescript
const config: ReconciliationConfig = {
  batch_size: 50,
  max_retry_attempts: 3,
  retry_delay_ms: 5000,
  enable_fuzzy_matching: true,
  enable_sira_scoring: true,
  enable_auto_matching: true,
  auto_match_confidence_threshold: 95,
  anomaly_score_threshold: 70,
  duplicate_detection_enabled: true,
  webhook_enabled: true,
  metrics_enabled: true
};
```

### Usage

```typescript
import { ReconciliationWorker } from './workers/reconciliation-worker';

const worker = new ReconciliationWorker(config);
await worker.start(); // Run continuously

// Or process single batch
import { reconcileWorker } from './workers/reconciliation-worker';
await reconcileWorker(50); // Process 50 lines
```

### Algorithme de matching

#### 1. **Duplicate Detection**
```typescript
// Check for exact duplicates (same amount, date, reference)
const duplicate = await detectDuplicates(line);
if (duplicate) {
  markAsDuplicate(line.id, duplicate.id);
  return;
}
```

#### 2. **Find Candidates**
```sql
SELECT * FROM payout_slices
WHERE currency = $1
AND ABS(slice_amount - $2) <= $3
AND status IN ('sent', 'pending')
AND created_at BETWEEN $4 AND $5
ORDER BY ABS(slice_amount - $2) ASC
LIMIT 10
```

#### 3. **Exact Matching**
- Amount match (±0.01)
- Currency match
- Reference exact match
- → Confidence 100%

#### 4. **Fuzzy Matching**
- Amount match (±tolerance)
- Currency match
- Reference fuzzy match (Levenshtein distance)
- → Confidence 80-99%

#### 5. **Anomaly Detection**
```typescript
const anomalies = detectAnomalies(line, candidates);
// Returns: ['amount_mismatch', 'missing_reference', etc.]
```

#### 6. **SIRA Scoring**
```typescript
const siraResponse = await sendToSIRA('reconciliation.anomaly', {
  line,
  candidates,
  anomalies
});
// Returns: { score: 0-100, risk_level, recommended_action }
```

#### 7. **Decision Logic**
```typescript
if (exactMatch && confidence >= 100) {
  autoMatch(line, slice);
}
else if (fuzzyMatch && confidence >= 95) {
  autoMatch(line, slice);
}
else if (anomalyScore >= 70 || candidates.length > 1) {
  markForManualReview(line, candidates, anomalyScore);
}
else if (candidates.length === 0) {
  markAsNoMatch(line);
}
```

---

## 🔍 Matching Examples

### Example 1: Exact Match (100% confidence)

**Statement Line**:
```json
{
  "amount": 1000.00,
  "currency": "XOF",
  "reference": "PAY-2024-001",
  "statement_date": "2024-11-18"
}
```

**Payout Slice**:
```json
{
  "slice_amount": 1000.00,
  "currency": "XOF",
  "reference_code": "PAY-2024-001",
  "status": "sent"
}
```

**Result**: ✅ Auto-matched (confidence: 100%, method: exact)

---

### Example 2: Fuzzy Match (92% confidence)

**Statement Line**:
```json
{
  "amount": 1000.50,
  "currency": "XOF",
  "reference": "PAYMENT 2024 001",
  "statement_date": "2024-11-18"
}
```

**Payout Slice**:
```json
{
  "slice_amount": 1000.00,
  "currency": "XOF",
  "reference_code": "PAY-2024-001",
  "status": "sent"
}
```

**Result**: ⚠️ Manual review (confidence: 92%, method: fuzzy, differences: amount ±0.50, reference fuzzy match)

---

### Example 3: Multiple Candidates

**Statement Line**:
```json
{
  "amount": 500.00,
  "currency": "XOF",
  "reference": null,
  "statement_date": "2024-11-18"
}
```

**Candidates**:
- Slice A: 500.00 XOF (created 2024-11-17)
- Slice B: 500.00 XOF (created 2024-11-18)

**Result**: 🔴 Exception created (type: multiple_matches, severity: medium)

---

### Example 4: No Match

**Statement Line**:
```json
{
  "amount": 999.99,
  "currency": "EUR",
  "reference": "UNKNOWN-REF",
  "statement_date": "2024-11-18"
}
```

**Candidates**: []

**Result**: ⚠️ No match (anomaly_type: no_match, SIRA score: 85, requires manual review)

---

## 🚨 Anomaly Detection

### Types d'anomalies

| Type | Description | Severity | Action |
|------|-------------|----------|--------|
| **amount_mismatch** | Montant ne correspond pas (>1% diff) | Medium | Manual review |
| **currency_mismatch** | Devise différente | High | Block + alert |
| **duplicate** | Ligne déjà reconciliée | Low | Ignore |
| **missing_reference** | Pas de référence client | Medium | SIRA probabilistic match |
| **multiple_matches** | Plusieurs candidates possibles | Medium | Manual review |
| **no_match** | Aucun candidate trouvé | High | Create exception |
| **suspicious_pattern** | Pattern détecté par SIRA | Critical | Fraud investigation |

### SIRA Integration

```typescript
// Request
const siraRequest = {
  type: 'reconciliation.anomaly',
  data: {
    line: statementLine,
    candidates: matchCandidates,
    context: {
      bank_profile_id: 'uuid',
      recent_history: []
    }
  }
};

// Response
const siraResponse = {
  score: 85, // 0-100
  risk_level: 'high',
  factors: [
    { factor: 'amount_deviation', score: 90, weight: 0.4 },
    { factor: 'missing_reference', score: 100, weight: 0.3 },
    { factor: 'unusual_counterparty', score: 70, weight: 0.3 }
  ],
  recommended_action: 'manual_review',
  suggestions: [
    'Check with counterparty for reference',
    'Verify amount with accounting team',
    'Review similar transactions in last 30 days'
  ]
};
```

---

## 📡 Webhooks

### Events émis

#### **treasury.reconciliation.matched**
```json
{
  "event": "treasury.reconciliation.matched",
  "timestamp": "2024-11-18T10:30:00Z",
  "data": {
    "statement_line_id": "uuid",
    "payout_slice_id": "uuid",
    "amount": 1000.00,
    "currency": "XOF",
    "confidence": 100,
    "method": "exact"
  }
}
```

#### **treasury.reconciliation.manual_review**
```json
{
  "event": "treasury.reconciliation.manual_review",
  "timestamp": "2024-11-18T10:31:00Z",
  "data": {
    "statement_line_id": "uuid",
    "anomaly_score": 85,
    "anomalies": ["amount_mismatch", "missing_reference"],
    "candidates": [
      { "slice_id": "uuid", "confidence": 92 }
    ]
  }
}
```

#### **treasury.reconciliation.anomaly**
```json
{
  "event": "treasury.reconciliation.anomaly",
  "timestamp": "2024-11-18T10:32:00Z",
  "data": {
    "statement_line_id": "uuid",
    "anomaly_type": "suspicious_pattern",
    "anomaly_score": 95,
    "sira_recommendation": "fraud_investigation",
    "severity": "critical"
  }
}
```

---

## 📊 Metrics & Observability

### Prometheus Metrics

```
# Reconciliation metrics
molam_reconciliation_lines_processed_total{bank_profile="uuid",status="matched"} 1250
molam_reconciliation_lines_processed_total{bank_profile="uuid",status="unmatched"} 50
molam_reconciliation_lines_processed_total{bank_profile="uuid",status="anomaly"} 15

molam_reconciliation_match_confidence_avg{bank_profile="uuid",method="exact"} 100
molam_reconciliation_match_confidence_avg{bank_profile="uuid",method="fuzzy"} 92

molam_reconciliation_latency_seconds{quantile="0.95"} 0.125

molam_reconciliation_anomaly_score_avg{bank_profile="uuid"} 72

molam_reconciliation_exceptions_open{severity="critical"} 2
molam_reconciliation_exceptions_open{severity="high"} 5
```

### SQL Queries utiles

```sql
-- Daily reconciliation rate
SELECT
  bank_profile_id,
  metric_date,
  total_lines_matched * 100.0 / total_lines_ingested as match_rate_pct,
  total_lines_anomaly * 100.0 / total_lines_ingested as anomaly_rate_pct
FROM reconciliation_metrics
WHERE metric_date >= CURRENT_DATE - 7
ORDER BY metric_date DESC;

-- Pending exceptions by severity
SELECT
  severity,
  COUNT(*) as count,
  STRING_AGG(exception_type, ', ') as types
FROM reconciliation_exceptions
WHERE status = 'open'
GROUP BY severity
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END;

-- Unmatched lines older than 24h
SELECT
  id,
  statement_date,
  amount,
  currency,
  reference,
  reconciliation_attempts,
  last_reconciliation_attempt
FROM bank_statement_lines
WHERE reconciliation_status = 'unmatched'
  AND created_at < NOW() - INTERVAL '24 hours'
ORDER BY statement_date ASC;
```

---

## 🧪 Tests

### Unit Tests

```typescript
describe("Reconciliation Worker", () => {
  it("should match exact payment", async () => {
    // Insert test payout slice
    await pool.query(
      `INSERT INTO payout_slices (id, slice_amount, currency, status, reference_code)
       VALUES ($1, $2, $3, 'sent', $4)`,
      ["SLICE-001", 1000.00, "XOF", "PAY-2024-001"]
    );

    // Insert test statement line
    await pool.query(
      `INSERT INTO bank_statement_lines (id, bank_profile_id, statement_date, amount, currency, reference)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)`,
      ["LINE-001", "BANK-001", 1000.00, "XOF", "PAY-2024-001"]
    );

    // Run reconciliation
    await reconcileWorker(10);

    // Assert matched
    const { rows } = await pool.query(
      `SELECT reconciliation_status, matched_payout_slice_id, match_confidence
       FROM bank_statement_lines WHERE id = $1`,
      ["LINE-001"]
    );

    expect(rows[0].reconciliation_status).toBe("matched");
    expect(rows[0].matched_payout_slice_id).toBe("SLICE-001");
    expect(rows[0].match_confidence).toBe(100);
  });

  it("should detect duplicate", async () => {
    // Insert original line (already matched)
    await pool.query(
      `INSERT INTO bank_statement_lines
       (id, bank_profile_id, statement_date, amount, currency, reference, reconciliation_status)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 'matched')`,
      ["LINE-001", "BANK-001", 1000.00, "XOF", "PAY-001"]
    );

    // Insert duplicate line
    await pool.query(
      `INSERT INTO bank_statement_lines
       (id, bank_profile_id, statement_date, amount, currency, reference)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)`,
      ["LINE-002", "BANK-001", 1000.00, "XOF", "PAY-001"]
    );

    // Run reconciliation
    await reconcileWorker(10);

    // Assert duplicate
    const { rows } = await pool.query(
      `SELECT is_duplicate, duplicate_of FROM bank_statement_lines WHERE id = $1`,
      ["LINE-002"]
    );

    expect(rows[0].is_duplicate).toBe(true);
    expect(rows[0].duplicate_of).toBe("LINE-001");
  });
});
```

---

## 🔐 Sécurité & Conformité

### Data Masking

```typescript
// IBAN masking in logs
const maskedIBAN = iban.slice(0, 4) + '***' + iban.slice(-4);

// Account number masking
const maskedAccount = account.slice(0, 2) + '***' + account.slice(-2);
```

### Audit Trail

Toutes les actions sont loggées dans `reconciliation_audit` :
- Status changes
- Match/unmatch operations
- Manual corrections
- Exception resolutions

### WORM Storage

Fichiers bruts stockés en S3 avec :
- Encryption at rest (AES-256)
- Versioning enabled
- Object lock (WORM)
- Retention: 7 years (réglementation BCEAO)

---

## 📋 Configuration par environnement

### Development

```env
RECONCILIATION_BATCH_SIZE=10
RECONCILIATION_ENABLE_FUZZY=true
RECONCILIATION_ENABLE_SIRA=false
RECONCILIATION_AUTO_MATCH_THRESHOLD=95
```

### Production

```env
RECONCILIATION_BATCH_SIZE=100
RECONCILIATION_ENABLE_FUZZY=true
RECONCILIATION_ENABLE_SIRA=true
RECONCILIATION_AUTO_MATCH_THRESHOLD=98
RECONCILIATION_ANOMALY_THRESHOLD=70
```

---

## 🚀 Déploiement

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: reconciliation-worker
spec:
  schedule: "*/5 * * * *" # Every 5 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: worker
            image: molam/reconciliation-worker:1.0.0
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          restartPolicy: OnFailure
```

---

## 📚 Ressources

- [Architecture B122](ARCHITECTURE.md)
- [API Documentation](API.md)
- [Operational Runbook](RUNBOOK.md)
- [SIRA Integration Guide](SIRA_INTEGRATION.md)

---

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Maintainers**: Molam Backend Engineering
