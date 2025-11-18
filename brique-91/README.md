# Brique 91 — Statement Ingestion, Reconciliation & Treasury Operations

**Industrial-grade treasury management system** with automated statement ingestion, multi-level reconciliation matching, float management, and treasury plan execution.

## Overview

Brique 91 provides a complete treasury operations platform that:
- ✅ Ingests bank statements in multiple formats (MT940, ISO20022, CSV)
- ✅ Automatically reconciles transactions with 3-level matching (exact → tolerance → fuzzy)
- ✅ Manages treasury float with auto-sweep rules
- ✅ Generates and executes treasury plans (FX, sweeps, transfers)
- ✅ Monitors SLAs with >99% reconciliation target
- ✅ Provides regulatory export capabilities

**Key Metrics:**
- **Reconciliation Match Rate:** >99% target
- **Auto-Match Rate:** >95% target
- **Ingestion Success Rate:** >98% target
- **Plan Execution Success:** >99% target

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Brique 91 Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Statement   │───▶│ Reconciliation│───▶│    Float     │      │
│  │  Ingestion   │    │    Engine     │    │   Manager    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────────────────────────────────────────────┐      │
│  │           PostgreSQL Database (JSONB + Triggers)      │      │
│  └──────────────────────────────────────────────────────┘      │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Treasury   │    │   FX Engine  │    │     SLA      │      │
│  │   Planner    │    │ (Multi-Prov) │    │   Monitor    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Plan Executor (Orchestration)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**1. Statement Ingestion Flow:**
```
Bank Statement File (MT940/ISO20022/CSV)
    │
    ├─▶ Format Detection
    │
    ├─▶ Parser (MT940/ISO20022/CSV)
    │
    ├─▶ Normalization
    │
    └─▶ bank_statement_lines table
         │
         └─▶ Emit reconciliation events
```

**2. Reconciliation Flow:**
```
Unmatched Statement Line
    │
    ├─▶ Level 1: Exact Reference Match
    │      └─▶ Match by external_id/provider_ref
    │
    ├─▶ Level 2: Amount + Date Tolerance
    │      └─▶ Match within ±3 days, ±1% amount
    │
    ├─▶ Level 3: Fuzzy Matching
    │      └─▶ Name similarity + amount (75% threshold)
    │
    └─▶ Result:
         ├─▶ Matched: Update both records, log reconciliation
         └─▶ Unmatched: Create reconciliation issue
```

**3. Treasury Plan Flow:**
```
Plan Request (FX/Sweep/Transfer)
    │
    ├─▶ Generate Plan
    │      ├─▶ Fetch FX quotes (if needed)
    │      ├─▶ Calculate costs
    │      └─▶ Determine approval requirements
    │
    ├─▶ Approval (if required)
    │
    ├─▶ Execute Plan
    │      ├─▶ Execute FX trades
    │      ├─▶ Execute sweeps/transfers
    │      └─▶ Update account balances
    │
    └─▶ Result:
         ├─▶ Success: Mark completed
         └─▶ Failure: Rollback (if possible)
```

---

## Features

### 1. Statement Ingestion

**Supported Formats:**
- **MT940:** SWIFT bank statement format with tag-based structure
- **ISO20022 (CAMT.053):** XML-based bank-to-customer statement
- **CSV:** Flexible CSV parser with auto-detection

**Capabilities:**
- ✅ Auto-format detection
- ✅ Parallel parsing for performance
- ✅ Error handling with retry logic
- ✅ S3 integration (ready for production)
- ✅ Duplicate detection via statement_id

**Worker:** [`statement-ingest.ts`](src/workers/statement-ingest.ts:1)

### 2. Reconciliation Engine

**Three-Level Matching:**

| Level | Method | Match Criteria | Confidence |
|-------|--------|----------------|------------|
| 1 | Exact Reference | `external_id` or `provider_ref` match | 100% |
| 2 | Amount + Date | ±1% amount, ±3 days | 70-99% |
| 3 | Fuzzy | Name similarity >75%, ±5% amount | 75-95% |

**Fuzzy Matching Algorithm:**
- Levenshtein distance for name similarity
- Normalized names (lowercase, special chars removed)
- Composite scoring: 60% name + 30% amount + 10% date

**Issue Management:**
- Auto-creates issues for unmatched lines
- Priority assignment based on amount and age
- Manual review queue for Ops team

**Worker:** [`reconciliation-worker.ts`](src/workers/reconciliation-worker.ts:1)
**Service:** [`matching-engine.ts`](src/services/matching-engine.ts:1)

