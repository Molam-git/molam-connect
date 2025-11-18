# Brique 93 — Payout Scheduling & Priority Engine

**Industrial-grade batch planning and prioritization system** with settlement windows, multi-sig approvals, SIRA-powered optimization, and quota management.

## Overview

Brique 93 provides comprehensive scheduling orchestration for Brique 92 payouts:
- ✅ **Settlement Windows** with timezone-aware cutoffs
- ✅ **Priority-Based Routing** (instant, express, standard, economy)
- ✅ **Batch Planning** with SIRA cost optimization
- ✅ **Multi-Sig Approvals** for high-value batches
- ✅ **Quota Management** per tenant/bank/treasury account
- ✅ **Simulate → Approve → Execute** workflow
- ✅ **Rollback Support** with audit trail

**Key Metrics:**
- **Plan Generation P50:** <200ms for 1,000 items
- **Approval Latency:** <30s for 2-sig
- **Execution Success Rate:** >99.5%

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│               Brique 93 Scheduling Engine                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐                                                │
│  │   Pending    │                                                │
│  │   Payouts    │ (from B92)                                     │
│  └──────┬───────┘                                                │
│         │                                                         │
│         ▼                                                         │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │  Scheduler   │───────▶│     SIRA     │                       │
│  │   Service    │        │  Simulation  │                       │
│  └──────┬───────┘        └──────────────┘                       │
│         │                       │                                │
│         ▼                       ▼                                │
│  ┌──────────────────────────────────┐                           │
│  │       Batch Plan (Draft)         │                           │
│  │  - Items + Routing                │                           │
│  │  - Estimated Fees                 │                           │
│  │  - SIRA Score                     │                           │
│  └──────────────┬───────────────────┘                           │
│                 │                                                 │
│        ┌────────┴─────────┐                                     │
│        │  Requires         │                                     │
│        │  Approval?        │                                     │
│        └────────┬──────────┘                                     │
│                 │                                                 │
│         ┌───────┴────────┐                                       │
│         │ YES            │ NO                                    │
│         ▼                ▼                                        │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │  Multi-Sig   │  │ Auto-Approve │                            │
│  │  Approval    │  │   (< $10K)   │                            │
│  └──────┬───────┘  └──────┬───────┘                            │
│         │                  │                                     │
│         └──────────┬───────┘                                     │
│                    ▼                                              │
│             ┌──────────────┐                                     │
│             │   Execute    │                                     │
│             │     Plan     │                                     │
│             └──────┬───────┘                                     │
│                    │                                              │
│                    ▼                                              │
│             ┌──────────────┐                                     │
│             │ Enqueue to   │                                     │
│             │  B92 Worker  │                                     │
│             └──────────────┘                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Settlement Windows

**Timezone-Aware Cutoffs:**
```javascript
{
  bank_profile_id: "uuid",
  treasury_account_id: "uuid",
  timezone: "Africa/Abidjan",
  cutoff_time: "16:00:00", // Local time
  settlement_delay_days: 1, // T+1
  rails: ["swift", "sepa", "instant"],
  is_instant: false
}
```

**Window Calculation:**
- Cutoff before 4 PM local → Next day settlement
- Cutoff after 4 PM local → T+2 settlement
- Instant rails → Immediate processing

**Example Windows:**
| Bank | Timezone | Cutoff | Settlement |
|------|----------|--------|-----------|
| Bank of Africa | UTC+0 | 16:00 | T+1 |
| Ecobank | UTC+1 | 15:00 | T+1 |
| Wise | UTC | 18:00 | T+0 (instant) |

### 2. Priority System

**Four Priority Levels:**

| Priority | Level | Max Delay | Fee Multiplier | Rails |
|----------|-------|-----------|----------------|-------|
| **Instant** | 1 | 1 hour | 2.0x | instant, swift |
| **Express** | 5 | 4 hours | 1.5x | swift, instant, sepa |
| **Standard** | 10 | 24 hours | 1.0x | sepa, swift, local |
| **Economy** | 20 | 72 hours | 0.8x | local, sepa |

**Priority Selection Logic:**
```
IF amount > $50,000 → Express
IF merchant.kyc_level >= 3 → Standard
IF scheduled_for < 24h → Express
ELSE → Standard
```

### 3. Batch Planning Workflow

**1. Generate Plan:**
```bash
POST /api/scheduler/generate-plan

{
  "treasury_account_id": "uuid",
  "planned_for": "2025-01-14T16:00:00Z", // optional
  "max_items": 500,
  "priority": 10,
  "currency": "USD"
}

Response:
{
  "id": "plan-uuid",
  "plan_reference": "PLAN-20250114-ABC123",
  "item_count": 247,
  "estimated_total": 125430.50,
  "estimated_fees": {
    "molam_fee": 1881.46,
    "bank_fee": 61.75,
    "total": 1943.21
  },
  "sira_score": 0.92,
  "requires_approval": true,
  "status": "pending_approval"
}
```

**2. Approve Plan** (if required):
```bash
POST /api/scheduler/approve-plan

{
  "plan_id": "plan-uuid",
  "signature": "optional-otp-or-signature"
}

Response:
{
  "success": true,
  "is_complete": true,
  "approvals_count": 2,
  "required_count": 2
}
```

