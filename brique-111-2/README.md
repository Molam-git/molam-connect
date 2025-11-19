# Brique 111-2 — AI Config Advisor (SIRA)

**SIRA-powered automatic configuration recommendations based on telemetry and performance data**

## Overview

Brique 111-2 provides an intelligent configuration advisor that:
- **Analyzes** telemetry from plugins, webhooks, and merchant infrastructure
- **Proposes** configuration improvements (timeouts, retry policies, memory limits, etc.)
- **Classifies** recommendations by impact (revenue protection, fraud reduction, performance)
- **Executes** changes automatically (when policy allows) or requires approval
- **Learns** from feedback to improve future recommendations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SIRA AI Engine                          │
│  (Analyzes telemetry → Generates recommendations)           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ POST /api/ai-recommendations
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Recommendation Service                          │
│  • Idempotency checks                                       │
│  • Policy validation                                        │
│  • Auto-apply logic                                         │
│  • Snapshot creation                                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├──────► Requires approval? ──────┐
                  │                                  │
                  │                                  ▼
                  │                    ┌──────────────────────┐
                  │                    │  Multi-Sig Approval  │
                  │                    │  (Ops Dashboard)     │
                  │                    └──────────┬───────────┘
                  │                               │
                  ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Recommendation Executor                         │
│  1. Validate params                                         │
│  2. Create snapshot                                         │
│  3. Apply configuration                                     │
│  4. Health check                                            │
│  5. Rollback if unhealthy                                   │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables

#### `config_recommendations`
Stores all AI-generated configuration recommendations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| merchant_id | UUID | Target merchant (nullable for global) |
| target_type | TEXT | `plugin`, `webhook`, `checkout`, `treasury`, `merchant_setting` |
| target_id | UUID | ID of the target entity |
| action | TEXT | `suggest_config`, `apply_patch`, `change_timeout`, `scale_worker` |
| params | JSONB | Proposed configuration changes |
| evidence | JSONB | Telemetry data supporting the recommendation |
| confidence | NUMERIC(5,4) | SIRA confidence score (0.0-1.0) |
| priority | TEXT | `low`, `medium`, `high`, `critical` |
| status | TEXT | `proposed`, `approved`, `applied`, `rejected`, `rolled_back` |
| created_by | TEXT | `sira` or user ID |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**Indexes:**
- merchant_id, status, priority, target_type, created_at

#### `config_recommendation_audit`
Immutable audit trail for all recommendation actions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| recommendation_id | UUID | FK to config_recommendations |
| actor | TEXT | User ID or 'sira'/'system' |
| action_taken | TEXT | `approve`, `reject`, `apply`, `rollback`, `auto_apply` |
| details | JSONB | Action metadata |
| created_at | TIMESTAMPTZ | Action timestamp |

#### `config_snapshots`
Configuration snapshots for rollback capability.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| target_type | TEXT | Type of configuration |
| target_id | UUID | Target entity ID |
| snapshot | JSONB | Configuration snapshot |
| created_by | TEXT | Who created the snapshot |
| created_at | TIMESTAMPTZ | Snapshot timestamp |

### Helper Functions

#### `requires_multisig_approval(recommendation_id UUID) → BOOLEAN`
Determines if a recommendation requires multi-signature approval based on:
- Priority level (critical always requires)
- Target type (treasury, pricing changes require)

#### `count_approvals(recommendation_id UUID) → INTEGER`
Counts distinct approvers for a recommendation.

#### `can_auto_apply(recommendation_id UUID, min_confidence, max_priority) → BOOLEAN`
Determines if a recommendation can be automatically applied based on:
- Confidence threshold (default ≥0.95)
- Priority level (default ≤low)
- Multi-sig requirements

## API Endpoints

### Create Recommendation (Internal - SIRA Only)
```http
POST /api/ai-recommendations
Content-Type: application/json

{
  "merchantId": "uuid",
  "targetType": "webhook",
  "targetId": "uuid",
  "action": "suggest_config",
  "params": {
    "timeout": 120000,
    "retry_config": {
      "max_attempts": 5,
      "backoff": "exponential"
    }
  },
  "evidence": {
    "webhook_fail_rate": 0.42,
    "avg_response_time": 85000,
    "sample_errors": [...]
  },
  "confidence": 0.95,
  "priority": "high"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "status": "proposed",
  "can_auto_apply": true,
  ...
}
```

**Idempotency:** Uses evidence hash to prevent duplicates.

### List Recommendations
```http
GET /api/ai-recommendations?status=proposed&priority=high&merchantId=uuid
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "merchant_id": "uuid",
    "target_type": "webhook",
    "action": "suggest_config",
    "confidence": 0.95,
    "priority": "high",
    "status": "proposed",
    "approval_count": 1,
    "requires_multisig": true,
    "can_auto_apply": false,
    ...
  }
]
```

### Get Recommendation Details
```http
GET /api/ai-recommendations/:id
```

### Approve Recommendation
```http
POST /api/ai-recommendations/:id/approve
Content-Type: application/json

{
  "note": "Reviewed telemetry, looks good"
}
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "approval_count": 2,
  "status": "approved"
}
```

