# Brique 86 - Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Bank Statement Sources                       │
│                                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │ MT940   │  │  CAMT   │  │  API    │  │  SFTP   │                │
│  │  Files  │  │  (XML)  │  │  Feeds  │  │  Drop   │                │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                │
└───────┼────────────┼────────────┼────────────┼─────────────────────┘
        │            │            │            │
        └────────────┴────────────┴────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │    S3 Storage          │
        │  (Immutable, WORM)     │
        │                        │
        │  /statements/          │
        │    /2023/11/15/        │
        │      bank_a_001.mt940  │
        └────────────┬───────────┘
                     │
                     │ Worker polls for new files
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Ingestion Worker (src/workers)                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Fetch file from S3                                        │  │
│  │  2. Detect format (MT940/CAMT/custom)                        │  │
│  │  3. Run parser adapter                                        │  │
│  │  4. Normalize to standard schema                             │  │
│  │  5. Insert into bank_statement_lines                         │  │
│  │  6. Trigger reconciliation                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Parsers:                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
│  │  MT940   │  │   CAMT   │  │  Custom  │                          │
│  │  Parser  │  │  Parser  │  │ Adapters │                          │
│  └──────────┘  └──────────┘  └──────────┘                          │
└─────────────────────────┬────────────────────────────────────────────┘
                          │
                          │ Normalized lines
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Matching Engine (src/services/matcher.ts)           │
│                                                                      │
│  Pass 1: Exact Reference Match                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  line.reference == payout.reference_code                  │      │
│  │  Confidence: 1.0 (100%)                                   │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │ ✓ Match found                                 │
│                     ▼                                                │
│                  [Commit Match] ──────────────────┐                 │
│                     │                             │                 │
│  Pass 2: Provider Reference Match                 │                 │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  line.provider_ref == payout.provider_ref                 │      │
│  │  Confidence: 0.99 (99%)                                   │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │ ✓ Match found                                 │
│                     ▼                                                │
│                  [Commit Match] ──────────────────┐                 │
│                     │                             │                 │
│  Pass 3: Fuzzy Amount + Date                      │                 │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Amount within tolerance (% + cents)                      │      │
│  │  Date within window (±2 days default)                    │      │
│  │  String similarity scoring                                │      │
│  │  Confidence: 0.70-0.95 (variable)                         │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │                                                │
│              ┌──────┴──────┐                                        │
│         1 candidate   Multiple candidates                            │
│              │            │                                          │
│         Score ≥ 0.85   Score < 0.85                                 │
│              │            │                                          │
│              ▼            ▼                                          │
│      [Commit Match]  [Queue for Manual Review]                      │
│              │            │                                          │
│  Pass 4: Invoice Payment Match                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Extract invoice ref from description                     │      │
│  │  Match against invoice_payments table                     │      │
│  │  Confidence: 0.90 (90%)                                   │      │
│  └──────────────────┬───────────────────────────────────────┘      │
│                     │                                                │
│                     ▼                                                │
│              [Commit Match / Queue]                                  │
└─────────────────────┬────────────┬─────────────────────────────────┘
                      │            │
              ✓ Matched      ✗ Unmatched
                      │            │
                      ▼            ▼
        ┌─────────────────┐  ┌────────────────────┐
        │  Auto-Settle    │  │  Manual Review     │
        │                 │  │  Queue             │
        │  1. Update      │  │                    │
        │     line status │  │  1. Insert queue   │
        │  2. Mark payout │  │     entry          │
        │     settled     │  │  2. Classify       │
        │  3. Create      │  │     severity       │
        │     audit log   │  │  3. Store          │
        │  4. Release     │  │     candidates     │
        │     ledger hold │  │  4. Update         │
        └────────┬────────┘  │     metrics        │
                 │           └──────────┬─────────┘
                 │                      │
                 ▼                      ▼
        ┌─────────────────────────────────────┐
        │    reconciliation_matches           │
        │  - line_id                          │
        │  - matched_entity_id                │
        │  - match_score                      │
        │  - match_rule                       │
        └─────────────────────────────────────┘
                                        │
                                        ▼
                        ┌────────────────────────────┐
                        │  Ops UI (React)            │
                        │                            │
                        │  - Review queue items      │
                        │  - Compare candidates      │
                        │  - Manual match            │
                        │  - Create adjustments      │
                        │  - Ignore/dismiss          │
                        └────────────┬───────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────────┐
                        │  reconciliation_logs        │
                        │  (Immutable Audit Trail)    │
                        └─────────────────────────────┘
```

## Component Interactions

### 1. Ingestion Flow

```typescript
// Worker polls database
SELECT * FROM bank_statements_raw
WHERE status = 'uploaded'
ORDER BY imported_at
LIMIT 5
FOR UPDATE SKIP LOCKED;

// For each file:
1. Mark as 'parsing'
2. Fetch from S3
3. Run parser (MT940/CAMT)
4. Begin transaction:
   - Insert normalized lines
   - Mark file as 'parsed'
   - Commit
5. For each line:
   - Enqueue for reconciliation (async)