**3. Execute Plan:**
```bash
POST /api/scheduler/execute-plan

{
  "plan_id": "plan-uuid"
}

Response:
{
  "success": true,
  "batch_id": "batch-uuid"
}
```

### 4. Multi-Signature Approvals

**Approval Requirements:**
- Plans > $10,000 → 2 approvals required
- Plans > $100,000 → 3 approvals required
- SIRA score < 0.7 → Manual review required
- Risk flags present → Manual review required

**Required Roles:**
- `finance_ops` - Finance operations team
- `treasury_manager` - Treasury management
- `cfo` - Chief Financial Officer (for critical plans)

**Approval Flow:**
```
Plan Created (requires_approval: true)
    ↓
Actor 1 Approves (finance_ops)
    ↓ (1/2 approvals)
Actor 2 Approves (treasury_manager)
    ↓ (2/2 approvals)
Status: approved → Ready for execution
```

### 5. SIRA Integration

**Simulation Response:**
```javascript
{
  "items": [
    {
      "payout_id": "uuid",
      "suggested_connector": "wise",
      "estimated_fee": 1.50,
      "estimated_time_seconds": 300,
      "confidence": 0.89
    }
  ],
  "sira_score": 0.92, // Overall confidence
  "risk_flags": [],
  "recommendations": [
    "Batch size optimal for cost efficiency",
    "Estimated settlement in 30-60 minutes"
  ]
}
```

**SIRA Optimization Factors:**
- Cost minimization (connector fees)
- Speed requirements (priority-based)
- Reliability (connector success rates)
- Compliance (KYC/AML checks)

### 6. Quotas & Rate Limits

**Quota Types:**
```javascript
{
  scope_type: "treasury_account",
  scope_id: "uuid",
  period: "daily",
  max_amount: 1000000.00,
  max_count: 5000,
  current_amount: 245678.90,
  current_count: 1234
}
```

**Enforcement:**
- Checked during plan generation
- Plans exceeding quotas → rejected
- Quotas reset at period boundaries
- Real-time quota updates on execution

**Quota Scopes:**
- `tenant` - Per tenant limits
- `merchant` - Per merchant limits
- `bank` - Per bank profile limits
- `treasury_account` - Per treasury account limits

### 7. Scheduling History

**Immutable Audit Trail:**
```sql
SELECT * FROM scheduling_history
WHERE payout_id = 'uuid'
ORDER BY created_at DESC;

Results:
- allocated (to plan-123 at 2025-01-14 10:00)
- rescheduled (from 10:00 to 16:00, reason: cutoff_missed)
- executed (at 16:05)
```

---

## Database Schema

### Core Tables

**payout_windows** (Settlement windows)
```sql
- bank_profile_id UUID
- treasury_account_id UUID
- timezone TEXT
- cutoff_time TIME
- settlement_delay_days INTEGER
- rails JSONB
- is_instant BOOLEAN
```

**payout_batch_plans** (Plans with simulation)
```sql
- plan_reference TEXT UNIQUE
- planned_for TIMESTAMPTZ
- items JSONB (array of payouts)
- estimated_total NUMERIC
- estimated_fees JSONB
- sira_score NUMERIC
- requires_approval BOOLEAN
- status TEXT
```

**payout_schedules** (Payout → Plan mapping)
```sql
- payout_id UUID
- plan_id UUID
- scheduled_at TIMESTAMPTZ
- status TEXT
```

**approvals** (Multi-sig system)
```sql
- entity_type TEXT
- entity_id UUID
- required_count SMALLINT
- approvals JSONB
- status TEXT
```

**Full schema:** [`migrations/001_b93_scheduling_engine.sql`](migrations/001_b93_scheduling_engine.sql:1)

---

## API Reference

### Generate Plan

```bash
POST /api/scheduler/generate-plan

Body:
{
  "treasury_account_id": "uuid",
  "planned_for": "2025-01-14T16:00:00Z", // optional
  "max_items": 500,
  "priority": 10,
  "currency": "USD"
}

Response (201):
{
  "id": "uuid",
  "plan_reference": "PLAN-20250114-ABC123",
  "item_count": 247,
  "estimated_total": 125430.50,
  "estimated_fees": {
    "molam_fee": 1881.46,
    "bank_fee": 61.75,
    "total": 1943.21
  },
  "sira_score": 0.92,
  "requires_approval": true,
  "status": "pending_approval"
}
```

### Execute Plan

```bash
POST /api/scheduler/execute-plan

Body:
{
  "plan_id": "uuid"
}

Response (200):
{
  "success": true,
  "batch_id": "uuid"
}
```

### Approve Plan

```bash
POST /api/scheduler/approve-plan

Body:
{
  "plan_id": "uuid",
  "signature": "optional-signature"
}

Response (200):
{
  "success": true,
  "is_complete": true,
  "approvals_count": 2,
  "required_count": 2
}
```

### Reject Plan

