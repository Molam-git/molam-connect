# Brique 86 — Statement Ingestion & Reconciliation Worker

**Enterprise-grade bank statement reconciliation system** for Molam Connect.

## Overview

Brique 86 provides automated ingestion, parsing, and reconciliation of bank statements with payouts, wallet transactions, and invoice payments. It implements a sophisticated multi-level matching engine with configurable tolerance rules, manual review workflows, and SIRA integration for fraud detection.

## Key Features

- **Multi-format Parser Support**: MT940 (SWIFT), CAMT.053 (ISO20022), API feeds
- **Intelligent Matching**: 4-level matching strategy (exact ref, provider ref, fuzzy amount/date, invoice)
- **Configurable Tolerance**: Per-bank tolerance rules for amount and date matching
- **Manual Review Queue**: Ops UI for reviewing unmatched or suspicious transactions
- **SIRA Integration**: Automatic fraud pattern detection and reporting
- **Idempotent Ingestion**: Duplicate file detection via external_file_id
- **Audit Trail**: Immutable reconciliation logs for compliance
- **Real-time Metrics**: Prometheus integration with Grafana dashboards

## Architecture

```
┌─────────────────┐
│  S3 Statement   │
│     Files       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Ingestion Worker               │
│  - Fetches files from S3        │
│  - Runs bank-specific parser    │
│  - Normalizes to standard format│
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Matching Engine                │
│  1. Exact reference match       │
│  2. Provider reference match    │
│  3. Fuzzy amount + date         │
│  4. Invoice payment match       │
└────────┬───────────┬────────────┘
         │           │
    ✓ Match    ✗ No Match
         │           │
         ▼           ▼
┌──────────────┐ ┌──────────────────┐
│ Auto-settle  │ │ Manual Review    │
│ Payout       │ │ Queue            │
└──────────────┘ └──────────────────┘
         │           │
         ▼           ▼
┌─────────────────────────────────┐
│  SIRA Fraud Detection           │
│  - High-value unmatched         │
│  - Structuring patterns         │
│  - Suspicious beneficiaries     │
└─────────────────────────────────┘
```

## Database Schema

### Core Tables

- `bank_statements_raw` - Immutable raw statement files
- `bank_statement_lines` - Normalized transaction lines
- `reconciliation_matches` - Successful matches
- `reconciliation_queue` - Manual review queue
- `reconciliation_config` - Per-bank tolerance rules
- `reconciliation_adjustments` - Financial adjustments
- `reconciliation_logs` - Audit trail

See [migrations/001_b86_statement_reconciliation.sql](migrations/001_b86_statement_reconciliation.sql) for full schema.

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- S3-compatible storage
- SIRA API endpoint (optional)

### Setup

```bash
# Install dependencies
npm install

# Run migrations
psql -d molam_connect -f migrations/001_b86_statement_reconciliation.sql

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Build TypeScript
npm run build

# Run tests
npm test
```

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password

# S3
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
STATEMENTS_BUCKET=molam-bank-statements

# SIRA
SIRA_API_ENDPOINT=http://localhost:3059/api
SIRA_API_KEY=your_sira_key

# Server
PORT=3086
NODE_ENV=production
```

## Running the System

### Start Ingestion Worker

```bash
npm run worker:ingest
```

This worker continuously polls for uploaded statement files and processes them.

### Start API Server

```bash
npm run server
```

API runs on `http://localhost:3086`

### Start Ops UI

```bash
cd web
npm install
npm run dev
```

UI runs on `http://localhost:3000`

## Usage

### 1. Upload Bank Statement

Upload a statement file to S3 and create a database entry:

```typescript
const fileId = crypto.createHash('sha256').update(fileBuffer).digest('hex');

await pool.query(
  `INSERT INTO bank_statements_raw (
    bank_profile_id, external_file_id, file_s3_key, file_type, status
  ) VALUES ($1, $2, $3, $4, 'uploaded')`,
  [bankProfileId, fileId, s3Key, 'mt940']
);
```

### 2. Worker Processes File

The ingestion worker will:
- Fetch file from S3
- Parse using appropriate parser (MT940/CAMT)
- Insert normalized lines into `bank_statement_lines`
- Trigger matching engine

### 3. Automatic Matching

The matching engine runs 4 passes:

1. **Exact Reference**: Matches `line.reference` ↔ `payout.reference_code`
2. **Provider Reference**: Matches `line.provider_ref` ↔ `payout.provider_ref`
3. **Fuzzy Amount/Date**: Matches within tolerance window
4. **Invoice Payments**: Extracts invoice refs from description

### 4. Manual Review (if needed)

Unmatched lines appear in the Ops UI queue:

```
GET /api/reco/queue?status=open
```

Ops can review and manually match:

