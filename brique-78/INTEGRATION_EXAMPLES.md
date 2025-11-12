# Brique 78 - Integration Examples

**Version**: 1.0.0
**Date**: 2025-11-12

This document provides integration examples for using the Ops Approval Engine with other Molam Pay components.

---

## 📋 Table of Contents

1. [Integration with Brique 77.1 (Alerts)](#integration-with-brique-771-alerts)
2. [Integration with SIRA](#integration-with-sira)
3. [Integration with Dashboard](#integration-with-dashboard)
4. [Custom Action Types](#custom-action-types)
5. [Cron Job Setup](#cron-job-setup)

---

## 🚨 Integration with Brique 77.1 (Alerts)

### Use Case: Auto-Remediation with Approval

When an alert is triggered and auto-remediation is configured, create an ops action for approval before executing.

### Example: Alert Triggers Merchant Freeze

```typescript
import { processMetricEvent } from './brique-77/services/alertService';
import { createOpsAction } from './brique-78/services/approvalService';

// In alertService.ts - remediation flow
async function triggerRemediationFlow(alert: Alert): Promise<void> {
  const policy = await getPolicyForAlertType(alert.alert_type);

  if (!policy || !policy.enabled) return;

  // Call SIRA for recommendation
  const siraRec = await callSiraRecommendation(alert);

  // If high confidence, create action for approval
  if (siraRec.confidence >= policy.auto_threshold) {
    const action = await createOpsAction({
      idempotency_key: `alert-${alert.id}-remediation`,
      origin: 'alert',
      action_type: policy.auto_action.action_type,
      params: {
        ...policy.auto_action.params,
        alert_id: alert.id,
        sira_confidence: siraRec.confidence,
        sira_explanation: siraRec.explanation
      },
      target_tenant_type: alert.tenant_type,
      target_tenant_id: alert.tenant_id,
      auto_execute: !policy.require_multi_sig, // Auto-execute if no multi-sig required
      created_by: 'sira-system'
    });

    console.log(`[Alert] Created action ${action.id} for alert ${alert.id}`);

    // Record in alert_decisions
    await recordDecision(alert.id, {
      actor: 'system',
      action: 'create_ops_action',
      details: { ops_action_id: action.id, sira_rec }
    });

    // Update alert with remediation action
    await pool.query(
      `UPDATE alerts SET remedied_by_action_id = $1 WHERE id = $2`,
      [action.id, alert.id]
    );
  }
}
```

### Example: Alert API - Manual Remediation Trigger

```typescript
// In brique-77/routes/alertRoutes.ts
router.post(
  '/alerts/:alertId/remediate',
  authenticateUser,
  requireRole(['ops_admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { alertId } = req.params;

    // Get alert
    const alert = await getAlert(alertId);

    // Create ops action
    const action = await createOpsAction({
      idempotency_key: `alert-${alertId}-manual-remediation`,
      origin: 'ops_ui',
      action_type: 'FREEZE_MERCHANT',
      params: {
        merchant_id: alert.tenant_id,
        reason: alert.alert_type,
        alert_id: alertId
      },
      target_tenant_type: alert.tenant_type,
      target_tenant_id: alert.tenant_id,
      created_by: req.user!.id
    });

    res.json({
      success: true,
      message: 'Remediation action created',
      action_id: action.id
    });
  }
);
```

---

## 🤖 Integration with SIRA

### Use Case: SIRA Recommends Ops Action

SIRA analyzes metrics and recommends an action. System creates ops action for approval.

### Example: SIRA Recommends Payout Route Override

```typescript
import { createOpsAction } from './brique-78/services/approvalService';

// In SIRA recommendation service
async function processSiraRecommendation(
  recommendation: SiraRecommendation
): Promise<void> {
  // If recommendation confidence is high enough
  if (recommendation.confidence >= 0.90) {
    // Create ops action
    const action = await createOpsAction({
      idempotency_key: `sira-rec-${recommendation.id}`,
      origin: 'sira',
      action_type: recommendation.recommendation_type, // e.g., 'ROUTE_PAYOUT_OVERRIDE'
      params: {
        ...recommendation.params,
        sira_recommendation_id: recommendation.id,
        sira_confidence: recommendation.confidence,
        sira_explanation: recommendation.explanation
      },
      target_tenant_type: recommendation.tenant_type,
      target_tenant_id: recommendation.tenant_id,
      auto_execute: true, // Auto-execute if approved (low risk)
      created_by: 'sira-system'
    });

    // Update SIRA recommendation with ops action ID
    await pool.query(
      `UPDATE sira_dash_recommendations
       SET ops_action_id = $1, status = 'pending_approval'
       WHERE id = $2`,
      [action.id, recommendation.id]
    );

    console.log(`[SIRA] Created action ${action.id} for recommendation ${recommendation.id}`);
  }
}
```

### Example: Dashboard API - Apply SIRA Recommendation

```typescript
// In brique-77/routes/dashboardRoutes.ts
router.post(
  '/dashboard/sira/recommendations/:id/apply',
  authenticateUser,
  requireRole(['ops_admin', 'finance_ops']),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Get recommendation
    const rec = await getSiraRecommendation(id);

    // Create ops action
    const action = await createOpsAction({
      idempotency_key: `sira-rec-${id}-apply`,
      origin: 'ops_ui',
      action_type: rec.recommendation_type,
      params: rec.params,
      target_tenant_type: rec.tenant_type,
      target_tenant_id: rec.tenant_id,
      created_by: req.user!.id
    });

    res.json({
      success: true,
      message: 'Action created for SIRA recommendation',
      action_id: action.id
    });
  }
);
```

---

## 📊 Integration with Dashboard

### Use Case: Dashboard Ops Console

Display pending actions and allow approval directly from dashboard.

### Example: Dashboard Component Data Fetching

```typescript
// In dashboard UI service
import { getPendingActions, getActionWithVotes } from './brique-78/services/approvalService';

export async function getDashboardOpsData(
  userRoles: string[]
): Promise<DashboardOpsData> {
  // Get pending actions for user's roles
  const pendingActions = await getPendingActions(userRoles, 10, 0);

  // Get user's vote history
  const userVotes = await getUserVoteHistory(userId, 5, 0);

  // Get stats
  const stats = await getApprovalStats();

  return {
    pending_actions: pendingActions,
    user_votes: userVotes,
    stats: stats
  };
}
```

### Example: Dashboard Widget - Pending Approvals

```typescript
// In brique-77/services/dashboardService.ts
async function getWidgetData(widget: DashboardWidget): Promise<any> {
  if (widget.widget_type === 'pending_approvals_list') {
    const actions = await getPendingActions(
      widget.config.roles || ['ops_admin'],
      widget.config.limit || 10,
      0
    );

    return {
      actions: actions.map(a => ({
        id: a.id,
        action_type: a.action_type,
        status: a.status,
        votes_approve: a.votes_approve,
        votes_reject: a.votes_reject,
        quorum_satisfied: a.quorum_satisfied,
        created_at: a.created_at,
        expires_at: a.expires_at
      }))
    };
  }
}
```

---

## 🔧 Custom Action Types

### Use Case: Extend Approval Engine with Custom Action Types

Add new action types for domain-specific operations.

### Example: Add ADJUST_MERCHANT_FEE Action Type

#### 1. Extend Action Execution Logic

```typescript
// In brique-78/services/approvalService.ts - executeActionLogic()
async function executeActionLogic(action: OpsAction): Promise<any> {
  switch (action.action_type) {
    // ... existing cases ...

    case 'ADJUST_MERCHANT_FEE':
      // Integrate with merchant service
      const result = await merchantService.updateFee({
        merchant_id: action.params.merchant_id,
        fee_percentage: action.params.fee_percentage,
        effective_date: action.params.effective_date
      });

      return {
        updated: true,
        merchant_id: action.params.merchant_id,
        old_fee: result.old_fee,
        new_fee: action.params.fee_percentage
      };

    default:
      throw new Error(`Unknown action type: ${action.action_type}`);
  }
}
```

#### 2. Create Policy for New Action Type

```typescript
await createApprovalPolicy({
  name: 'Merchant Fee Adjustment',
  criteria: {
    action_type: 'ADJUST_MERCHANT_FEE',
    'params.fee_percentage': { $gte: 3.0 } // High fee requires approval
  },
  policy: {
    required_quorum: {
      type: 'role',
      value: { role: 'finance_ops', min_votes: 2 }
    },
    required_ratio: 0.75,
    timeout_seconds: 7200,
    escalation_role: 'cfo',
    auto_execute: false
  },
  priority: 90,
  enabled: true,
  created_by: 'admin-user-id'
});
```

#### 3. Use in Application

```typescript
// In merchant admin UI
const action = await createOpsAction({
  origin: 'ops_ui',
  action_type: 'ADJUST_MERCHANT_FEE',
  params: {
    merchant_id: 'merchant-123',
    fee_percentage: 3.5,
    effective_date: '2025-02-01'
  },
  created_by: req.user.id
});
```

---

## ⏰ Cron Job Setup

### Use Case: Setup Scheduled Jobs for Escalation and Auto-Execute

### Example: Node-Cron Setup

```typescript
// In app.ts or jobs.ts
import cron from 'node-cron';
import { runEscalationJob, runAutoExecuteJob } from './brique-78/services/approvalService';

// Escalate expired actions every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('[Cron] Running escalation job...');
  await runEscalationJob();
});

// Auto-execute approved actions every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  console.log('[Cron] Running auto-execute job...');
  await runAutoExecuteJob();
});

console.log('[Cron] Approval engine jobs scheduled');
```

### Example: BullMQ Setup (Production)

```typescript
import { Queue, Worker } from 'bullmq';
import { escalateExpiredActions, autoExecuteApprovedActions } from './brique-78/services/approvalService';

const escalationQueue = new Queue('approval-escalation', {
  connection: { host: 'redis-host', port: 6379 }
});

const autoExecuteQueue = new Queue('approval-auto-execute', {
  connection: { host: 'redis-host', port: 6379 }
});

// Schedule escalation job (every 10 min)
await escalationQueue.add(
  'escalate',
  {},
  { repeat: { pattern: '*/10 * * * *' } }
);

// Schedule auto-execute job (every 2 min)
await autoExecuteQueue.add(
  'auto-execute',
  {},
  { repeat: { pattern: '*/2 * * * *' } }
);

// Workers
new Worker('approval-escalation', async (job) => {
  console.log('[Worker] Running escalation...');
  const result = await escalateExpiredActions();
  console.log(`[Worker] Escalated: ${result.escalated}, Expired: ${result.expired}`);
}, { connection: { host: 'redis-host', port: 6379 } });

new Worker('approval-auto-execute', async (job) => {
  console.log('[Worker] Running auto-execute...');
  const result = await autoExecuteApprovedActions();
  console.log(`[Worker] Executed: ${result.executed}, Failed: ${result.failed}`);
}, { connection: { host: 'redis-host', port: 6379 } });
```

---

## 🔄 Complete Integration Example

### Scenario: Float Low Alert → SIRA Recommendation → Ops Approval → Execution

```typescript
// 1. Alert detects float low
const alert = await createAlert({
  alert_type: 'float_low',
  tenant_type: 'agent',
  tenant_id: 'agent-123',
  severity: 'critical',
  metric: {
    metric: 'float_available',
    value: 500000,
    threshold: 1000000
  }
});

// 2. SIRA analyzes and recommends
const siraRec = await callSiraRecommendation(alert);
// Returns: { action: 'ADJUST_FLOAT', confidence: 0.95, params: { adjustment: 'top_up', amount: 1000000 } }

// 3. System creates ops action
const action = await createOpsAction({
  idempotency_key: `alert-${alert.id}-sira-rec`,
  origin: 'sira',
  action_type: 'ADJUST_FLOAT',
  params: {
    agent_id: 'agent-123',
    adjustment: 'top_up',
    amount: 1000000,
    alert_id: alert.id,
    sira_confidence: siraRec.confidence
  },
  target_tenant_type: 'agent',
  target_tenant_id: 'agent-123',
  auto_execute: false, // Requires approval for high value
  created_by: 'sira-system'
});

// 4. Policy is auto-applied (via trigger)
// Requires 2 finance_ops approvals

// 5. Finance ops members vote
await voteOnAction(action.id, 'finance-user-1', ['finance_ops'], 'approve', 'Reviewed float levels, approve top-up');
await voteOnAction(action.id, 'finance-user-2', ['finance_ops'], 'approve');

// 6. Action is auto-approved (via trigger)
// status = 'approved'

// 7. Ops admin executes (or auto-execute if configured)
const result = await executeAction(action.id, 'ops-admin-1');

// 8. Float service executes adjustment
// agent-123 float is topped up by 1,000,000 XOF

// 9. Alert is marked as remediated
await pool.query(
  `UPDATE alerts SET status = 'auto_remediated', remedied_by_action_id = $1 WHERE id = $2`,
  [action.id, alert.id]
);

// 10. Complete audit trail is available
const audit = await getAuditTrail(action.id);
// Shows: created → voted (x2) → approved → executing → executed
```

---

## 📚 Best Practices

### 1. Always Use Idempotency Keys

```typescript
// Good
const action = await createOpsAction({
  idempotency_key: `alert-${alert.id}-remediation-${Date.now()}`,
  // ...
});

// Bad (no idempotency)
const action = await createOpsAction({
  // ...
});
```

### 2. Set Appropriate Timeouts

```typescript
// Low-risk actions: short timeout
timeout_seconds: 1800 // 30 min

// High-risk actions: longer timeout
timeout_seconds: 7200 // 2 hours

// Critical actions: very long timeout
timeout_seconds: 86400 // 24 hours
```

### 3. Configure Escalation

```typescript
// Always set escalation_role for critical actions
escalation_role: 'cfo' // Escalate to CFO if ops_admin doesn't approve in time
```

### 4. Use Auto-Execute Wisely

```typescript
// Low-risk, routine actions
auto_execute: true

// High-risk, critical actions
auto_execute: false
```

### 5. Log Action Results

```typescript
const result = await executeAction(action.id, userId);
if (result.success) {
  logger.info(`Action ${action.id} executed successfully`, result.result);
} else {
  logger.error(`Action ${action.id} failed`, result.error);
}
```

---

## 🎉 Conclusion

The Ops Approval Engine is designed to integrate seamlessly with all Molam Pay components. Use these examples as a starting point for your integrations.

For questions or support: ops-support@molam.com

---

**Integration Examples v1.0**
**Brique 78 - Ops Approval Engine**

Built with ❤️ by Molam Team
2025-11-12
