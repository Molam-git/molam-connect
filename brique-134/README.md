# Brique 134 — Unified Molam Pay Widgets & Ops Controls

## Overview
Production-ready library of UI widgets and ops control actions for Molam Pay Super App with SIRA integration, multi-platform support, and complete audit trails.

## Features
- **Apple-like UI Widgets**: Minimalist, accessible components for Web, Mobile, Desktop
- **Ops Control Actions**: Freeze payouts, generate plans, retry operations, bank controls
- **SIRA Integration**: AI-driven plan generation and suggestions
- **Multi-Signature Approval**: Critical operations require multiple approvals
- **Audit Trail**: Immutable logging of all ops actions
- **Idempotent**: Safe retry with idempotency keys
- **RBAC**: Role-based access (pay_admin, finance_ops, ops)
- **Real-time KPIs**: Live metrics via WebSockets or polling
- **Feature Flags**: Gradual rollout with treasury controls
- **Prometheus Metrics**: Full observability
- **Multi-Platform**: React (Web/PWA), React Native (Mobile), Electron (Desktop)
- **i18n**: Localized via Molam ID lang claim

## Architecture

### Backend Service (ops-controls-service)
- **Port**: 8084
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL
- **Auth**: JWT (Molam ID RS256)
- **Metrics**: Prometheus
- **Logging**: Winston (structured JSON)

### Frontend Widgets
- **Web**: React + Tailwind CSS
- **Mobile**: React Native + StyleSheet
- **Desktop**: Electron + React
- **Shared**: Common API SDK

## Database Tables

### ops_actions_log
Immutable audit log of all ops control actions
- `actor_id`, `actor_role` - Who performed action
- `action_type` - freeze_payouts, generate_plan, retry_payout, etc.
- `target` (JSONB) - Action target (bank_id, payout_id, etc.)
- `idempotency_key` - Prevent duplicates
- `status` - requested, accepted, rejected, executed, failed
- `details` (JSONB) - Results, errors, context

### treasury_controls
Feature flags and freeze states
- `key` - Control identifier (freeze_global, freeze_bank_xxx)
- `value` (JSONB) - Control value and metadata
- `enabled` - Whether active
- `expires_at` - Auto-expiry for temporary controls

### sira_plans
SIRA-generated operational plans
- `plan_type` - routing_optimization, float_rebalance, risk_mitigation
- `plan_data` (JSONB) - Full plan from SIRA
- `status` - pending, approved, rejected, executed
- `approval_required` - Multi-sig needed
- `approvals` (JSONB) - Approval tracking

### widget_states
User-specific widget configurations
- `user_id`, `widget_type`
- `state` (JSONB) - Widget state
- `preferences` (JSONB) - User preferences

### multi_sig_approvals
Multi-signature approval tracking
- `action_reference` - Link to ops_actions_log or sira_plans
- `required_approvals` - Number needed
- `approvers` (JSONB) - Approval signatures

## API Endpoints

### POST /api/ops/freeze-payouts
Freeze all or specific bank payouts

**Auth**: `pay_admin` or `finance_ops`

**Headers:**
```
Authorization: Bearer <JWT>
Idempotency-Key: <unique-key>
```

**Request:**
```json
{
  "scope": "global",
  "reason": "Emergency maintenance"
}
```
OR
```json
{
  "scope": { "bank_profile_id": "uuid" },
  "reason": "Bank outage"
}
```

**Response:**
```json
{
  "ok": true,
  "log": {
    "id": "uuid",
    "action_type": "freeze_payouts",
    "status": "accepted",
    "created_at": "2025-01-18T10:00:00Z"
  }
}
```

### POST /api/ops/unfreeze-payouts
Remove payout freeze

**Auth**: `pay_admin` or `finance_ops`

### POST /api/ops/generate-plan
Generate SIRA operational plan

**Auth**: `pay_admin` or `ops`

**Request:**
```json
{
  "plan_params": {
    "type": "routing_optimization",
    "timeframe": "24h",
    "constraints": {
      "max_cost": 10000,
      "min_success_rate": 0.99
    }
  }
}
```

**Response:**
```json
{
  "ok": true,
  "log": { "id": "uuid", "status": "accepted" },
  "plan": {
    "id": "plan-uuid",
    "summary": "Optimize routing for 1,234 pending payouts",
    "steps": [
      {
        "action": "reroute_payouts",
        "from_bank": "bank-a",
        "to_bank": "bank-b",
        "count": 567,
        "estimated_savings": 234.50
      }
    ],
    "total_amount": 1234567.89,
    "approval_required": true
  }
}
```