```

### 2. Matching Flow

```typescript
// Matching engine decision tree
async function matchLine(lineId: string) {
  const line = await fetchLine(lineId);

  // Try exact reference
  if (line.reference) {
    const payout = await findByExactRef(line.reference);
    if (payout) return commitMatch(line, payout, 1.0, 'exact_ref');
  }

  // Try provider reference
  if (line.provider_ref) {
    const payout = await findByProviderRef(line.provider_ref);
    if (payout) return commitMatch(line, payout, 0.99, 'provider_ref');
  }

  // Fuzzy matching
  const candidates = await findByAmountAndDate(line, tolerance);

  if (candidates.length === 1) {
    const score = calculateScore(line, candidates[0]);
    if (score >= threshold) {
      return commitMatch(line, candidates[0], score, 'fuzzy');
    }
  }

  if (candidates.length > 1) {
    const best = selectBestMatch(candidates);
    if (best.score >= threshold) {
      return commitMatch(line, best.payout, best.score, 'fuzzy_best');
    } else {
      return queueForReview('multiple_candidates', candidates);
    }
  }

  // No match
  return queueForReview('no_candidate', []);
}
```

### 3. Manual Review Flow

```typescript
// Ops user reviews queue item
GET /api/reco/queue/:id
{
  line: {...},
  candidates: [
    { id: 'payout_1', amount: 1000.00, score: 0.82 },
    { id: 'payout_2', amount: 999.50, score: 0.79 }
  ]
}

// User selects match
POST /api/reco/queue/:id/resolve
{
  user_id: 'ops_user_123',
  matched_entity_id: 'payout_1',
  notes: 'Manual match - partial fee deduction'
}

// System commits:
BEGIN TRANSACTION;
  INSERT INTO reconciliation_matches (...)
  UPDATE bank_statement_lines SET status = 'matched'
  UPDATE payouts SET status = 'settled'
  INSERT INTO reconciliation_logs (action = 'manual_matched')
COMMIT;
```

## Data Model

### Core Entities

```
bank_statements_raw
├── id (UUID, PK)
├── bank_profile_id (UUID)
├── external_file_id (TEXT, UNIQUE) -- Idempotency key
├── file_s3_key (TEXT)
├── file_type (TEXT) -- 'mt940' | 'camt' | 'api_json'
├── status (TEXT) -- 'uploaded' | 'parsing' | 'parsed' | 'parse_failed'
└── metadata (JSONB)

bank_statement_lines
├── id (UUID, PK)
├── raw_statement_id (UUID, FK)
├── bank_profile_id (UUID)
├── value_date (DATE)
├── amount (NUMERIC)
├── currency (TEXT)
├── reference (TEXT) -- Extracted payment reference
├── provider_ref (TEXT) -- Provider-specific ID (e.g., tr_xxx)
├── reconciliation_status (TEXT) -- 'unmatched' | 'matched' | 'suspicious'
└── metadata (JSONB)

reconciliation_matches
├── id (UUID, PK)
├── bank_statement_line_id (UUID, FK)
├── matched_type (TEXT) -- 'payout' | 'wallet_txn' | 'invoice_payment'
├── matched_entity_id (UUID)
├── match_score (NUMERIC) -- 0.0 to 1.0
├── match_rule (TEXT) -- 'exact_ref' | 'provider_ref' | 'fuzzy' | 'manual'
└── matched_by (UUID) -- User ID if manual

reconciliation_queue
├── id (UUID, PK)
├── bank_statement_line_id (UUID, FK)
├── reason (TEXT) -- 'no_candidate' | 'multiple_candidates' | 'low_confidence'
├── severity (TEXT) -- 'low' | 'medium' | 'high' | 'critical'
├── candidate_entities (JSONB) -- Array of potential matches
├── status (TEXT) -- 'open' | 'in_review' | 'resolved' | 'ignored'
└── assigned_to (UUID)
```

### Relationships

```
bank_statements_raw (1) ──→ (N) bank_statement_lines
bank_statement_lines (1) ──→ (0..1) reconciliation_matches
bank_statement_lines (1) ──→ (0..1) reconciliation_queue
reconciliation_matches (N) ──→ (1) payouts/wallet_txns/invoice_payments
```

## Observability Architecture

### Metrics Pipeline

```
┌──────────────────┐
│  Application     │
│  Components      │
│                  │
│  - Worker        │
│  - API           │
│  - Matcher       │
└────────┬─────────┘
         │
         │ Emit metrics
         │
         ▼
┌──────────────────┐
│  Prometheus      │
│  Client          │
│  (prom-client)   │
│                  │
│  - Counters      │
│  - Gauges        │
│  - Histograms    │
└────────┬─────────┘
         │
         │ Scrape endpoint: /metrics
         │
         ▼
┌──────────────────┐
│  Prometheus      │
│  Server          │
│                  │
│  Retention: 15d  │
└────────┬─────────┘
         │
         │ PromQL queries
         │
         ▼
┌──────────────────┐
│  Grafana         │
│  Dashboard       │
│                  │
│  - Match rate    │
│  - Queue size    │
│  - Latency P99   │
│  - Error rate    │
└──────────────────┘
```

### Logging Pipeline

```
Application
    │
    │ stdout/stderr
    │
    ▼