```
POST /api/reco/queue/{id}/resolve
{
  "user_id": "ops_user_123",
  "matched_type": "payout",
  "matched_entity_id": "payout_uuid",
  "notes": "Manual match - partial fee deduction"
}
```

## API Reference

### GET /api/reco/lines

List statement lines with filters.

**Query Parameters:**
- `status`: unmatched | matched | manual_review | suspicious
- `bank_profile_id`: UUID
- `date_from`: ISO date
- `date_to`: ISO date
- `currency`: EUR | USD | GBP
- `limit`: number (default: 50)
- `offset`: number (default: 0)

### GET /api/reco/queue

Get manual review queue items.

**Query Parameters:**
- `status`: open | in_review | resolved | ignored
- `severity`: low | medium | high | critical

### POST /api/reco/queue/:id/resolve

Resolve queue item with manual match.

**Body:**
```json
{
  "user_id": "string",
  "matched_type": "payout | wallet_txn | invoice_payment",
  "matched_entity_id": "uuid",
  "notes": "string (optional)"
}
```

### GET /api/reco/stats

Get reconciliation statistics.

**Response:**
```json
{
  "lines": {
    "total_lines": 1234,
    "matched_count": 1150,
    "unmatched_count": 50,
    "manual_review_count": 34,
    "match_rate_pct": 93.19
  },
  "queue": [
    { "severity": "high", "count": 10 },
    { "severity": "medium", "count": 24 }
  ]
}
```

## Monitoring

### Prometheus Metrics

Access metrics at `http://localhost:3086/metrics`

**Key Metrics:**
- `reco_lines_processed_total` - Total lines processed
- `reco_match_rate` - Current match rate (%)
- `reco_latency_seconds` - Processing latency histogram
- `reco_queue_size` - Queue size by severity
- `reco_parse_errors_total` - Parser error count

### Grafana Dashboard

Import dashboard from `grafana/reconciliation-dashboard.json`

**Panels:**
- Match rate trend
- Queue size over time
- Processing latency
- Parser errors
- Top unmatched reasons

## Troubleshooting

### Parser Errors

**Issue**: MT940 parsing fails
```
Error: MT940 parse failed: Invalid date format
```

**Solution**: Check MT940 format variant. Add bank-specific adapter:

```typescript
// src/parsers/adapters/bank-xyz.ts
export function adaptBankXYZ(content: string): string {
  // Transform to standard MT940 format
  return content.replace(/custom_pattern/, 'standard_pattern');
}
```

### Low Match Rate

**Issue**: Match rate < 90%

**Solution**:
1. Check reconciliation config tolerances
2. Review unmatched queue for patterns
3. Adjust `tolerance_pct` and `date_window_days`

```sql
UPDATE reconciliation_config
SET tolerance_pct = 0.01,  -- Increase to 1%
    date_window_days = 5    -- Widen date window
WHERE bank_profile_id = 'xxx';
```

### High Queue Size

**Issue**: Manual review queue growing

**Solution**:
1. Check for systematic issues (missing provider refs)
2. Bulk-match by pattern:

```sql
-- Example: Bulk match by reference prefix
UPDATE reconciliation_queue q
SET status = 'resolved'
WHERE bank_statement_line_id IN (
  SELECT l.id FROM bank_statement_lines l
  WHERE l.reference LIKE 'KNOWN_PREFIX_%'
);
```

## Performance Tuning

### High Volume Banks

For banks with >1000 lines/day:

1. **Partition by bank**:
```sql
CREATE TABLE bank_statement_lines_bankA
PARTITION OF bank_statement_lines
FOR VALUES IN ('bank_a_profile_id');
```

2. **Run parallel workers**:
```bash
# Terminal 1
WORKER_ID=1 BANK_FILTER=bank_a npm run worker:ingest

# Terminal 2
WORKER_ID=2 BANK_FILTER=bank_b npm run worker:ingest
```

3. **Increase batch size**:
```typescript
const BATCH_SIZE = 20; // Increase from 5
```

## Security

- Statement files stored in S3 WORM (versioned, immutable)
- PII (beneficiary names, IBANs) redacted in UI unless authorized
- RBAC enforced via Molam ID on all Ops actions
- Audit trail immutable (append-only reconciliation_logs)

## Compliance

- **PCI DSS**: No card data stored
- **GDPR**: PII redaction, right to erasure via soft-delete
- **SOC 2**: Audit logs, access controls, monitoring
- **AML**: SIRA integration for suspicious activity reporting

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm test

# Coverage
npm run test:coverage
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

Proprietary - Molam Connect

## Support

- **Slack**: #brique-86-reconciliation
- **On-call**: ops-oncall@molam.com
- **Runbook**: [RUNBOOK.md](RUNBOOK.md)