### 3. Float Management

**Float Snapshots:**
- Periodic balance snapshots (configurable interval)
- Historical balance tracking
- Balance change detection

**Sweep Rules:**
```javascript
{
  treasury_account_id: "uuid",
  min_threshold: 10000,      // Sweep IN if below
  max_threshold: 100000,     // Sweep OUT if above
  target_balance: 50000,     // Target balance
  auto_execute: true         // Execute automatically
}
```

**Auto-Sweep Execution:**
- Evaluates rules periodically
- Generates sweep recommendations
- Executes auto-approved sweeps
- Creates draft plans for manual review

**Worker:** [`sweep-worker.ts`](src/workers/sweep-worker.ts:1)
**Service:** [`float-manager.ts`](src/services/float-manager.ts:1)

### 4. Treasury Plans

**Plan Types:**
- **FX Trade:** Currency conversion with multi-provider quotes
- **Sweep:** Internal account balance transfer
- **Transfer:** External bank transfer

**Plan Lifecycle:**
```
draft → (requires_approval) → approved → executing → completed
                                  ↓
                              rejected
```

**Approval Requirements:**
- Total cost > $100,000
- Any FX trade
- Critical priority actions

**Rollback Support:**
- Sweeps/transfers can be rolled back
- FX trades cannot be auto-rolled back (manual intervention)

**Services:**
- [`plan-generator.ts`](src/services/plan-generator.ts:1)
- [`plan-executor.ts`](src/services/plan-executor.ts:1)

**Worker:** [`plan-executor-worker.ts`](src/workers/plan-executor-worker.ts:1)

### 5. FX Engine

**Multi-Provider Architecture:**
- Abstract provider interface
- Parallel quote fetching
- Automatic provider selection (lowest cost)
- Quote caching (15-minute expiry)

**Supported Providers:** (Mock implementation included)
- CurrencyCloud (0.5% markup)
- Wise (0.3% markup)
- XE (0.7% markup)

**Cost Calculation:**
```
total_cost = fee_amount
to_amount = from_amount × exchange_rate
exchange_rate = market_rate × (1 - markup)
```

**Health Monitoring:**
- Per-provider health checks
- Automatic failover
- Latency tracking

**Service:** [`fx-engine.ts`](src/services/fx-engine.ts:1)
**Providers:** [`fx-providers/mock-provider.ts`](src/services/fx-providers/mock-provider.ts:1)

### 6. SLA Monitoring

**Tracked Metrics:**

| Metric | Target | Period |
|--------|--------|--------|
| Reconciliation Match Rate | >99% | 24h |
| Auto-Match Rate | >95% | 24h |
| Reconciliation Time P95 | <24h | 24h |
| Ingestion Success Rate | >98% | 24h |
| Ingestion Time P95 | <10min | 24h |
| Plan Success Rate | >99% | 24h |
| Plan Execution Time P95 | <30min | 24h |
| Sweep Execution Rate | >99% | 24h |

**Alert Levels:**
- ✅ **OK:** Metric meets threshold
- ⚠️ **Warning:** Within 90% of threshold
- ❌ **Critical:** Below 90% of threshold

**Service:** [`sla-monitor.ts`](src/services/sla-monitor.ts:1)
**Worker:** [`sla-monitor-worker.ts`](src/workers/sla-monitor-worker.ts:1)

---

## Database Schema

### Core Tables

**bank_statement_lines**
```sql
- id (UUID, PK)
- statement_id (TEXT)
- value_date (TIMESTAMPTZ)
- amount (NUMERIC)
- currency (TEXT)
- direction (TEXT: debit/credit)
- reference (TEXT)
- beneficiary_json (JSONB)
- reconciliation_status (TEXT)
- matched_payout_id (UUID, FK)
- match_method (TEXT)
- match_confidence (NUMERIC)
```

**reconciliation_issues**
```sql
- id (UUID, PK)
- statement_line_id (UUID, FK)
- issue_type (TEXT)
- priority (TEXT)
- status (TEXT)
- assigned_to (UUID)
- match_attempts (INT)
```

**treasury_float_snapshots**
```sql
- id (UUID, PK)
- treasury_account_id (UUID, FK)
- balance (NUMERIC)
- available_balance (NUMERIC)
- snapshot_at (TIMESTAMPTZ)
```

**sweep_rules**
```sql
- id (UUID, PK)
- treasury_account_id (UUID, FK)
- min_threshold (NUMERIC)
- max_threshold (NUMERIC)
- target_balance (NUMERIC)
- auto_execute (BOOLEAN)
```

