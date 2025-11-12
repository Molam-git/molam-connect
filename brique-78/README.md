# Brique 78 - Ops Approval Engine

**Version**: 1.0.0
**Date**: 2025-11-12
**Status**: ✅ **Backend Production Ready**

---

## 📋 Overview

**Brique 78 - Ops Approval Engine** is an industrial-grade multi-signature approval system for critical operational actions in the Molam Pay platform. It provides a secure, auditable workflow for ops teams to request, vote on, and execute sensitive operations with configurable approval requirements.

### Key Features

✅ **Multi-Signature Voting**: Configurable quorum-based approval (role-based, percentage, specific users)
✅ **Vote Types**: Approve, reject, abstain with optional comments and JWT signatures
✅ **Auto-Approval Policies**: Configurable policies that auto-apply approval requirements based on action criteria
✅ **Escalation on Timeout**: Actions that exceed timeout are escalated to higher roles or expired
✅ **Auto-Execute**: Approved actions can be automatically executed without manual trigger
✅ **Immutable Audit Trail**: Complete audit log of all votes, executions, and status changes
✅ **Idempotency**: All operations support idempotency keys to prevent duplicates
✅ **RBAC Integration**: Role-based access control with Molam ID JWT authentication

---

## 🎯 Use Cases

### 1. High-Value Payout Approval

**Scenario**: Payout > 1M XOF requires approval from 2 finance_ops members.

```typescript
// Create action
const action = await createOpsAction({
  origin: 'ops_ui',
  action_type: 'PAUSE_PAYOUT',
  params: { merchant_id: 'merchant-123', amount: 1500000, duration: '1h' },
  created_by: 'ops-user-1',
});

// Finance ops members vote
await voteOnAction(action.id, 'finance-user-1', ['finance_ops'], 'approve');
await voteOnAction(action.id, 'finance-user-2', ['finance_ops'], 'approve');

// Action is now approved, execute it
await executeAction(action.id, 'ops-user-1');
```

### 2. Emergency Merchant Freeze

**Scenario**: Fraud alert triggers merchant freeze requiring 2 pay_admin approvals.

```typescript
// SIRA creates action
const action = await createOpsAction({
  idempotency_key: 'freeze-merchant-123-fraud-2025-01-12',
  origin: 'sira',
  action_type: 'FREEZE_MERCHANT',
  params: { merchant_id: 'merchant-123', reason: 'fraud_score_high' },
  created_by: 'sira-system',
});

// Pay admins vote
await voteOnAction(action.id, 'admin-1', ['pay_admin'], 'approve');
await voteOnAction(action.id, 'admin-2', ['pay_admin'], 'approve');

// Auto-execute if policy allows
// (cron job picks it up and executes)
```

### 3. Low-Risk Action with Auto-Execute

**Scenario**: Release hold on transaction (low risk, single approval, auto-execute).

```typescript
// Create action with auto_execute=true
const action = await createOpsAction({
  origin: 'ops_ui',
  action_type: 'RELEASE_HOLD',
  params: { transaction_id: 'txn-456' },
  auto_execute: true,
  created_by: 'ops-user-1',
});

// Single approval
await voteOnAction(action.id, 'ops-admin-1', ['ops_admin'], 'approve');

// Action is approved and will be auto-executed by cron job
```

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Ops Approval Engine                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  API Routes  │   │   Service    │   │  PostgreSQL  │    │
│  │              │──▶│              │──▶│              │    │
│  │  - Actions   │   │  - Voting    │   │  - Tables    │    │
│  │  - Votes     │   │  - Quorum    │   │  - Functions │    │
│  │  - Policies  │   │  - Execution │   │  - Triggers  │    │
│  └──────────────┘   └──────────────┘   └──────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Scheduled Jobs (Cron)                    │   │
│  │  - Escalate expired actions (every 5-10 min)         │   │
│  │  - Auto-execute approved actions (every 1-2 min)     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Workflow

```
1. Create Action
   ├─ User/System creates action via API
   ├─ Idempotency check (if key provided)
   ├─ Apply matching policy (auto)
   └─ Audit: "created"

2. Vote Phase
   ├─ Approvers vote (approve/reject/abstain)
   ├─ Duplicate vote = upsert (last vote wins)
   ├─ Audit: "voted"
   └─ Auto-evaluate quorum after each vote

3. Quorum Evaluation (Trigger)
   ├─ Count votes by type
   ├─ Check quorum satisfied (based on type)
   ├─ Check approval ratio >= required_ratio
   └─ Update status: approved / rejected / pending

4. Execution
   ├─ Manual execute (via API)
   │  OR
   ├─ Auto-execute (cron job if auto_execute=true)
   ├─ Status: executing → executed / failed
   └─ Audit: "executing", "executed"/"failed"

5. Timeout/Escalation (Cron)
   ├─ Find actions past expires_at
   ├─ IF escalation_role set: escalate
   ├─ ELSE: mark as expired
   └─ Audit: "escalated"/"expired"
```

---

## 📦 Installation

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- TypeScript >= 5

### Setup

1. **Run SQL Schema**

```bash
psql -U postgres -d molam_connect -f sql/007_approval_engine_schema.sql
```

2. **Install Dependencies**

```bash
npm install express pg express-validator
npm install --save-dev @types/express @types/pg
```

3. **Environment Variables**

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=molam_connect
export DB_USER=postgres
export DB_PASSWORD=your_password
```

4. **Start Service**

```typescript
import express from 'express';
import approvalRoutes from './routes/approvalRoutes';

const app = express();
app.use(express.json());
app.use('/api/ops', approvalRoutes);