### POST /api/ops/execute-plan
Execute approved SIRA plan

**Auth**: `pay_admin` or `finance_ops`

**Request:**
```json
{
  "plan_id": "plan-uuid",
  "approval_token": "multi-sig-token"
}
```

**Multi-Sig Required if:** `plan.total_amount > threshold`

### POST /api/ops/retry-payout
Retry failed payout

**Auth**: `pay_admin` or `ops`

**Request:**
```json
{
  "payout_id": "uuid"
}
```

**Business Rules:**
- Only allowed if `payout.status IN ('failed', 'processing')`
- Creates retry event in payout queue
- Audit logged

### POST /api/ops/mark-dispute
Mark payout as disputed

**Auth**: `pay_admin` or `finance_ops`

### POST /api/ops/pause-bank
Pause specific bank connector

**Auth**: `pay_admin`

### POST /api/ops/resume-bank
Resume paused bank connector

**Auth**: `pay_admin`

### GET /api/ops/actions
List ops actions (audit query)

**Query Params:**
- `actor_id` - Filter by user
- `action_type` - Filter by action
- `status` - Filter by status
- `from`, `to` - Date range
- `limit`, `offset` - Pagination

### GET /api/ops/controls
List active treasury controls

### GET /api/ops/plans
List SIRA plans

## UI Widgets

### 1. Balance Widget
Display current treasury balance and float

**Props:**
- `currency` - Currency code (default: USD)
- `refreshInterval` - Auto-refresh ms (default: 30000)

**Web (React):**
```tsx
<BalanceWidget currency="XOF" refreshInterval={30000} />
```

**Mobile (React Native):**
```tsx
<BalanceWidget currency="USD" />
```

**Features:**
- Live balance from `/api/metrics/summary`
- Auto-refresh with interval
- Skeleton loading state
- Error handling

### 2. Freeze Button
Emergency freeze of payouts

**Props:**
- `scope` - 'global' or bank_profile_id
- `onSuccess` - Callback

**Web:**
```tsx
<FreezeButton scope="global" onSuccess={() => alert('Frozen')} />
```

**Features:**
- Idempotency key generation
- Loading state
- Confirmation dialog
- RBAC check (disabled if no permission)
- Audit logging

### 3. Generate Plan Panel
SIRA plan generation interface

**Props:**
- `planType` - 'routing_optimization', 'float_rebalance', 'risk_mitigation'
- `onPlanGenerated` - Callback with plan

**Features:**
- Form for plan parameters
- Progress indicator during generation
- Plan preview with steps
- Approval button (if multi-sig required)
- Execution button

### 4. Payout Summary Widget
Real-time payout statistics

**Features:**
- Pending count
- Sent count (24h)
- Settled amount
- Failed count
- Auto-refresh

### 5. Bank Health Widget
Bank connector status grid

**Features:**
- Green/Red/Yellow status indicators
- Last health check timestamp
- Circuit breaker state
- Click to view details

### 6. SIRA Suggestions Bubble
AI-driven recommendations

**Features:**
- Floating badge with suggestion count
- Expandable panel
- Accept/Decline actions
- Confidence score display

### 7. Quick Action Menu
Dropdown of common ops actions

**Actions:**
- Retry failed payouts (batch)
- Regenerate settlement report
- Force reconciliation
- Export audit logs

## Multi-Signature Approval Flow

**Threshold Rules:**
- Amount >$10,000 → 2 approvals required
- Amount >$100,000 → 3 approvals required
- Freeze global → 2 approvals
- Execute plan with >1000 payouts → 2 approvals

**Process:**
1. User initiates action → Creates `multi_sig_approvals` record
2. Email sent to eligible approvers
3. Approvers review and sign
4. Once `current_approvals >= required_approvals` → Action executes
5. Audit log records all approvers

**API:**
```
POST /api/ops/approve/:approval_id
GET /api/ops/pending-approvals
```

## SIRA Integration

**Plan Generation:**
- HTTP POST to `$SIRA_URL/api/plan`
- Timeout: 5s
- Retry: 2 attempts with exponential backoff
- Fallback: Local heuristics

**Plan Types:**
1. **Routing Optimization**: Find cheapest bank routes
2. **Float Rebalance**: Move funds between accounts
3. **Risk Mitigation**: Pause risky banks, diversify exposure

**Plan Execution:**
- Emits events to event bus
- Workers process steps asynchronously
- Progress tracked in `sira_plans.details`

## Idempotency

