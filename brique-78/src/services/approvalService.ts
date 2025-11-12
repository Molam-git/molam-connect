/**
 * Brique 78 - Ops Approval Engine Service
 *
 * Multi-signature approval engine for critical operations with:
 * - Configurable quorum (role-based, percentage, specific users)
 * - Vote tracking (approve, reject, abstain)
 * - Auto-approval policies
 * - Escalation on timeout
 * - Immutable audit trail
 * - Idempotency throughout
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Pool, PoolClient } from 'pg';

// =======================================================================
// TYPES
// =======================================================================

export type ActionOrigin = 'sira' | 'system' | 'ops_ui' | 'module' | 'alert';
export type ActionStatus = 'requested' | 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'expired' | 'escalated';
export type VoteType = 'approve' | 'reject' | 'abstain';

export interface OpsAction {
  id: string;
  idempotency_key?: string;
  origin: ActionOrigin;
  action_type: string;
  params: Record<string, any>;
  status: ActionStatus;
  target_tenant_type?: string;
  target_tenant_id?: string;
  required_quorum?: QuorumConfig;
  required_ratio: number;
  timeout_seconds: number;
  escalation_role?: string;
  auto_execute: boolean;
  executed_by?: string;
  executed_at?: Date;
  result?: Record<string, any>;
  rollback_action?: Record<string, any>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

export interface QuorumConfig {
  type: 'role' | 'percentage' | 'specific_users';
  value: any; // { role: 'pay_admin', min_votes: 2 } | { percentage: 0.6, pool: [...] } | { users: [...] }
}

export interface OpsApproval {
  id: string;
  ops_action_id: string;
  voter_id: string;
  voter_roles: string[];
  vote: VoteType;
  comment?: string;
  signed_jwt?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  criteria: Record<string, any>; // Match conditions
  policy: PolicyConfig;
  priority: number;
  enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PolicyConfig {
  required_quorum?: QuorumConfig;
  required_ratio?: number;
  timeout_seconds?: number;
  escalation_role?: string;
  auto_execute?: boolean;
}

export interface AuditEvent {
  id: string;
  ops_action_id: string;
  action: string;
  snapshot: Record<string, any>;
  actor?: string;
  created_at: Date;
}

export interface ActionWithVotes extends OpsAction {
  votes: OpsApproval[];
  votes_approve: number;
  votes_reject: number;
  votes_abstain: number;
  votes_total: number;
  approval_ratio: number;
  quorum_satisfied: boolean;
}

// =======================================================================
// DATABASE CONNECTION
// =======================================================================

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =======================================================================
// CORE FUNCTIONS
// =======================================================================

/**
 * Create ops action with idempotency
 *
 * Idempotency: If idempotency_key provided and action exists, returns existing action.
 * Otherwise creates new action, applies matching policy, and audits creation.
 */