```bash
POST /api/scheduler/reject-plan

Body:
{
  "plan_id": "uuid",
  "reason": "Amount exceeds daily limit"
}

Response (200):
{
  "success": true
}
```

### Cancel Plan

```bash
POST /api/scheduler/cancel-plan

Body:
{
  "plan_id": "uuid",
  "reason": "Market conditions changed"
}

Response (200):
{
  "success": true
}
```

### Get Plan Details

```bash
GET /api/scheduler/plan/:id

Response (200):
{
  "id": "uuid",
  "plan_reference": "PLAN-20250114-ABC123",
  "status": "pending_approval",
  "item_count": 247,
  "estimated_total": 125430.50,
  "approval_status": {
    "status": "pending",
    "approvals": [
      {
        "actor_id": "user-1",
        "actor_name": "John Doe",
        "role": "finance_ops",
        "approved_at": "2025-01-14T10:00:00Z"
      }
    ],
    "required_count": 2,
    "is_complete": false
  }
}
```

### List Plans

```bash
GET /api/scheduler/plans?status=pending_approval&limit=50

Response (200):
{
  "plans": [...],
  "count": 12,
  "limit": 50,
  "offset": 0
}
```

---

## Installation & Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Brique 92 (Payouts Engine)
- SIRA Service (optional, mock available)

### Installation

```bash
cd brique-93
npm install

# Setup environment
cp .env.example .env
# Edit .env

# Run migrations
psql -U postgres -d molam_connect -f migrations/001_b93_scheduling_engine.sql
```

### Running

```bash
# Development
npm run dev

# Production
npm start
```

---

## Integration with Brique 92

**Workflow:**
```
1. B92 creates payout (status: reserved)
2. B93 scheduler finds pending payouts
3. B93 generates plan with SIRA simulation
4. Ops approves plan (if required)
5. B93 executes → enqueues to B92
6. B92 processor picks up and sends
7. B92 reconciliation matches settlement
```

**Data Flow:**
- B93 reads from `payouts` table (status: reserved)
- B93 writes to `payout_schedules` and `payout_batch_plans`
- B93 execution updates `payout_queue` in B92
- B92 processor reads from `payout_queue`

---

## Monitoring & Observability

### Prometheus Metrics

```
# Scheduling metrics
molam_scheduler_plan_count{status}
molam_scheduler_plan_execution_latency_seconds
molam_scheduler_auto_approved_ratio

# Approval metrics
molam_scheduler_approval_latency_seconds
molam_scheduler_pending_approvals

# Quota metrics
molam_scheduler_quota_utilization{scope_type}
```

### Logging

```
[Scheduler] Generating plan for treasury uuid
[Scheduler] Found 247 pending payouts
[Scheduler] ✓ Created plan PLAN-20250114-ABC123 with 247 items
[Approval] Actor John Doe approved batch_plan:uuid (1/2)
[Scheduler] ✓ Plan PLAN-20250114-ABC123 executed as batch BATCH-20250114-XYZ
```

---

## Security & Compliance

### Security Features

- **Multi-Sig Approvals**: Configurable threshold
- **Role-Based Access**: Finance ops, treasury manager
- **Audit Trail**: Immutable scheduling history
- **Signature Support**: Optional OTP/digital signatures
- **Quota Enforcement**: Per-tenant rate limits

### Compliance

- **Separation of Duties**: Multi-sig prevents single-actor execution
- **Audit Trail**: Complete history for regulatory review
- **Approval Expiry**: Time-limited approvals
- **Rejection Reasons**: Documented decision-making

---

## Troubleshooting

### Common Issues

**1. Plan requires approval but no approvals configured:**
```sql
-- Check approval requirements
SELECT * FROM approvals
WHERE entity_type = 'batch_plan'
  AND entity_id = 'plan-uuid';

-- Lower threshold (if appropriate)
UPDATE payout_batch_plans
SET approval_threshold = 50000
WHERE id = 'plan-uuid';
```

**2. Plan stuck in pending_approval:**
```sql
-- Check approval status
SELECT is_approval_complete(id) as complete
FROM approvals
WHERE entity_id = 'plan-uuid';

-- Manually approve (emergency only)
UPDATE approvals
SET status = 'approved'
WHERE entity_id = 'plan-uuid';
```

**3. Quotas exceeded:**
```sql
-- Check current quota usage
SELECT * FROM payout_quotas
WHERE scope_type = 'treasury_account'
  AND scope_id = 'uuid';

-- Reset quota (new period)
UPDATE payout_quotas
SET current_amount = 0,
    current_count = 0,
    period_start = now()
WHERE scope_id = 'uuid';
```

---

## Roadmap

**Q1 2025:**
- [ ] ML-powered optimal batch sizing
- [ ] Dynamic priority adjustment
- [ ] Cross-currency netting

**Q2 2025:**
- [ ] Real-time window updates
- [ ] Predictive settlement times
- [ ] Advanced approval workflows

---

## Support

**Documentation:** https://docs.molam.com/brique-93
**Issues:** https://github.com/molam/molam-connect/issues
**Slack:** #brique-93-support

---

## License

Proprietary - Molam Connect Platform
© 2025 Molam. All rights reserved.