**All state-changing ops require `Idempotency-Key` header:**
```
Idempotency-Key: freeze-2025-01-18-abc123xyz
```

**Implementation:**
- Check `ops_actions_log.idempotency_key` before insert
- Return existing record if duplicate
- Safe retry for network failures

## Audit Trail

**Every ops action logs:**
- Actor (user_id + role)
- Action type
- Target (bank, payout, etc.)
- Result (success/failure)
- IP address + User agent
- Timestamp

**Immutable:**
- No updates to `ops_actions_log` (status changes via new rows)
- Retention: Indefinite
- Export: CSV/JSON via API

**Query Examples:**
```sql
-- All freeze actions in last 24h
SELECT * FROM ops_actions_log
WHERE action_type = 'freeze_payouts'
  AND created_at > now() - interval '24 hours';

-- Failed retry attempts by user
SELECT * FROM ops_actions_log
WHERE actor_id = 'uuid'
  AND action_type = 'retry_payout'
  AND status = 'failed';
```

## Prometheus Metrics

```
molam_ops_action_requests_total{action, status}
molam_ops_action_duration_seconds{action}
molam_ops_freeze_active{scope}
molam_ops_plan_executions_total{plan_type, status}
molam_ops_multi_sig_pending_count
```

## Security

**Authentication:**
- RS256 JWT from Molam ID
- Role claims validated

**Authorization:**
- `pay_admin` - Full access
- `finance_ops` - Freeze, plans, approvals
- `ops` - Read, retry, generate plans

**Network:**
- mTLS for SIRA communication
- IP allowlist for ops endpoints
- Rate limiting: 100 req/min per user

**Data Protection:**
- Sensitive plan data encrypted at rest
- Audit logs immutable
- Multi-sig for critical operations

## Deployment

### Docker
```bash
docker build -t ops-controls-service .
docker run -p 8084:8084 \
  -e DATABASE_URL=postgres://... \
  -e MOLAM_ID_JWT_PUBLIC=... \
  -e SIRA_URL=http://sira-service \
  ops-controls-service
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/rbac.yaml
```

**Required Secrets:**
```bash
kubectl create secret generic ops-controls-secrets \
  --from-literal=DATABASE_URL=postgres://... \
  --from-literal=MOLAM_ID_JWT_PUBLIC=... \
  --from-literal=EVENT_BUS_TOKEN=... \
  -n molam-pay
```

## Runbook

### Emergency Freeze All Payouts
```bash
curl -X POST https://api.molam.com/api/ops/freeze-payouts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: emergency-freeze-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"scope":"global","reason":"Emergency incident"}'
```

### Unfreeze After Incident
```bash
curl -X POST https://api.molam.com/api/ops/unfreeze-payouts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: unfreeze-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"scope":"global"}'
```

### Query Recent Ops Actions
```bash
curl https://api.molam.com/api/ops/actions?limit=50 \
  -H "Authorization: Bearer $TOKEN"
```

### Manually Execute Stuck Plan
```sql
-- Check plan status
SELECT * FROM sira_plans WHERE id = 'plan-uuid';

-- Force execute if approvals met
UPDATE sira_plans SET status = 'approved' WHERE id = 'plan-uuid';

-- Trigger execution (via event bus)
INSERT INTO ops_actions_log(actor_id, actor_role, action_type, target, status)
VALUES ('system', 'admin', 'execute_plan', '{"plan_id":"plan-uuid"}'::jsonb, 'requested');
```

### Rollback Failed Plan
```sql
UPDATE sira_plans SET status = 'cancelled' WHERE id = 'plan-uuid';
-- Manual compensation via ops runbook
```

## Testing

**Unit Tests:**
```bash
npm test
```

**Integration Tests:**
```bash
npm run test:integration
```

**Load Tests:**
```bash
# Freeze endpoint
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: test-$(uuidgen)" \
  https://api.molam.com/api/ops/freeze-payouts
```

## Monitoring

**Health Checks:**
- `/healthz` - Liveness probe
- `/readyz` - Readiness probe
- `/metrics` - Prometheus metrics

**Dashboards:**
- Grafana: Ops Controls Overview
- Alert if freeze active >1 hour
- Alert if pending multi-sig >10

## Version
**1.0.0** | Status: ✅ Production Ready

## Integration Points
- **Molam ID (B1)** - Authentication & RBAC
- **SIRA** - Plan generation & suggestions
- **Treasury (B34)** - Control states & freeze flags
- **Payouts (B132)** - Retry operations
- **Event Bus** - Action notifications
- **Audit Service** - Central audit logs
- **Webhook Engine** - Ops event notifications
