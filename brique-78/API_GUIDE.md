# Brique 78 - API Guide

**Version**: 1.0.0
**Base URL**: `/api/ops`
**Authentication**: Bearer JWT (Molam ID)

---

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [Actions API](#actions-api)
3. [Policies API](#policies-api)
4. [Statistics & History API](#statistics--history-api)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)

---

## 🔐 Authentication

All endpoints require JWT authentication via Molam ID.

### Request Header

```http
Authorization: Bearer <molam_id_jwt>
```

### User Context

The JWT must contain:
```json
{
  "user_id": "uuid",
  "type": "ops_user",
  "roles": ["ops_admin", "finance_ops"]
}
```

---

## 🎯 Actions API

### 1. Create Action

**POST** `/api/ops/actions`

Create new ops action with optional idempotency key.

#### Request Body

```json
{
  "idempotency_key": "freeze-merchant-123-2025-01-12",
  "origin": "ops_ui",
  "action_type": "FREEZE_MERCHANT",
  "params": {
    "merchant_id": "merchant-123",
    "reason": "fraud_suspected",
    "duration": "24h"
  },
  "target_tenant_type": "merchant",
  "target_tenant_id": "merchant-123",
  "required_quorum": {
    "type": "role",
    "value": {
      "role": "pay_admin",
      "min_votes": 2
    }
  },
  "required_ratio": 0.60,
  "timeout_seconds": 3600,
  "escalation_role": "ops_admin",
  "auto_execute": false
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idempotency_key` | string | No | Unique key for idempotent creation |
| `origin` | enum | Yes | One of: `sira`, `system`, `ops_ui`, `module`, `alert` |
| `action_type` | string | Yes | Type of action (see Action Types below) |
| `params` | object | Yes | Action-specific parameters |
| `target_tenant_type` | string | No | Tenant type (merchant, agent, bank) |
| `target_tenant_id` | UUID | No | Tenant ID |
| `required_quorum` | object | No | Quorum config (see Quorum Types below) |
| `required_ratio` | float | No | Approval ratio (0-1), default: 0.60 |
| `timeout_seconds` | integer | No | Timeout in seconds, default: 86400 (24h) |
| `escalation_role` | string | No | Role to escalate to on timeout |
| `auto_execute` | boolean | No | Auto-execute when approved, default: false |

#### Action Types

| Action Type | Description | Params |
|-------------|-------------|--------|
| `PAUSE_PAYOUT` | Pause payouts for merchant | `merchant_id`, `duration` |
| `FREEZE_MERCHANT` | Freeze merchant account | `merchant_id`, `reason`, `duration` |
| `ADJUST_FLOAT` | Adjust agent float | `agent_id`, `amount`, `adjustment` |
| `ROUTE_PAYOUT_OVERRIDE` | Override payout routing | `bank_profile_id` |
| `REQUEUE_DLQ` | Requeue dead letter queue items | `max_items` |
| `UPDATE_RISK_THRESHOLD` | Update risk scoring threshold | `threshold` |
| `MANUAL_REVERSAL` | Manual transaction reversal | `transaction_id` |
| `EMERGENCY_CIRCUIT_BREAK` | Emergency circuit breaker | `service` |
| `ADJUST_RATE_LIMIT` | Adjust rate limits | `limit` |
| `RELEASE_HOLD` | Release hold on transaction | `transaction_id` |
| `FORCE_RECONCILE` | Force reconciliation | `batch_id` |

#### Quorum Types

##### Role-Based Quorum
```json
{
  "type": "role",
  "value": {
    "role": "finance_ops",
    "min_votes": 2
  }
}
```

##### Percentage-Based Quorum
```json
{
  "type": "percentage",
  "value": {
    "percentage": 0.6,
    "pool": ["user-1", "user-2", "user-3", "user-4", "user-5"]
  }
}
```

##### Specific Users Quorum
```json
{
  "type": "specific_users",
  "value": {
    "users": ["ceo-user-id", "cfo-user-id"]
  }
}
```

#### Response

```json
{
  "success": true,
  "action": {
    "id": "action-uuid",
    "idempotency_key": "freeze-merchant-123-2025-01-12",
    "origin": "ops_ui",
    "action_type": "FREEZE_MERCHANT",
    "params": {
      "merchant_id": "merchant-123",
      "reason": "fraud_suspected"
    },
    "status": "requested",
    "required_quorum": {...},
    "required_ratio": 0.60,
    "timeout_seconds": 3600,
    "expires_at": "2025-01-12T15:00:00Z",
    "created_by": "user-uuid",
    "created_at": "2025-01-12T14:00:00Z",
    "updated_at": "2025-01-12T14:00:00Z"
  },
  "message": "Action created successfully"
}
```

#### Status Codes

- `201 Created`: Action created successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing/invalid JWT
- `403 Forbidden`: Insufficient permissions
- `500 Internal Server Error`: Server error

---

### 2. Vote on Action

**POST** `/api/ops/actions/:id/vote`

Vote on pending action (approve, reject, abstain).

#### Request Body

```json
{
  "vote": "approve",
  "comment": "Reviewed fraud evidence, approve freeze",
  "signed_jwt": "optional-signed-jwt-for-non-repudiation"
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vote` | enum | Yes | One of: `approve`, `reject`, `abstain` |
| `comment` | string | No | Optional comment explaining vote |
| `signed_jwt` | string | No | Optional signed JWT for non-repudiation |

#### Response

```json
{
  "success": true,
  "approval": {
    "id": "approval-uuid",
    "ops_action_id": "action-uuid",
    "voter_id": "user-uuid",
    "voter_roles": ["pay_admin"],
    "vote": "approve",
    "comment": "Reviewed fraud evidence, approve freeze",
    "created_at": "2025-01-12T14:05:00Z"
  },
  "action": {
    "id": "action-uuid",
    "status": "approved",
    "votes": [
      {
        "id": "approval-1",
        "voter_id": "user-1",
        "vote": "approve",
        "created_at": "2025-01-12T14:03:00Z"
      },
      {
        "id": "approval-2",
        "voter_id": "user-2",
        "vote": "approve",
        "created_at": "2025-01-12T14:05:00Z"
      }
    ],
    "votes_approve": 2,
    "votes_reject": 0,
    "votes_abstain": 0,
    "votes_total": 2,
    "approval_ratio": 1.0,
    "quorum_satisfied": true
  },
  "message": "Vote recorded: approve"
}
```

#### Status Codes

- `200 OK`: Vote recorded
- `400 Bad Request`: Invalid vote or action not votable
- `401 Unauthorized`: Missing/invalid JWT
- `404 Not Found`: Action not found
- `500 Internal Server Error`: Server error

---

### 3. Execute Action

**POST** `/api/ops/actions/:id/execute`

Execute approved action manually.

**Permissions**: `ops_admin`, `finance_ops`

#### Response

```json
{
  "success": true,
  "result": {
    "frozen": true,
    "merchant_id": "merchant-123",
    "reason": "fraud_suspected"
  },
  "message": "Action executed successfully"
}
```

#### Failure Response

```json
{
  "success": false,
  "error": "Merchant service unavailable",
  "message": "Action execution failed"
}
```

#### Status Codes

- `200 OK`: Action executed successfully
- `400 Bad Request`: Action not approved
- `401 Unauthorized`: Missing/invalid JWT
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Action not found
- `500 Internal Server Error`: Execution failed

---

### 4. List Pending Actions

**GET** `/api/ops/actions`

List pending actions for user's roles.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Max results (1-100) |
| `offset` | integer | 0 | Pagination offset |

#### Example Request

```http
GET /api/ops/actions?limit=20&offset=0
Authorization: Bearer <jwt>
```

#### Response

```json
{
  "success": true,
  "actions": [
    {
      "id": "action-uuid",
      "action_type": "FREEZE_MERCHANT",
      "status": "pending_approval",
      "params": {...},
      "votes_approve": 1,
      "votes_reject": 0,
      "votes_total": 1,
      "approval_ratio": 1.0,
      "quorum_satisfied": false,
      "created_at": "2025-01-12T14:00:00Z",
      "expires_at": "2025-01-12T15:00:00Z"
    }
  ],
  "count": 1
}
```

---

### 5. Get Action Details

**GET** `/api/ops/actions/:id`

Get action details with all votes.

#### Response

```json
{
  "success": true,
  "action": {
    "id": "action-uuid",
    "origin": "ops_ui",
    "action_type": "FREEZE_MERCHANT",
    "params": {...},
    "status": "approved",
    "required_quorum": {...},
    "required_ratio": 0.60,
    "votes": [
      {
        "id": "approval-1",
        "voter_id": "user-1",
        "voter_roles": ["pay_admin"],
        "vote": "approve",
        "comment": "Approved",
        "created_at": "2025-01-12T14:03:00Z"
      }
    ],
    "votes_approve": 2,
    "votes_reject": 0,
    "votes_abstain": 0,
    "approval_ratio": 1.0,
    "quorum_satisfied": true,
    "created_at": "2025-01-12T14:00:00Z",
    "expires_at": "2025-01-12T15:00:00Z"
  }
}
```

---

### 6. Get Audit Trail

**GET** `/api/ops/actions/:id/audit`

Get complete audit trail for action.

#### Response

```json
{
  "success": true,
  "audit": [
    {
      "id": "audit-1",
      "ops_action_id": "action-uuid",
      "action": "created",
      "snapshot": {
        "action_type": "FREEZE_MERCHANT",
        "params": {...}
      },
      "actor": "user-uuid",
      "created_at": "2025-01-12T14:00:00Z"
    },
    {
      "id": "audit-2",
      "ops_action_id": "action-uuid",
      "action": "voted",
      "snapshot": {
        "vote": "approve",
        "voter_id": "user-1"
      },
      "actor": "user-1",
      "created_at": "2025-01-12T14:03:00Z"
    },
    {
      "id": "audit-3",
      "ops_action_id": "action-uuid",
      "action": "approved",
      "snapshot": {
        "ratio": 1.0,
        "votes_approve": 2
      },
      "actor": null,
      "created_at": "2025-01-12T14:05:00Z"
    },
    {
      "id": "audit-4",
      "ops_action_id": "action-uuid",
      "action": "executing",
      "snapshot": {},
      "actor": "user-uuid",
      "created_at": "2025-01-12T14:06:00Z"
    },
    {
      "id": "audit-5",
      "ops_action_id": "action-uuid",
      "action": "executed",
      "snapshot": {
        "result": {...}
      },
      "actor": "user-uuid",
      "created_at": "2025-01-12T14:06:30Z"
    }
  ],
  "count": 5
}
```

---

## 📜 Policies API

### 1. Create Policy

**POST** `/api/ops/policies`

Create approval policy.

**Permissions**: `ops_admin`

#### Request Body

```json
{
  "name": "High Value Payout",
  "criteria": {
    "action_type": "PAUSE_PAYOUT",
    "params.amount": {
      "$gte": 1000000
    }
  },
  "policy": {
    "required_quorum": {
      "type": "role",
      "value": {
        "role": "finance_ops",
        "min_votes": 2
      }
    },
    "required_ratio": 0.60,
    "timeout_seconds": 3600,
    "escalation_role": "ops_admin",
    "auto_execute": false
  },
  "priority": 100,
  "enabled": true
}
```

#### Response

```json
{
  "success": true,
  "policy": {
    "id": "policy-uuid",
    "name": "High Value Payout",
    "criteria": {...},
    "policy": {...},
    "priority": 100,
    "enabled": true,
    "created_by": "user-uuid",
    "created_at": "2025-01-12T14:00:00Z",
    "updated_at": "2025-01-12T14:00:00Z"
  },
  "message": "Policy created successfully"
}
```

---

### 2. List Policies

**GET** `/api/ops/policies`

List all policies.

**Permissions**: `ops_admin`, `finance_ops`, `pay_admin`

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled_only` | boolean | false | Only return enabled policies |

#### Response

```json
{
  "success": true,
  "policies": [
    {
      "id": "policy-1",
      "name": "High Value Payout",
      "criteria": {...},
      "policy": {...},
      "priority": 100,
      "enabled": true
    }
  ],
  "count": 1
}
```

---

### 3. Get Policy

**GET** `/api/ops/policies/:id`

Get policy by ID.

**Permissions**: `ops_admin`, `finance_ops`, `pay_admin`

---

### 4. Update Policy

**PUT** `/api/ops/policies/:id`

Update policy.

**Permissions**: `ops_admin`

#### Request Body

```json
{
  "name": "High Value Payout (Updated)",
  "enabled": false
}
```

---

### 5. Delete Policy

**DELETE** `/api/ops/policies/:id`

Delete policy.

**Permissions**: `ops_admin`

---

## 📊 Statistics & History API

### 1. Get Approval Stats

**GET** `/api/ops/stats`

Get approval performance statistics.

**Permissions**: `ops_admin`, `finance_ops`, `pay_admin`

#### Response

```json
{
  "success": true,
  "stats": [
    {
      "action_type": "FREEZE_MERCHANT",
      "total_actions": 15,
      "approved_count": 12,
      "rejected_count": 2,
      "expired_count": 1,
      "avg_approval_time_seconds": 320,
      "approval_rate": 0.80
    }
  ]
}
```

---

### 2. Get Pending Summary

**GET** `/api/ops/pending-summary`

Get pending actions summary.

#### Response

```json
{
  "success": true,
  "summary": [
    {
      "action_type": "FREEZE_MERCHANT",
      "status": "pending_approval",
      "count": 3,
      "oldest_action_at": "2025-01-12T10:00:00Z"
    }
  ]
}
```

---

### 3. Get User Action History

**GET** `/api/ops/users/:userId/actions`

Get action history for user.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Max results (1-100) |
| `offset` | integer | 0 | Pagination offset |

---

### 4. Get User Vote History

**GET** `/api/ops/users/:userId/votes`

Get vote history for user.

---

## ❌ Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "errors": [
    {
      "field": "vote",
      "message": "Invalid enum value. Expected 'approve' | 'reject' | 'abstain'"
    }
  ]
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid JWT |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Idempotency key conflict |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## 🚦 Rate Limiting

Rate limits apply per user:

| Endpoint | Limit |
|----------|-------|
| Create Action | 100 req/hour |
| Vote | 500 req/hour |
| Execute | 50 req/hour |
| List/Get | 1000 req/hour |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641988800
```

---

## 📝 Examples

### Complete Approval Workflow

```bash
# 1. Create action
curl -X POST http://localhost:3000/api/ops/actions \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "freeze-merchant-123-2025-01-12",
    "origin": "ops_ui",
    "action_type": "FREEZE_MERCHANT",
    "params": {
      "merchant_id": "merchant-123",
      "reason": "fraud_suspected"
    }
  }'

# 2. Vote (approver 1)
curl -X POST http://localhost:3000/api/ops/actions/<action-id>/vote \
  -H "Authorization: Bearer <jwt-approver-1>" \
  -H "Content-Type: application/json" \
  -d '{
    "vote": "approve",
    "comment": "Reviewed, approve"
  }'

# 3. Vote (approver 2)
curl -X POST http://localhost:3000/api/ops/actions/<action-id>/vote \
  -H "Authorization: Bearer <jwt-approver-2>" \
  -H "Content-Type: application/json" \
  -d '{
    "vote": "approve"
  }'

# 4. Execute (now approved)
curl -X POST http://localhost:3000/api/ops/actions/<action-id>/execute \
  -H "Authorization: Bearer <jwt-ops-admin>"

# 5. Get audit trail
curl -X GET http://localhost:3000/api/ops/actions/<action-id>/audit \
  -H "Authorization: Bearer <jwt>"
```

---

**API Guide v1.0**
**Brique 78 - Ops Approval Engine**

For support: ops-support@molam.com