**treasury_plans**
```sql
- id (UUID, PK)
- plan_reference (TEXT, UNIQUE)
- status (TEXT)
- total_estimated_cost (NUMERIC)
- requires_approval (BOOLEAN)
- approved_by (UUID[])
```

**treasury_plan_actions**
```sql
- id (UUID, PK)
- plan_id (UUID, FK)
- action_type (TEXT)
- from_account_id (UUID)
- to_account_id (UUID)
- amount (NUMERIC)
- status (TEXT)
```

**fx_quotes**
```sql
- id (UUID, PK)
- from_currency (TEXT)
- to_currency (TEXT)
- from_amount (NUMERIC)
- to_amount (NUMERIC)
- exchange_rate (NUMERIC)
- provider (TEXT)
- total_cost (NUMERIC)
- expires_at (TIMESTAMPTZ)
```

**fx_trades**
```sql
- id (UUID, PK)
- quote_id (UUID, FK)
- provider_trade_id (TEXT)
- status (TEXT)
- executed_at (TIMESTAMPTZ)
```

**Full schema:** [`migrations/001_b91_treasury_operations.sql`](migrations/001_b91_treasury_operations.sql:1)

---

## Installation & Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with JSONB support
- Redis (optional, for caching)

### Installation

```bash
# Navigate to brique-91 directory
cd brique-91

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Database Setup

```bash
# Run migrations
psql -U postgres -d molam_connect -f migrations/001_b91_treasury_operations.sql
```

### Configuration

**.env**
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=molam_connect
DB_USER=postgres
DB_PASSWORD=your_password
DB_POOL_MAX=20

# Workers
INGEST_POLL_MS=5000              # Statement ingestion poll interval
RECON_POLL_MS=10000              # Reconciliation poll interval
RECON_BATCH_SIZE=50              # Reconciliation batch size
SWEEP_POLL_MS=300000             # Sweep poll interval (5 min)
SNAPSHOT_INTERVAL_MS=600000      # Float snapshot interval (10 min)
PLAN_EXEC_POLL_MS=30000          # Plan execution poll interval
SLA_MONITOR_POLL_MS=3600000      # SLA monitoring interval (1 hour)

# Storage (for statement files)
STORAGE_TYPE=local               # local | s3
S3_BUCKET=molam-statements
S3_REGION=us-east-1

# FX Providers (production)
CURRENCYCLOUD_API_KEY=xxx
WISE_API_KEY=xxx
XE_API_KEY=xxx
```

---

## Running Workers

### Start All Workers

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### Start Individual Workers

```bash
# Statement ingestion
npm run worker:ingest

# Reconciliation
npm run worker:recon

# Float manager / sweep
npm run worker:sweep

# Plan executor
npm run worker:plan-exec

# SLA monitor
npm run worker:sla
```

---

## API Reference

### Statement Ingestion

**Upload Statement**
```bash
POST /api/v1/statements/upload

# With file upload
curl -X POST http://localhost:3000/api/v1/statements/upload \
  -F "file=@statement.mt940" \
  -F "bank_profile_id=uuid" \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "id": "uuid",
  "status": "uploaded",
  "file_name": "statement.mt940",
  "file_size": 12345
}
```

**Get Statement Status**
```bash
GET /api/v1/statements/:id

curl http://localhost:3000/api/v1/statements/uuid \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "id": "uuid",
  "status": "parsed",
  "parsed_lines_count": 145,
  "format_detected": "MT940"
}
```

### Reconciliation

**Get Unmatched Lines**
```bash
GET /api/v1/reconciliation/unmatched?limit=50

curl http://localhost:3000/api/v1/reconciliation/unmatched?limit=50 \
  -H "Authorization: Bearer TOKEN"
```

**Manual Match**
```bash
POST /api/v1/reconciliation/manual-match

curl -X POST http://localhost:3000/api/v1/reconciliation/manual-match \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "statement_line_id": "uuid",
    "payout_id": "uuid",
    "matched_by": "user-uuid",
    "notes": "Manual match after verification"
  }'
```

**Get Reconciliation Issues**
```bash
GET /api/v1/reconciliation/issues?status=open&priority=high

curl http://localhost:3000/api/v1/reconciliation/issues?status=open \
  -H "Authorization: Bearer TOKEN"
```

### Treasury Plans

