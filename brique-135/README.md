# Brique 135 — Ops Multi-signature Approval Engine

## Overview
Production-ready multi-signature approval engine for sensitive Molam Pay operations with configurable policies, quorum voting, veto rights, TTL enforcement, and complete audit trails.

## Features
- **Configurable Policies**: Define approval rules by action type, amount thresholds, required roles
- **Quorum Voting**: Require N approvals from specific roles before execution
- **Veto Rights**: Designated roles can immediately reject requests
- **TTL & Expiry**: Automatic expiration with escalation notifications
- **Idempotent**: Safe retry with unique approver constraints
- **RBAC**: Role-based access (pay_admin, finance_ops, compliance, ops, auditor)
- **Immutable Audit Trail**: Complete history of all approval actions
- **Event-Driven**: Integrates with Event Bus for notifications
- **Prometheus Metrics**: Full observability
- **Multi-Platform**: REST API for Web, Mobile, Desktop integration

## Architecture

### Backend Service (approvals-service)
- **Port**: 8085
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL
- **Auth**: JWT (Molam ID RS256)
- **Metrics**: Prometheus
- **Logging**: Winston (structured JSON)

## Database Tables

### approval_policies
Configurable policies for different operation types
- `action_type` - Operation type (execute_plan, add_bank, large_payout, etc.)
- `min_amount`, `max_amount` - Threshold ranges
- `required_roles` - Array of roles that can approve
- `quorum` - Number of approvals needed
- `veto_roles` - Roles that can veto/reject
- `ttl_hours` - Expiration time
- `auto_approve` - JSONB conditions for auto-approval

### approval_requests
Individual approval requests linked to ops actions
- `ops_log_id` - Link to ops_actions_log (B134)
- `policy_id` - Applied policy
- `status` - pending | partially_approved | approved | rejected | expired | executed
- `payload` - Snapshot of action details
- `target` - JSONB target (payout_id, bank_profile_id, etc.)
- `expires_at` - Expiration timestamp

### approval_votes
Individual votes from approvers
- `request_id` - Link to approval_request
- `approver_id`, `approver_role` - Who voted
- `vote` - approve | reject | abstain
- `comment` - Optional justification
- **Unique constraint**: (request_id, approver_id) - one vote per approver

### approval_audit
Immutable audit log of all state transitions
- `request_id` - Linked request
- `actor_id` - Who performed action
- `action` - create_request | vote | auto_approve | veto | expire | execute
- `details` - JSONB context

## API Endpoints

### POST /api/approvals/requests
Create approval request

**Auth**: `pay_admin`, `ops`, or `finance_ops`

**Request:**
```json
{
  "ops_log_id": "uuid",
  "policy_id": "uuid",
  "payload": {
    "action": "execute_plan",
    "amount": 50000,
    "plan_id": "uuid"
  },
  "target": {
    "plan_id": "uuid"
  },
  "metadata": {}
}
```

**Response:**
```json
{
  "id": "uuid",
  "ops_log_id": "uuid",
  "policy_id": "uuid",
  "status": "pending",
  "payload": {...},
  "created_by": "uuid",
  "expires_at": "2025-01-22T10:00:00Z"
}
```

### GET /api/approvals/requests
List approval requests

**Auth**: `pay_admin`, `ops`, `finance_ops`, `compliance`, `auditor`