**Multi-Sig:** Multiple approvals from different users required for critical changes.

### Apply Recommendation
```http
POST /api/ai-recommendations/:id/apply
```

**Process:**
1. Validate policy requirements (approvals, permissions)
2. Create configuration snapshot
3. Apply configuration changes
4. Wait for health check (60s timeout)
5. Auto-rollback if health check fails
6. Record audit trail

**Response:** `200 OK`
```json
{
  "ok": true,
  "details": "applied",
  "snapshot_id": "uuid"
}
```

### Rollback Recommendation
```http
POST /api/ai-recommendations/:id/rollback
Content-Type: application/json

{
  "reason": "Causing performance degradation"
}
```

**Response:** `200 OK`
```json
{
  "ok": true,
  "snapshot_id": "uuid"
}
```

### Reject Recommendation
```http
POST /api/ai-recommendations/:id/reject
Content-Type: application/json

{
  "reason": "Not applicable for this merchant"
}
```

### Get Evidence
```http
GET /api/ai-recommendations/:id/evidence
```

**Response:** `200 OK` - Returns full telemetry evidence used for recommendation.

### Get Audit Trail
```http
GET /api/ai-recommendations/:id/audit
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "recommendation_id": "uuid",
    "actor": "user_123",
    "action_taken": "approve",
    "details": { "note": "..." },
    "created_at": "2025-01-15T10:30:00Z"
  },
  ...
]
```

### Get Metrics
```http
GET /api/ai-recommendations/stats/metrics
```

**Response:** Aggregated metrics by target_type, action, priority.

## Operations Policy

The system behavior is controlled by the `ops_policy` merchant setting:

```json
{
  "require_multisig_for_major": true,
  "auto_apply_enabled": true,
  "auto_apply_max_priority": "low",
  "auto_apply_min_confidence": 0.95,
  "min_approvals": 2
}
```

### Auto-Apply Logic

A recommendation is auto-applied if ALL conditions are met:
- ✅ `auto_apply_enabled = true`
- ✅ Priority ≤ `auto_apply_max_priority`
- ✅ Confidence ≥ `auto_apply_min_confidence`
- ✅ Does NOT require multi-sig
- ✅ NOT a pricing/tax/fee change

**Safety Rules:**
- ❌ NEVER auto-apply changes to pricing, taxes, or fees
- ❌ NEVER auto-apply critical priority
- ❌ NEVER auto-apply without snapshot
- ✅ ALWAYS perform health check after apply
- ✅ ALWAYS auto-rollback if health check fails

## Ops Dashboard

### Access
```
http://localhost:3000/ops/ai-advisor
```

### Features

#### Recommendations List
- Filter by status, priority, target type
- Real-time refresh
- Color-coded priority indicators
- Approval counts and requirements

#### Recommendation Details
- Full evidence view
- Audit trail
- Configuration diff
- Apply/Approve/Reject actions

#### Actions
- **Approve** - Add approval signature
- **Apply** - Execute configuration change
- **Reject** - Decline recommendation
- **Rollback** - Restore previous configuration
- **View Evidence** - See telemetry data

## Example Use Cases

### Use Case 1: Webhook Timeout Optimization

**Scenario:** SIRA detects 40% webhook failure rate for merchant M.

**Evidence:**
```json
{
  "webhook_fail_rate": 0.42,
  "avg_response_time_ms": 85000,
  "timeout_ms": 30000,
  "failed_count_24h": 120,
  "sample_errors": ["timeout", "timeout", "connection_reset"]
}
```

**Recommendation:**
```json
{
  "action": "suggest_config",
  "params": {
    "timeout_ms": 120000,
    "retry_config": {
      "max_attempts": 5,
      "backoff": "exponential",
      "backoff_multiplier": 2
    }
  },
  "confidence": 0.96,
  "priority": "high"
}
```

**Outcome:**
1. Ops receives notification
2. Reviews evidence in dashboard
3. Approves recommendation
4. System applies configuration
5. Webhook success rate improves to 95%

### Use Case 2: Plugin Memory Limit

**Scenario:** Plugin experiencing OOM errors.

**Evidence:**
```json
{
  "oom_errors_24h": 15,
  "avg_memory_usage_mb": 480,
  "current_limit_mb": 512,
  "p95_memory_mb": 495
}
```

**Recommendation:**
```json
{
  "action": "suggest_config",
  "params": {
    "memory_limit_mb": 1024
  },
  "confidence": 0.92,
  "priority": "medium"
}
```

**Outcome:** Auto-applied (if policy allows), OOM errors eliminated.

## Testing

### Unit Tests

```bash
npm test brique-111-2/tests/executor.test.js
```

### Integration Tests