**Create Plan**
```bash
POST /api/v1/treasury/plans

curl -X POST http://localhost:3000/api/v1/treasury/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "created_by": "user-uuid",
    "actions": [
      {
        "action_type": "fx_trade",
        "from_currency": "USD",
        "to_currency": "EUR",
        "amount": 100000
      }
    ]
  }'

# Response
{
  "plan_id": "uuid",
  "plan_reference": "PLAN-1234567890",
  "total_estimated_cost": 500,
  "requires_approval": true,
  "actions": [...]
}
```

**Approve Plan**
```bash
POST /api/v1/treasury/plans/:id/approve

curl -X POST http://localhost:3000/api/v1/treasury/plans/uuid/approve \
  -H "Authorization: Bearer TOKEN" \
  -d '{"approved_by": "user-uuid"}'
```

**Execute Plan**
```bash
POST /api/v1/treasury/plans/:id/execute

curl -X POST http://localhost:3000/api/v1/treasury/plans/uuid/execute \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "success": true,
  "executed_actions": 3,
  "failed_actions": 0
}
```

**Rollback Plan**
```bash
POST /api/v1/treasury/plans/:id/rollback

curl -X POST http://localhost:3000/api/v1/treasury/plans/uuid/rollback \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "rolled_back_by": "user-uuid",
    "reason": "Incorrect amount"
  }'
```

### Float Management

**Get Float Snapshot**
```bash
GET /api/v1/treasury/float

curl http://localhost:3000/api/v1/treasury/float \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "accounts": [
    {
      "treasury_account_id": "uuid",
      "currency": "USD",
      "current_balance": 150000,
      "available_balance": 145000,
      "last_snapshot_at": "2025-01-14T10:00:00Z"
    }
  ]
}
```

**Create Sweep Rule**
```bash
POST /api/v1/treasury/sweep-rules

curl -X POST http://localhost:3000/api/v1/treasury/sweep-rules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "treasury_account_id": "uuid",
    "target_account_id": "uuid",
    "currency": "USD",
    "min_threshold": 10000,
    "max_threshold": 100000,
    "target_balance": 50000,
    "auto_execute": true
  }'
```

### FX Operations

**Get FX Quotes**
```bash
POST /api/v1/fx/quotes

curl -X POST http://localhost:3000/api/v1/fx/quotes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "from_currency": "USD",
    "to_currency": "EUR",
    "from_amount": 100000
  }'

# Response
{
  "quotes": [
    {
      "id": "quote-uuid",
      "provider": "Wise",
      "exchange_rate": 0.9197,
      "to_amount": 91970,
      "total_cost": 300,
      "expires_at": "2025-01-14T11:15:00Z"
    },
    {
      "id": "quote-uuid-2",
      "provider": "CurrencyCloud",
      "exchange_rate": 0.9154,
      "to_amount": 91540,
      "total_cost": 500,
      "expires_at": "2025-01-14T11:15:00Z"
    }
  ]
}
```

**Get FX Rate**
```bash
GET /api/v1/fx/rate?from=USD&to=EUR

curl http://localhost:3000/api/v1/fx/rate?from=USD&to=EUR \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "from_currency": "USD",
  "to_currency": "EUR",
  "rate": 0.92,
  "timestamp": "2025-01-14T10:00:00Z"
}
```

### SLA Monitoring

**Get SLA Report**
```bash
GET /api/v1/sla/report?hours=24

curl http://localhost:3000/api/v1/sla/report?hours=24 \
  -H "Authorization: Bearer TOKEN"

# Response
{
  "period": "24h",
  "overall_status": "ok",
  "metrics": [
    {
      "metric_name": "Reconciliation Match Rate",
      "metric_value": 0.995,
      "threshold": 0.99,
      "status": "ok"
    }
  ],
  "breached_slas": []
}
```

---

## Monitoring & Observability

### Prometheus Metrics

**Exposed metrics:**
```
# Reconciliation metrics
treasury_reconciliation_match_rate
treasury_reconciliation_auto_match_rate
treasury_reconciliation_time_p95_seconds

# Ingestion metrics
treasury_ingestion_success_rate
treasury_ingestion_time_p95_seconds

# Plan metrics
treasury_plan_success_rate
treasury_plan_execution_time_p95_seconds

# Float metrics
treasury_float_balance_by_currency
treasury_sweep_execution_rate
```

**Grafana Dashboard:** (Template included in `/monitoring/grafana-dashboard.json`)

### Logging

**Structured logging with context:**
```javascript
[StatementIngestWorker] Processing statement uuid (file.mt940)
[MatchingEngine] ✓ Exact reference match found
[FloatManager] ✓ Executed auto-sweep: USD 50000 (above_max_threshold)
[SLAMonitor] 🚨 SLA ALERT: Reconciliation Match Rate
```