app.listen(3000, () => {
  console.log('Approval Engine running on port 3000');
});
```

5. **Setup Cron Jobs**

```typescript
import cron from 'node-cron';
import { runEscalationJob, runAutoExecuteJob } from './services/approvalService';

// Escalate expired actions every 10 minutes
cron.schedule('*/10 * * * *', runEscalationJob);

// Auto-execute approved actions every 2 minutes
cron.schedule('*/2 * * * *', runAutoExecuteJob);
```

---

## 📚 API Reference

See [API_GUIDE.md](./API_GUIDE.md) for complete API documentation.

### Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ops/actions` | POST | Create action |
| `/api/ops/actions/:id/vote` | POST | Vote on action |
| `/api/ops/actions/:id/execute` | POST | Execute action |
| `/api/ops/actions` | GET | List pending actions |
| `/api/ops/actions/:id` | GET | Get action details |
| `/api/ops/actions/:id/audit` | GET | Get audit trail |
| `/api/ops/policies` | POST | Create policy |
| `/api/ops/policies` | GET | List policies |
| `/api/ops/policies/:id` | PUT | Update policy |
| `/api/ops/stats` | GET | Get statistics |

---

## 🔧 Configuration

### Quorum Types

#### 1. Role-Based Quorum

Requires N votes from users with specific role.

```json
{
  "type": "role",
  "value": {
    "role": "finance_ops",
    "min_votes": 2
  }
}
```

#### 2. Percentage-Based Quorum

Requires X% of eligible users to vote.

```json
{
  "type": "percentage",
  "value": {
    "percentage": 0.6,
    "pool": ["user-1", "user-2", "user-3", "user-4", "user-5"]
  }
}
```

#### 3. Specific Users Quorum

Requires all specific users to vote.

```json
{
  "type": "specific_users",
  "value": {
    "users": ["ceo-user-id", "cfo-user-id"]
  }
}
```

### Approval Policies

Policies auto-apply approval requirements based on action criteria.

```typescript
await createApprovalPolicy({
  name: 'High Value Payout',
  criteria: {
    action_type: 'PAUSE_PAYOUT',
    'params.amount': { $gte: 1000000 }
  },
  policy: {
    required_quorum: {
      type: 'role',
      value: { role: 'finance_ops', min_votes: 2 }
    },
    required_ratio: 0.60,
    timeout_seconds: 3600,
    escalation_role: 'ops_admin',
    auto_execute: false
  },
  priority: 100,
  enabled: true,
  created_by: 'admin-user-id'
});
```

---

## 🔒 Security

### Authentication

All endpoints require JWT authentication via Molam ID.

```typescript
Authorization: Bearer <molam_id_jwt>
```

### RBAC Roles

| Role | Permissions |
|------|-------------|
| `ops_admin` | Create actions, vote, execute, manage policies |
| `finance_ops` | Create actions, vote, execute |
| `pay_admin` | Create actions, vote |
| `merchant_admin` | View only |

### Audit Trail

All operations are logged immutably in `ops_approval_audit`:

- Action created
- Vote recorded
- Status changed (approved, rejected)
- Execution started
- Execution completed/failed
- Escalated/expired

---

## 📊 Monitoring

### Key Metrics

- **Approval Latency**: Time from creation to approval
- **Execution Success Rate**: % of actions executed successfully
- **Vote Participation**: % of eligible voters who voted
- **Timeout Rate**: % of actions that expired or escalated

### Views

```sql
-- Pending actions summary
SELECT * FROM pending_actions_summary;

-- Approval performance stats
SELECT * FROM approval_performance_stats;
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { createOpsAction, voteOnAction, executeAction } from './services/approvalService';

describe('Approval Service', () => {
  it('should create action with idempotency', async () => {
    const action1 = await createOpsAction({
      idempotency_key: 'test-key-123',
      origin: 'ops_ui',
      action_type: 'RELEASE_HOLD',
      params: { transaction_id: 'txn-123' },
      created_by: 'user-1'
    });

    const action2 = await createOpsAction({
      idempotency_key: 'test-key-123',
      origin: 'ops_ui',
      action_type: 'RELEASE_HOLD',
      params: { transaction_id: 'txn-123' },
      created_by: 'user-1'
    });

    expect(action1.id).toBe(action2.id);
  });

  it('should approve action when quorum met', async () => {
    const action = await createOpsAction({
      origin: 'ops_ui',
      action_type: 'PAUSE_PAYOUT',
      params: { merchant_id: 'merch-1' },
      required_quorum: { type: 'role', value: { role: 'finance_ops', min_votes: 2 } },
      created_by: 'user-1'
    });

    await voteOnAction(action.id, 'user-2', ['finance_ops'], 'approve');
    await voteOnAction(action.id, 'user-3', ['finance_ops'], 'approve');

    const updated = await getActionWithVotes(action.id);
    expect(updated.status).toBe('approved');
  });
});
```

---

## 🚀 Roadmap

### Phase 2 (Q1 2026)

- [ ] React UI for Ops Console
- [ ] Real-time notifications (WebSocket) for pending actions
- [ ] Slack/Teams integration for vote requests
- [ ] Advanced policy engine with AI recommendations
- [ ] Rollback actions for reversible operations
- [ ] Bulk action approval

---

## 📝 License

Proprietary - Molam Pay © 2025

---

## 👥 Team

**Backend**: TypeScript + PostgreSQL
**Product**: Ops workflow design
**Security**: RBAC and audit compliance

---

**Brique 78 v1.0 - Ops Approval Engine**

Status: ✅ **Production Ready**
Lines of Code: **2,100+**
Key Features: **Multi-sig voting, Auto-policies, Escalation, Audit**

Built with ❤️ by Molam Team
2025-11-12