**Query Params:**
- `status` - Filter by status (default: pending)
- `limit` - Max results (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "ok": true,
  "requests": [
    {
      "id": "uuid",
      "status": "pending",
      "policy_name": "Execute Plan (Large)",
      "quorum": 2,
      "required_roles": ["pay_admin", "finance_ops"],
      "created_at": "2025-01-19T10:00:00Z",
      "expires_at": "2025-01-22T10:00:00Z"
    }
  ]
}
```

### GET /api/approvals/requests/:id
Get specific request with votes and audit trail

**Auth**: `pay_admin`, `ops`, `finance_ops`, `compliance`, `auditor`

**Response:**
```json
{
  "ok": true,
  "request": {...},
  "votes": [
    {
      "approver_id": "uuid",
      "approver_role": "pay_admin",
      "vote": "approve",
      "comment": "Looks good",
      "created_at": "2025-01-19T11:00:00Z"
    }
  ],
  "audit": [
    {
      "action": "create_request",
      "actor_id": "uuid",
      "details": {...},
      "created_at": "2025-01-19T10:00:00Z"
    }
  ]
}
```

### POST /api/approvals/requests/:id/vote
Submit vote (approve, reject, abstain)

**Auth**: `pay_admin`, `ops`, `finance_ops`, `compliance`

**Request:**
```json
{
  "vote": "approve",
  "comment": "Verified plan execution is safe"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Business Rules:**
- One vote per approver (idempotent upsert)
- Votes only allowed on `pending` or `partially_approved` requests
- Quorum evaluated after each vote
- Veto role rejection immediately marks request as `rejected`

### GET /api/approvals/policies
List approval policies

**Auth**: `pay_admin`, `ops`, `finance_ops`, `auditor`

### GET /api/approvals/audit/:request_id
Get audit trail for request

**Auth**: `pay_admin`, `auditor`, `compliance`

## Approval Flow

### 1. Request Creation
- Ops action handler (B134) creates approval request when policy matches
- Request links to `ops_actions_log` entry
- System computes expiry based on policy TTL
- Event published: `approval.request.created`

### 2. Voting Process
- Approvers submit votes via API or email link
- Each vote triggers quorum evaluation
- Unique constraint prevents duplicate votes from same approver

### 3. Quorum Evaluation
Runs after each vote:
- **Veto Check**: If veto role votes `reject` → immediate rejection
- **Quorum Check**: If `approve` votes >= quorum → approval
- **Partial**: If some approvals but < quorum → `partially_approved`

### 4. Approval & Execution
- When approved:
  - Update request status to `approved`
  - Update linked ops_actions_log to `accepted`
  - Publish event: `approval.request.approved`
  - B134 ops handler executes operation

### 5. Expiry (TTL)
- CronJob runs every 5 minutes
- Expires requests where `expires_at <= now()`
- Updates status to `expired`
- Marks linked ops_actions_log as `rejected`
- Publishes event: `approval.request.expired`

## Default Policies

### Execute Plan (Large)
- **Action**: `execute_plan`
- **Quorum**: 2
- **Roles**: pay_admin, finance_ops
- **Veto**: compliance
- **TTL**: 72 hours

### Add Bank Profile
- **Action**: `add_bank`
- **Quorum**: 2
- **Roles**: pay_admin, compliance
- **Veto**: compliance
- **TTL**: 168 hours (7 days)

### Large Payout
- **Action**: `large_payout`
- **Quorum**: 2
- **Roles**: pay_admin, finance_ops
- **Veto**: compliance
- **TTL**: 48 hours
- **Auto-approve**: amount < $100,000

### Emergency Reverse
- **Action**: `emergency_reverse`
- **Quorum**: 3
- **Roles**: pay_admin, compliance, finance_ops
- **Veto**: compliance
- **TTL**: 24 hours

### Freeze Global
- **Action**: `freeze_global`
- **Quorum**: 2
- **Roles**: pay_admin, finance_ops
- **TTL**: 12 hours

## Security

**Authentication:**
- RS256 JWT from Molam ID
- Role claims validated

**Authorization:**
- `pay_admin` - Full access
- `finance_ops` - Create requests, vote, view
- `compliance` - Vote (with veto power), view
- `ops` - Create requests, vote, view
- `auditor` - Read-only access to audit trails

**Network:**
- mTLS for Event Bus communication
- Rate limiting: 100 req/min per user

**Data Protection:**
- Immutable audit logs
- Unique constraints prevent vote manipulation
- All state transitions logged

## Deployment

### Docker
```bash
docker build -t approvals-service .
docker run -p 8085:8085 \
  -e DATABASE_URL=postgres://... \
  -e MOLAM_ID_JWT_PUBLIC=... \
  -e EVENT_BUS_URL=http://event-bus \
  approvals-service
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
```

**Required Secrets:**
```bash
kubectl create secret generic approvals-secrets \
  --from-literal=DATABASE_URL=postgres://... \
  --from-literal=MOLAM_ID_JWT_PUBLIC=... \
  -n molam-pay
```

**Required ConfigMap:**
```bash
kubectl create configmap approvals-config \
  --from-literal=EVENT_BUS_URL=http://event-bus.molam-pay.svc.cluster.local \
  --from-literal=CORS_ORIGIN=https://ops.molam.com \
  -n molam-pay
```

## Prometheus Metrics

```
molam_approvals_http_request_duration_seconds{method, route, status_code}
molam_approvals_requests_total{status}
molam_approvals_votes_total{vote}
```

## Event Bus Integration

### Published Events

**approval.request.created**
```json
{
  "type": "approval.request.created",
  "data": {
    "request_id": "uuid",
    "policy_id": "uuid",
    "required_roles": ["pay_admin", "finance_ops"],
    "ops_log_id": "uuid"
  }
}
```

**approval.request.approved**
```json
{
  "type": "approval.request.approved",
  "data": {
    "request_id": "uuid",
    "ops_log_id": "uuid"
  }
}
```

**approval.request.vetoed**
```json
{
  "type": "approval.request.vetoed",
  "data": {
    "request_id": "uuid",
    "ops_log_id": "uuid"
  }
}
```

**approval.request.expired**
```json
{
  "type": "approval.request.expired",
  "data": {
    "request_id": "uuid",
    "ops_log_id": "uuid",
    "created_by": "uuid"
  }
}
```

## Runbook

### Check Pending Approvals
```bash
curl https://api.molam.com/api/approvals/requests?status=pending \
  -H "Authorization: Bearer $TOKEN"
```

### Approve Request
```bash
curl -X POST https://api.molam.com/api/approvals/requests/$REQUEST_ID/vote \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vote":"approve","comment":"Verified"}'
```

### View Audit Trail
```bash
curl https://api.molam.com/api/approvals/audit/$REQUEST_ID \
  -H "Authorization: Bearer $TOKEN"
```

### Manually Expire Requests
```sql
-- Check expiring requests
SELECT id, expires_at, status
FROM approval_requests
WHERE status IN ('pending', 'partially_approved')
  AND expires_at <= now() + interval '24 hours';

-- Force expire
UPDATE approval_requests
SET status = 'expired'
WHERE id = 'request-uuid';
```

### Create Custom Policy
```sql
INSERT INTO approval_policies (name, action_type, required_roles, quorum, veto_roles, ttl_hours)
VALUES (
  'High Value Transfer',
  'large_transfer',
  ARRAY['pay_admin','finance_ops','compliance'],
  3,
  ARRAY['compliance','auditor'],
  48
);
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

## Monitoring

**Health Checks:**
- `/healthz` - Liveness probe
- `/readyz` - Readiness probe
- `/metrics` - Prometheus metrics

**Dashboards:**
- Grafana: Approvals Overview
- Alert if pending approvals >24h old
- Alert if expiry worker fails >3 times

**SLOs:**
- Create request latency P95 < 200ms
- Vote processing P95 < 100ms
- Quorum evaluation < 1s
- Error rate < 0.5%

## Version
**1.0.0** | Status: ✅ Production Ready

## Integration Points
- **Molam ID (B1)** - Authentication & RBAC
- **Ops Controls (B134)** - Links to ops_actions_log
- **Event Bus** - Approval notifications
- **Notification Service** - Email/SMS to approvers
- **Audit Service** - Central audit logs