**Log levels:**
- INFO: Normal operations
- WARN: Recoverable errors
- ERROR: Failures requiring attention

---

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- matching-engine.test.ts

# Run with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Full integration test suite
npm run test:integration

# Test statement ingestion
npm run test:ingest

# Test reconciliation
npm run test:recon
```

### Load Testing

```bash
# Simulate 1000 statements
npm run load-test:ingest -- --count=1000

# Simulate concurrent reconciliation
npm run load-test:recon -- --workers=10
```

---

## Production Deployment

### Docker

**Build image:**
```bash
docker build -t molam/brique-91:latest .
```

**Run container:**
```bash
docker run -d \
  --name brique-91 \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=xxx \
  -p 3000:3000 \
  molam/brique-91:latest
```

### Kubernetes

**Deploy all workers:**
```bash
kubectl apply -f k8s/deployment.yaml
```

**Scale workers:**
```bash
# Scale reconciliation workers
kubectl scale deployment recon-worker --replicas=5

# Scale plan executors
kubectl scale deployment plan-executor --replicas=3
```

### Health Checks

**Worker health endpoint:**
```bash
GET /health

# Response
{
  "status": "healthy",
  "workers": {
    "statement_ingest": "running",
    "reconciliation": "running",
    "sweep": "running",
    "plan_executor": "running",
    "sla_monitor": "running"
  },
  "database": "connected",
  "uptime_seconds": 3600
}
```

---

## Performance Tuning

### Database Optimization

**Indexes:**
```sql
-- Already included in schema
CREATE INDEX idx_statement_lines_unmatched ON bank_statement_lines(reconciliation_status)
  WHERE reconciliation_status = 'unmatched';

CREATE INDEX idx_statement_lines_value_date ON bank_statement_lines(value_date);

CREATE INDEX idx_fx_quotes_valid ON fx_quotes(from_currency, to_currency, expires_at)
  WHERE expires_at > NOW();
```

**Connection pooling:**
```javascript
DB_POOL_MAX=20  // Increase for high concurrency
```

### Worker Scaling

**Adjust poll intervals:**
```bash
# High-volume ingestion
INGEST_POLL_MS=1000  # Poll every second

# Aggressive reconciliation
RECON_POLL_MS=5000
RECON_BATCH_SIZE=100
```

**Horizontal scaling:**
- Run multiple worker instances
- Use `SKIP LOCKED` for job distribution
- No coordination needed (stateless workers)

---

## Troubleshooting

### Common Issues

**1. Reconciliation not matching:**
```bash
# Check unmatched lines
SELECT * FROM bank_statement_lines
WHERE reconciliation_status = 'unmatched'
LIMIT 10;

# Check reconciliation issues
SELECT * FROM reconciliation_issues
WHERE status = 'open'
ORDER BY priority DESC;
```

**2. Statement ingestion failing:**
```bash
# Check failed statements
SELECT id, file_name, error_message
FROM bank_statements_raw
WHERE status = 'failed';

# Retry failed statement
UPDATE bank_statements_raw
SET status = 'uploaded', retry_count = 0
WHERE id = 'uuid';
```

**3. Plan execution stuck:**
```bash
# Check stuck plans
SELECT * FROM treasury_plans
WHERE status = 'executing'
  AND executed_at < NOW() - INTERVAL '1 hour';

# Reset stuck plan
UPDATE treasury_plans
SET status = 'approved'
WHERE id = 'uuid';
```

---

## Security Considerations

### Access Control

- All API endpoints require JWT authentication
- RBAC enforcement via Molam ID
- Row-level security on sensitive tables

### Data Protection

- PII fields encrypted at rest
- Audit logs for all modifications
- Secure credential storage (KMS)

### Network Security

- TLS 1.3 for all external communications
- Internal service mesh with mTLS
- API rate limiting

---

## Roadmap

**Q1 2025:**
- [ ] ML-based reconciliation matching
- [ ] Advanced FX hedging strategies
- [ ] Real-time balance streaming

**Q2 2025:**
- [ ] Multi-entity treasury consolidation
- [ ] Cash flow forecasting
- [ ] Automated compliance reporting

---

## Support

**Documentation:** https://docs.molam.com/brique-91
**Issues:** https://github.com/molam/molam-connect/issues
**Slack:** #brique-91-support

---

## License

Proprietary - Molam Connect Platform
© 2025 Molam. All rights reserved.