```javascript
test("SIRA recommendation lifecycle", async () => {
  // 1. Create recommendation
  const rec = await createRecommendation({
    targetType: 'webhook',
    action: 'suggest_config',
    confidence: 0.95,
    priority: 'low'
  });

  // 2. Should auto-apply
  expect(rec.status).toBe('applied');

  // 3. Verify snapshot created
  const snapshot = await getLatestSnapshot(rec.target_type, rec.target_id);
  expect(snapshot).toBeDefined();
});

test("Multi-sig approval workflow", async () => {
  // 1. Create critical recommendation
  const rec = await createRecommendation({
    priority: 'critical'
  });

  // 2. First approval
  await approve(rec.id, 'user1');
  let updated = await getRecommendation(rec.id);
  expect(updated.status).toBe('proposed'); // Still needs more

  // 3. Second approval
  await approve(rec.id, 'user2');
  updated = await getRecommendation(rec.id);
  expect(updated.status).toBe('approved'); // Now approved

  // 4. Apply
  const result = await apply(rec.id);
  expect(result.ok).toBe(true);
});
```

## Monitoring & Metrics

### Prometheus Metrics

```
# Recommendations created
sira_recommendations_created_total{action,priority} counter

# Apply success/failure
sira_recommendation_apply_success_total counter
sira_recommendation_apply_failed_total counter

# Rollbacks
sira_recommendation_rollback_total counter

# Confidence distribution
sira_recommendation_confidence_histogram histogram
```

### Alerts

```yaml
- alert: HighRecommendationRollbackRate
  expr: rate(sira_recommendation_rollback_total[24h]) > 0.02
  annotations:
    summary: "Auto-patch rollback rate > 2% in 24h"

- alert: HealthCheckFailureAfterApply
  expr: sira_recommendation_apply_failed_total{reason="health_check_failed"} > 0
  annotations:
    summary: "Automatic rollback triggered due to health check failure"
```

## Security & Compliance

### Authentication
- SIRA service authenticated via mTLS + service identity claim
- Ops users require `pay_admin` or `ops` role
- Multi-sig for critical changes

### Encryption
- Config snapshots encrypted at rest
- Evidence data encrypted
- Config diffs signed using HSM

### Audit
- Immutable audit trail in `config_recommendation_audit`
- All actions logged with actor, timestamp, details
- Snapshots retained for compliance

### Restrictions
- ❌ NO auto-change to pricing/tax/fees without `finance_ops` approval
- ❌ NO bypassing multi-sig for critical changes
- ❌ NO deletion of audit records

## Deployment

### Prerequisites
- PostgreSQL 13+
- Node.js 18+
- Redis (for event publishing)

### Setup

1. **Run migrations:**
```bash
.\setup-all-schemas.ps1
```

2. **Configure ops policy:**
```sql
INSERT INTO merchant_settings (merchant_id, key, value)
VALUES (NULL, 'ops_policy', '{
  "require_multisig_for_major": true,
  "auto_apply_enabled": true,
  "auto_apply_max_priority": "low",
  "auto_apply_min_confidence": 0.95,
  "min_approvals": 2
}');
```

3. **Start server:**
```bash
npm start
```

4. **Access dashboard:**
```
http://localhost:3000/ops/ai-advisor
```

### Rollout Strategy

**Phase 1: Observe Only (Week 1-2)**
- `auto_apply_enabled = false`
- SIRA generates recommendations
- Ops reviews and manually applies
- Measure accuracy

**Phase 2: Low-Risk Auto-Apply (Week 3-4)**
- `auto_apply_enabled = true`
- `auto_apply_max_priority = "low"`
- `auto_apply_min_confidence = 0.95`
- Monitor rollback rate

**Phase 3: Gradual Ramp-Up (Month 2+)**
- Increase priority threshold if rollback rate < 1%
- Lower confidence threshold incrementally
- Expand to more target types

## SIRA Integration

### Training Loop

1. **Recommendation Applied** → Label with success/failure
2. **Collect Outcome** → Revenue impact, error reduction, latency improvement
3. **Append to Training Set** → Store features + label
4. **Retrain Nightly** → Update model with CI checks
5. **Deploy with Canary** → Test on subset before full rollout

### Model Features

**Input Features:**
- Last 72h telemetry (errors, latency, throughput)
- Merchant risk score
- Bank SLA compliance
- Geographic outages
- Time-of-day patterns
- Version CVE severity

**Output:**
- Recommended action
- Confidence score (0-1)
- Expected impact
- SHAP explanations (why?)

## Support

### Common Issues

**Issue:** Recommendation not auto-applying
- Check `can_auto_apply` field in response
- Verify ops policy settings
- Check if requires multi-sig

**Issue:** Health check failing after apply
- System auto-rolls back (safe)
- Review evidence to understand why config caused issues
- Adjust recommendation parameters

**Issue:** Rollback not working
- Verify snapshot exists
- Check target entity still exists
- Review error logs

### Files

```
brique-111-2/
├── migrations/
│   └── 001_ai_config_advisor.sql       # Database schema
├── src/
│   ├── services/
│   │   └── recommendationExecutor.js   # Core execution logic
│   ├── routes/
│   │   └── ai-recommendations.js       # API endpoints
│   └── components/
│       └── AIAdvisorPanel.tsx          # Ops dashboard UI
├── tests/
│   ├── executor.test.js
│   └── integration.test.js
└── README.md
```

## License

Proprietary - Molam Connect © 2025