Docker/K8s
    │
    │ JSON logs
    │
    ▼
Fluentd/Fluent Bit
    │
    │ Structured logs
    │
    ▼
Elasticsearch
    │
    │ Index: brique-86-*
    │
    ▼
Kibana
(Search/Analysis)
```

## Security Architecture

### Authentication & Authorization

```
┌──────────────────┐
│  User Request    │
└────────┬─────────┘
         │
         │ JWT Token
         │
         ▼
┌──────────────────┐
│  API Gateway     │
│  (Auth Middleware│
└────────┬─────────┘
         │
         │ Validate token
         │ Extract user_id
         │
         ▼
┌──────────────────┐
│  RBAC Check      │
│  (Molam ID)      │
│                  │
│  Permissions:    │
│  - view_lines    │
│  - match_manual  │
│  - create_adjust │
└────────┬─────────┘
         │
         │ Authorized
         │
         ▼
┌──────────────────┐
│  Controller      │
│  + Audit Log     │
└──────────────────┘
```

### Data Protection

```
┌─────────────────┐
│  S3 Storage     │
│  - SSE-AES256   │
│  - Versioned    │
│  - WORM         │
└─────────────────┘

┌─────────────────┐
│  Database       │
│  - TLS in flight│
│  - Encrypted    │
│    at rest      │
│  - PII redacted │
│    in logs      │
└─────────────────┘

┌─────────────────┐
│  Application    │
│  - No PII in    │
│    metrics      │
│  - Audit trail  │
│    immutable    │
└─────────────────┘
```

## Deployment Architecture

### Kubernetes (Production)

```yaml
# Deployment overview
- Namespace: molam-prod
- Services:
  - brique-86-api (3 replicas)
  - brique-86-worker (2 replicas per bank)

# Resource requests:
API:
  CPU: 500m (request), 2000m (limit)
  Memory: 512Mi (request), 2Gi (limit)

Worker:
  CPU: 1000m (request), 4000m (limit)
  Memory: 1Gi (request), 4Gi (limit)

# Autoscaling:
- API: HPA on CPU > 70%
- Worker: KEDA on queue size > 100
```

### High Availability

```
┌──────────────────────────────────────────┐
│  Load Balancer (ALB)                     │
└────────┬──────────┬──────────┬───────────┘
         │          │          │
    ┌────▼────┐ ┌──▼──────┐ ┌▼────────┐
    │ API     │ │ API     │ │ API     │
    │ Pod 1   │ │ Pod 2   │ │ Pod 3   │
    └─────────┘ └─────────┘ └─────────┘
         │          │          │
         └──────────┴──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼────┐           ┌───▼─────┐
    │ Worker  │           │ Worker  │
    │ Bank A  │           │ Bank B  │
    └─────────┘           └─────────┘
         │                     │
         └──────────┬──────────┘
                    │
              ┌─────▼──────┐
              │ PostgreSQL │
              │ (RDS)      │
              │ Multi-AZ   │
              └────────────┘
```

## Performance Optimization

### Database Indexing Strategy

```sql
-- Hot path indices (used in every query)
CREATE INDEX idx_bank_lines_status ON bank_statement_lines(reconciliation_status)
WHERE reconciliation_status = 'unmatched';

CREATE INDEX idx_bank_lines_reference ON bank_statement_lines(reference)
WHERE reference IS NOT NULL;

-- Composite indices for fuzzy matching
CREATE INDEX idx_payouts_currency_amount ON payouts(currency, amount)
WHERE status IN ('sent', 'processing');

-- Partial indices for queue
CREATE INDEX idx_queue_open ON reconciliation_queue(severity, created_at)
WHERE status IN ('open', 'in_review');
```

### Caching Strategy

```
1. Application-level:
   - Reconciliation config cached for 5 minutes
   - Bank profiles cached for 1 hour

2. Database-level:
   - Materialized view for metrics (refresh hourly)
   - Connection pooling (20 connections)

3. CDN:
   - Static UI assets (React)
   - Cache-Control: max-age=86400
```

## Disaster Recovery

### Backup Strategy

```
Database:
- Full backup: Daily at 02:00 UTC
- Incremental: Every 6 hours
- WAL archiving: Continuous
- Retention: 30 days

S3:
- Versioning: Enabled
- Cross-region replication: Enabled
- Lifecycle: Glacier after 90 days

Recovery Time Objective (RTO): 4 hours
Recovery Point Objective (RPO): 1 hour
```

### Rollback Procedure

```bash
# If deployment fails:
1. kubectl rollout undo deployment/brique-86-api
2. kubectl rollout undo deployment/brique-86-worker

# If database migration fails:
1. Restore from latest backup
2. Replay WAL logs to point-in-time
3. Run rollback migration

# If data corruption detected:
1. Stop all workers
2. Identify corrupted records
3. Restore from backup
4. Replay clean transactions
```

---

**Architecture Version**: 1.0
**Last Updated**: 2023-11-15
**Owner**: Engineering Team - Brique 86