export async function createOpsAction(
  params: {
    idempotency_key?: string;
    origin: ActionOrigin;
    action_type: string;
    params: Record<string, any>;
    target_tenant_type?: string;
    target_tenant_id?: string;
    required_quorum?: QuorumConfig;
    required_ratio?: number;
    timeout_seconds?: number;
    escalation_role?: string;
    auto_execute?: boolean;
    created_by: string;
  }
): Promise<OpsAction> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check idempotency
    if (params.idempotency_key) {
      const existingResult = await client.query<OpsAction>(
        `SELECT * FROM ops_actions WHERE idempotency_key = $1`,
        [params.idempotency_key]
      );

      if (existingResult.rows.length > 0) {
        await client.query('COMMIT');
        return existingResult.rows[0];
      }
    }

    // Insert action
    const insertResult = await client.query<OpsAction>(
      `INSERT INTO ops_actions (
        idempotency_key, origin, action_type, params,
        target_tenant_type, target_tenant_id,
        required_quorum, required_ratio, timeout_seconds,
        escalation_role, auto_execute, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        params.idempotency_key,
        params.origin,
        params.action_type,
        JSON.stringify(params.params),
        params.target_tenant_type,
        params.target_tenant_id,
        params.required_quorum ? JSON.stringify(params.required_quorum) : null,
        params.required_ratio || 0.60,
        params.timeout_seconds || 86400,
        params.escalation_role,
        params.auto_execute !== undefined ? params.auto_execute : false,
        params.created_by,
      ]
    );

    const action = insertResult.rows[0];

    // Apply policy (trigger will do this automatically, but we can also call function)
    await client.query(`SELECT apply_approval_policy($1)`, [action.id]);

    // Audit
    await client.query(
      `INSERT INTO ops_approval_audit (ops_action_id, action, snapshot, actor)
       VALUES ($1, $2, $3, $4)`,
      [
        action.id,
        'created',
        JSON.stringify({ action_type: action.action_type, params: action.params }),
        params.created_by,
      ]
    );

    await client.query('COMMIT');

    console.log(`[ApprovalService] Created action ${action.id} (${action.action_type})`);

    return action;
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[ApprovalService] Create action failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Vote on action
 *
 * Records vote (upserts if voter already voted).
 * Automatically evaluates quorum after vote.
 */
export async function voteOnAction(
  actionId: string,
  voterId: string,
  voterRoles: string[],
  vote: VoteType,
  comment?: string,
  signedJwt?: string,
  metadata?: { ip_address?: string; user_agent?: string }
): Promise<{ approval: OpsApproval; action: ActionWithVotes }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get action
    const actionResult = await client.query<OpsAction>(
      `SELECT * FROM ops_actions WHERE id = $1`,
      [actionId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error('Action not found');
    }

    const action = actionResult.rows[0];

    // Check if action is still pending
    if (!['requested', 'pending_approval'].includes(action.status)) {
      throw new Error(`Action is ${action.status}, cannot vote`);
    }

    // Upsert vote (ON CONFLICT UPDATE)
    const voteResult = await client.query<OpsApproval>(
      `INSERT INTO ops_approvals (
        ops_action_id, voter_id, voter_roles, vote, comment, signed_jwt, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (ops_action_id, voter_id)
      DO UPDATE SET
        vote = EXCLUDED.vote,
        comment = EXCLUDED.comment,
        signed_jwt = EXCLUDED.signed_jwt,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        created_at = now()
      RETURNING *`,
      [
        actionId,
        voterId,
        voterRoles,
        vote,
        comment,
        signedJwt,
        metadata?.ip_address,
        metadata?.user_agent,
      ]
    );

    const approval = voteResult.rows[0];

    // Audit
    await client.query(
      `INSERT INTO ops_approval_audit (ops_action_id, action, snapshot, actor)
       VALUES ($1, $2, $3, $4)`,
      [
        actionId,
        'voted',
        JSON.stringify({ vote, voter_id: voterId, voter_roles: voterRoles }),
        voterId,
      ]
    );

    // Evaluate quorum (will update action status if quorum met)
    await client.query(`SELECT evaluate_quorum($1)`, [actionId]);

    await client.query('COMMIT');

    console.log(`[ApprovalService] Vote recorded: ${voterId} voted ${vote} on ${actionId}`);

    // Get updated action with votes
    const updatedAction = await getActionWithVotes(actionId);

    return { approval, action: updatedAction };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[ApprovalService] Vote failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get action with votes
 */
export async function getActionWithVotes(actionId: string): Promise<ActionWithVotes> {
  const actionResult = await pool.query<OpsAction>(
    `SELECT * FROM ops_actions WHERE id = $1`,
    [actionId]
  );

  if (actionResult.rows.length === 0) {
    throw new Error('Action not found');
  }

  const action = actionResult.rows[0];

  const votesResult = await pool.query<OpsApproval>(
    `SELECT * FROM ops_approvals WHERE ops_action_id = $1 ORDER BY created_at`,
    [actionId]
  );

  const votes = votesResult.rows;

  // Count votes
  const votes_approve = votes.filter((v) => v.vote === 'approve').length;
  const votes_reject = votes.filter((v) => v.vote === 'reject').length;
  const votes_abstain = votes.filter((v) => v.vote === 'abstain').length;
  const votes_considered = votes_approve + votes_reject;
  const votes_total = votes.length;

  const approval_ratio = votes_considered > 0 ? votes_approve / votes_considered : 0;

  // Check if quorum satisfied
  let quorum_satisfied = false;
  if (action.required_quorum) {
    const quorum = action.required_quorum as any;
    if (quorum.type === 'role') {
      const roleVotes = votes.filter((v) =>
        v.voter_roles.includes(quorum.value.role) && v.vote !== 'abstain'
      );
      quorum_satisfied = roleVotes.length >= quorum.value.min_votes;
    } else if (quorum.type === 'percentage') {
      const poolSize = quorum.value.pool?.length || 0;
      const votedCount = votes.filter((v) => v.vote !== 'abstain').length;
      quorum_satisfied = votedCount >= Math.ceil(poolSize * quorum.value.percentage);
    } else if (quorum.type === 'specific_users') {
      const requiredUsers = quorum.value.users || [];
      const votedUsers = votes.filter((v) => v.vote !== 'abstain').map((v) => v.voter_id);
      quorum_satisfied = requiredUsers.every((u: string) => votedUsers.includes(u));
    }
  } else {
    // No specific quorum, just check ratio
    quorum_satisfied = votes_considered >= 1;
  }

  return {
    ...action,
    votes,
    votes_approve,
    votes_reject,
    votes_abstain,
    votes_total,
    approval_ratio,
    quorum_satisfied,
  };
}

/**
 * Get pending actions for a role
 *
 * Returns actions awaiting approval that the user with given roles can vote on.
 */
export async function getPendingActions(
  voterRoles: string[],
  limit: number = 50,
  offset: number = 0
): Promise<ActionWithVotes[]> {
  // Get all pending actions
  const result = await pool.query<OpsAction>(
    `SELECT * FROM ops_actions
     WHERE status IN ('requested', 'pending_approval')
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const actions = result.rows;

  // Get votes for each action
  const actionsWithVotes: ActionWithVotes[] = [];
  for (const action of actions) {
    const actionWithVotes = await getActionWithVotes(action.id);

    // Filter: only include if user's roles match required quorum
    let canVote = true;
    if (action.required_quorum) {
      const quorum = action.required_quorum as any;
      if (quorum.type === 'role') {
        canVote = voterRoles.includes(quorum.value.role);
      } else if (quorum.type === 'specific_users') {
        // For specific_users, we'd need voter_id, skip for now
        canVote = true;
      }
    }

    if (canVote) {
      actionsWithVotes.push(actionWithVotes);
    }
  }

  return actionsWithVotes;
}

/**
 * Execute approved action
 *
 * Executes the action logic based on action_type.
 * Updates status to 'executing', runs logic, then updates to 'executed' or 'failed'.
 */
export async function executeAction(
  actionId: string,
  executorId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get action
    const actionResult = await client.query<OpsAction>(
      `SELECT * FROM ops_actions WHERE id = $1`,
      [actionId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error('Action not found');
    }

    const action = actionResult.rows[0];

    // Check status
    if (action.status !== 'approved') {
      throw new Error(`Action is ${action.status}, cannot execute`);
    }

    // Update status to executing
    await client.query(
      `UPDATE ops_actions SET status = 'executing', executed_by = $1 WHERE id = $2`,
      [executorId, actionId]
    );

    // Audit
    await client.query(
      `INSERT INTO ops_approval_audit (ops_action_id, action, snapshot, actor)
       VALUES ($1, $2, $3, $4)`,
      [actionId, 'executing', JSON.stringify({}), executorId]
    );

    await client.query('COMMIT');

    console.log(`[ApprovalService] Executing action ${actionId} (${action.action_type})`);

    // Execute action logic (outside transaction)
    let result: any;
    let success = true;
    let error: string | undefined;

    try {
      result = await executeActionLogic(action);
    } catch (err: any) {
      success = false;
      error = err.message;
      console.error(`[ApprovalService] Execution failed:`, err);
    }

    // Update status to executed or failed
    await pool.query(
      `UPDATE ops_actions
       SET status = $1, result = $2, executed_at = now(), updated_at = now()
       WHERE id = $3`,
      [success ? 'executed' : 'failed', JSON.stringify({ success, result, error }), actionId]
    );

    // Audit
    await pool.query(
      `INSERT INTO ops_approval_audit (ops_action_id, action, snapshot, actor)
       VALUES ($1, $2, $3, $4)`,
      [
        actionId,
        success ? 'executed' : 'failed',
        JSON.stringify({ result, error }),
        executorId,
      ]
    );

    console.log(`[ApprovalService] Action ${actionId} ${success ? 'executed' : 'failed'}`);

    return { success, result, error };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[ApprovalService] Execute action failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute action logic
 *
 * Implements the actual action based on action_type.
 * This is where integrations with other services happen.
 */
async function executeActionLogic(action: OpsAction): Promise<any> {
  const { action_type, params } = action;

  console.log(`[ApprovalService] Executing logic for ${action_type}:`, params);

  switch (action_type) {
    case 'PAUSE_PAYOUT':
      // TODO: Integrate with payout service
      return { paused: true, merchant_id: params.merchant_id, duration: params.duration };

    case 'FREEZE_MERCHANT':
      // TODO: Integrate with merchant service
      return { frozen: true, merchant_id: params.merchant_id, reason: params.reason };

    case 'ADJUST_FLOAT':
      // TODO: Integrate with float management service
      return { adjusted: true, amount: params.amount, agent_id: params.agent_id };

    case 'ROUTE_PAYOUT_OVERRIDE':
      // TODO: Integrate with routing service
      return { override: true, bank_profile_id: params.bank_profile_id };

    case 'REQUEUE_DLQ':
      // TODO: Integrate with queue service
      return { requeued: true, count: params.max_items };

    case 'UPDATE_RISK_THRESHOLD':
      // TODO: Integrate with risk engine
      return { updated: true, threshold: params.threshold };

    case 'MANUAL_REVERSAL':
      // TODO: Integrate with reversal service
      return { reversed: true, transaction_id: params.transaction_id };

    case 'EMERGENCY_CIRCUIT_BREAK':
      // TODO: Circuit breaker integration
      return { circuit_broken: true, service: params.service };

    case 'ADJUST_RATE_LIMIT':
      // TODO: Rate limiter integration
      return { adjusted: true, limit: params.limit };

    case 'RELEASE_HOLD':
      // TODO: Integrate with hold service
      return { released: true, transaction_id: params.transaction_id };

    case 'FORCE_RECONCILE':
      // TODO: Integrate with reconciliation service
      return { reconciled: true, batch_id: params.batch_id };

    default:
      throw new Error(`Unknown action type: ${action_type}`);
  }
}

/**
 * Escalate expired actions
 *
 * Cron job (runs every 5-10 min) that:
 * - Finds actions past expires_at and still pending
 * - Escalates to escalation_role if configured
 * - Otherwise marks as 'expired'
 */
export async function escalateExpiredActions(): Promise<{ escalated: number; expired: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Call SQL function
    const result = await client.query<{ escalate_expired_actions: string }>(
      `SELECT escalate_expired_actions()`
    );

    const summary = result.rows[0]?.escalate_expired_actions || '0 escalated, 0 expired';

    await client.query('COMMIT');

    console.log(`[ApprovalService] Escalation job: ${summary}`);

    // Parse summary
    const matches = summary.match(/(\d+) escalated, (\d+) expired/);
    const escalated = matches ? parseInt(matches[1]) : 0;
    const expired = matches ? parseInt(matches[2]) : 0;

    return { escalated, expired };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[ApprovalService] Escalation job failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Auto-execute approved actions
 *
 * Cron job (runs every 1-2 min) that:
 * - Finds actions with status='approved' and auto_execute=true
 * - Executes them automatically
 */
export async function autoExecuteApprovedActions(): Promise<{ executed: number; failed: number }> {
  const result = await pool.query<OpsAction>(
    `SELECT * FROM ops_actions
     WHERE status = 'approved' AND auto_execute = true
     ORDER BY created_at
     LIMIT 100`
  );

  const actions = result.rows;

  let executed = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      const execResult = await executeAction(action.id, 'system_auto_execute');
      if (execResult.success) {
        executed++;
      } else {
        failed++;
      }
    } catch (error: any) {
      console.error(`[ApprovalService] Auto-execute failed for ${action.id}:`, error);
      failed++;
    }
  }

  console.log(`[ApprovalService] Auto-execute job: ${executed} executed, ${failed} failed`);

  return { executed, failed };
}

// =======================================================================
// POLICY MANAGEMENT
// =======================================================================

/**
 * Create approval policy
 */
export async function createApprovalPolicy(
  params: {
    name: string;
    criteria: Record<string, any>;
    policy: PolicyConfig;
    priority?: number;
    enabled?: boolean;
    created_by: string;
  }
): Promise<ApprovalPolicy> {
  const result = await pool.query<ApprovalPolicy>(
    `INSERT INTO approval_policies (name, criteria, policy, priority, enabled, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.name,
      JSON.stringify(params.criteria),
      JSON.stringify(params.policy),
      params.priority || 100,
      params.enabled !== undefined ? params.enabled : true,
      params.created_by,
    ]
  );

  return result.rows[0];
}

/**
 * Get policy by ID
 */
export async function getPolicy(policyId: string): Promise<ApprovalPolicy | null> {
  const result = await pool.query<ApprovalPolicy>(
    `SELECT * FROM approval_policies WHERE id = $1`,
    [policyId]
  );

  return result.rows[0] || null;
}

/**
 * List all policies
 */
export async function listPolicies(
  enabledOnly: boolean = false
): Promise<ApprovalPolicy[]> {
  const query = enabledOnly
    ? `SELECT * FROM approval_policies WHERE enabled = true ORDER BY priority DESC, name`
    : `SELECT * FROM approval_policies ORDER BY priority DESC, name`;

  const result = await pool.query<ApprovalPolicy>(query);

  return result.rows;
}

/**
 * Update policy
 */
export async function updatePolicy(
  policyId: string,
  updates: {
    name?: string;
    criteria?: Record<string, any>;
    policy?: PolicyConfig;
    priority?: number;
    enabled?: boolean;
  },
  updatedBy: string
): Promise<ApprovalPolicy> {
  const setParts: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    setParts.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.criteria !== undefined) {
    setParts.push(`criteria = $${idx++}`);
    values.push(JSON.stringify(updates.criteria));
  }
  if (updates.policy !== undefined) {
    setParts.push(`policy = $${idx++}`);
    values.push(JSON.stringify(updates.policy));
  }
  if (updates.priority !== undefined) {
    setParts.push(`priority = $${idx++}`);
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    setParts.push(`enabled = $${idx++}`);
    values.push(updates.enabled);
  }

  setParts.push(`updated_by = $${idx++}`);
  values.push(updatedBy);

  setParts.push(`updated_at = now()`);

  values.push(policyId);

  const result = await pool.query<ApprovalPolicy>(
    `UPDATE approval_policies SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Policy not found');
  }

  return result.rows[0];
}

/**
 * Delete policy
 */
export async function deletePolicy(policyId: string): Promise<void> {
  await pool.query(`DELETE FROM approval_policies WHERE id = $1`, [policyId]);
}

// =======================================================================
// AUDIT & HISTORY
// =======================================================================

/**
 * Get audit trail for action
 */
export async function getAuditTrail(actionId: string): Promise<AuditEvent[]> {
  const result = await pool.query<AuditEvent>(
    `SELECT * FROM ops_approval_audit WHERE ops_action_id = $1 ORDER BY created_at`,
    [actionId]
  );

  return result.rows;
}

/**
 * Get action history for user
 */
export async function getUserActionHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<OpsAction[]> {
  const result = await pool.query<OpsAction>(
    `SELECT * FROM ops_actions
     WHERE created_by = $1 OR executed_by = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

/**
 * Get vote history for user
 */
export async function getUserVoteHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<OpsApproval[]> {
  const result = await pool.query<OpsApproval>(
    `SELECT * FROM ops_approvals
     WHERE voter_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return result.rows;
}

// =======================================================================
// STATISTICS
// =======================================================================

/**
 * Get approval performance stats
 */
export async function getApprovalStats(): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM approval_performance_stats ORDER BY total_actions DESC`
  );

  return result.rows;
}

/**
 * Get pending actions summary
 */
export async function getPendingSummary(): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM pending_actions_summary ORDER BY created_at DESC`
  );

  return result.rows;
}

// =======================================================================
// SCHEDULED JOBS
// =======================================================================

/**
 * Run escalation job
 *
 * Should be called by cron every 5-10 minutes.
 */
export async function runEscalationJob(): Promise<void> {
  console.log('[ApprovalService] Running escalation job...');
  try {
    const result = await escalateExpiredActions();
    console.log(`[ApprovalService] Escalation complete: ${result.escalated} escalated, ${result.expired} expired`);
  } catch (error: any) {
    console.error('[ApprovalService] Escalation job failed:', error);
  }
}

/**
 * Run auto-execute job
 *
 * Should be called by cron every 1-2 minutes.
 */
export async function runAutoExecuteJob(): Promise<void> {
  console.log('[ApprovalService] Running auto-execute job...');
  try {
    const result = await autoExecuteApprovedActions();
    console.log(`[ApprovalService] Auto-execute complete: ${result.executed} executed, ${result.failed} failed`);
  } catch (error: any) {
    console.error('[ApprovalService] Auto-execute job failed:', error);
  }
}

// =======================================================================
// EXPORTS
// =======================================================================

export default {
  // Core
  createOpsAction,
  voteOnAction,
  getActionWithVotes,
  getPendingActions,
  executeAction,

  // Policies
  createApprovalPolicy,
  getPolicy,
  listPolicies,
  updatePolicy,
  deletePolicy,

  // Audit
  getAuditTrail,
  getUserActionHistory,
  getUserVoteHistory,

  // Stats
  getApprovalStats,
  getPendingSummary,

  // Jobs
  runEscalationJob,
  runAutoExecuteJob,
  escalateExpiredActions,
  autoExecuteApprovedActions,
};
