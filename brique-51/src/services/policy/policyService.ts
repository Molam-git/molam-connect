/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Policy Service - Hierarchical Policy Resolution
 */

import { pool } from "../../utils/db.js";
import { pickSiraScore } from "./siraService.js";

export interface PolicyConfig {
  reverse_window_minutes?: number;
  max_refund_amount_absolute?: number;
  max_refund_amount_percent?: number;
  auto_approve?: boolean;
  require_ops_approval_above?: number;
  chargeback_handling?: "merchant" | "molam" | "shared";
  allowed_methods?: string[];
  ttl_for_customer_request_days?: number;
  sira_threshold_auto_approve?: number;
}

export interface Policy {
  id: string;
  scope: string;
  scope_id: string | null;
  name: string;
  description: string;
  config: PolicyConfig;
  status: string;
  priority: number;
}

export interface PolicyDecision {
  action: "auto_approve" | "require_merchant" | "require_ops" | "deny";
  reason: string;
  sira_score?: number;
  policy_id?: string;
}

/**
 * Find applicable policy based on hierarchy
 * Priority: sub_account → merchant → zone → global
 */
export async function findApplicablePolicy(
  merchantId: string | null,
  subAccountId: string | null,
  countryCode: string
): Promise<Policy | null> {
  // 1) Check sub_account level
  if (subAccountId) {
    const { rows } = await pool.query(
      `SELECT * FROM refund_policies_v2
       WHERE scope = 'sub_account' AND scope_id = $1 AND status = 'active'
       ORDER BY priority ASC, created_at DESC
       LIMIT 1`,
      [subAccountId]
    );

    if (rows[0]) {
      console.log(`[Policy] Found sub_account policy: ${rows[0].name}`);
      return rows[0];
    }
  }

  // 2) Check merchant level
  if (merchantId) {
    const { rows } = await pool.query(
      `SELECT * FROM refund_policies_v2
       WHERE scope = 'merchant' AND scope_id = $1 AND status = 'active'
       ORDER BY priority ASC, created_at DESC
       LIMIT 1`,
      [merchantId]
    );

    if (rows[0]) {
      console.log(`[Policy] Found merchant policy: ${rows[0].name}`);
      return rows[0];
    }
  }

  // 3) Check zone level (lookup zone by country)
  if (countryCode) {
    const { rows: zoneRows } = await pool.query(
      `SELECT z.id FROM zones z
       JOIN zone_countries zc ON z.id = zc.zone_id
       WHERE zc.country_code = $1
       LIMIT 1`,
      [countryCode]
    );

    if (zoneRows[0]) {
      const zoneId = zoneRows[0].id;
      const { rows } = await pool.query(
        `SELECT * FROM refund_policies_v2
         WHERE scope = 'zone' AND scope_id = $1 AND status = 'active'
         ORDER BY priority ASC, created_at DESC
         LIMIT 1`,
        [zoneId]
      );

      if (rows[0]) {
        console.log(`[Policy] Found zone policy: ${rows[0].name}`);
        return rows[0];
      }
    }
  }

  // 4) Check global level
  const { rows } = await pool.query(
    `SELECT * FROM refund_policies_v2
     WHERE scope = 'global' AND status = 'active'
     ORDER BY priority ASC, created_at DESC
     LIMIT 1`
  );

  if (rows[0]) {
    console.log(`[Policy] Found global policy: ${rows[0].name}`);
    return rows[0];
  }

  console.log("[Policy] No policy found");
  return null;
}

/**
 * Evaluate policy and make decision
 */
export async function evaluateAndApplyPolicy(refundRequest: any): Promise<PolicyDecision> {
  const policy = await findApplicablePolicy(
    refundRequest.merchant_id,
    refundRequest.sub_account_id,
    refundRequest.customer_country || "XX"
  );

  // If no policy found, require ops approval
  if (!policy) {
    console.log("[Policy] No policy found, requiring ops approval");
    return {
      action: "require_ops",
      reason: "no_policy_found",
    };
  }

  const cfg: PolicyConfig = policy.config;
  const amount = Number(refundRequest.amount);

  // Check amount limits
  if (cfg.max_refund_amount_absolute && amount > cfg.max_refund_amount_absolute) {
    console.log(`[Policy] Amount ${amount} exceeds limit ${cfg.max_refund_amount_absolute}`);

    if (cfg.require_ops_approval_above && amount >= cfg.require_ops_approval_above) {
      return {
        action: "require_ops",
        reason: "amount_exceeds_ops_threshold",
        policy_id: policy.id,
      };
    }

    return {
      action: "require_merchant",
      reason: "amount_exceeds_merchant_threshold",
      policy_id: policy.id,
    };
  }

  // Get SIRA score if threshold is configured
  let siraScore: number | null = null;

  if (cfg.sira_threshold_auto_approve !== undefined) {
    siraScore = await pickSiraScore(refundRequest.customer_id, refundRequest.payment_id);
    console.log(`[Policy] SIRA score: ${siraScore}`);

    // If SIRA score is high, escalate to ops
    if (siraScore > cfg.sira_threshold_auto_approve) {
      return {
        action: "require_ops",
        reason: "sira_high_risk",
        sira_score: siraScore,
        policy_id: policy.id,
      };
    }
  }

  // Check auto_approve
  if (cfg.auto_approve) {
    console.log("[Policy] Auto-approve enabled");
    return {
      action: "auto_approve",
      reason: "auto_policy",
      sira_score: siraScore || undefined,
      policy_id: policy.id,
    };
  }

  // Default: require merchant approval
  return {
    action: "require_merchant",
    reason: "merchant_must_approve",
    sira_score: siraScore || undefined,
    policy_id: policy.id,
  };
}

/**
 * Apply decision to refund request
 */
export async function applyPolicyDecision(refundRequestId: string, decision: PolicyDecision): Promise<void> {
  await pool.query(
    `UPDATE refund_requests
     SET applied_policy_id = $1, sira_score = $2, decision_reason = $3, updated_at = now()
     WHERE id = $4`,
    [decision.policy_id || null, decision.sira_score || null, decision.reason, refundRequestId]
  );

  // Log action
  await pool.query(
    `INSERT INTO refund_actions(refund_request_id, actor_type, action, details, created_at)
     VALUES ($1, 'system', $2, $3, now())`,
    [refundRequestId, decision.action, { reason: decision.reason, sira_score: decision.sira_score }]
  );
}

/**
 * Create policy
 */
export async function createPolicy(input: {
  scope: string;
  scopeId?: string;
  name: string;
  description?: string;
  config: PolicyConfig;
  createdBy: string;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO refund_policies_v2(scope, scope_id, name, description, config, status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, now(), now())
     RETURNING *`,
    [input.scope, input.scopeId || null, input.name, input.description || null, input.config, input.createdBy]
  );

  const policy = rows[0];

  // Create history entry
  await pool.query(
    `INSERT INTO refund_policy_history(policy_id, changed_by, change_type, new_config, created_at)
     VALUES ($1, $2, 'created', $3, now())`,
    [policy.id, input.createdBy, input.config]
  );

  return policy;
}

/**
 * Update policy
 */
export async function updatePolicy(
  policyId: string,
  updates: { name?: string; description?: string; config?: PolicyConfig; status?: string },
  updatedBy: string
): Promise<any> {
  // Get current policy
  const { rows: current } = await pool.query(`SELECT * FROM refund_policies_v2 WHERE id = $1`, [policyId]);

  if (!current[0]) {
    throw new Error("policy_not_found");
  }

  const oldConfig = current[0].config;

  // Build update query
  const sets: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name) {
    sets.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.description) {
    sets.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }

  if (updates.config) {
    sets.push(`config = $${paramIndex++}`);
    values.push(updates.config);
  }

  if (updates.status) {
    sets.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  sets.push(`updated_at = now()`);
  values.push(policyId);

  await pool.query(
    `UPDATE refund_policies_v2 SET ${sets.join(", ")} WHERE id = $${paramIndex}`,
    values
  );

  // Create history entry
  await pool.query(
    `INSERT INTO refund_policy_history(policy_id, changed_by, change_type, old_config, new_config, created_at)
     VALUES ($1, $2, 'updated', $3, $4, now())`,
    [policyId, updatedBy, oldConfig, updates.config || oldConfig]
  );

  const { rows: updated } = await pool.query(`SELECT * FROM refund_policies_v2 WHERE id = $1`, [policyId]);
  return updated[0];
}

/**
 * List policies
 */
export async function listPolicies(filters: any = {}): Promise<any[]> {
  let query = `SELECT * FROM refund_policies_v2 WHERE 1=1`;
  const params: any[] = [];

  if (filters.scope) {
    params.push(filters.scope);
    query += ` AND scope = $${params.length}`;
  }

  if (filters.scopeId) {
    params.push(filters.scopeId);
    query += ` AND scope_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += ` ORDER BY priority ASC, created_at DESC LIMIT 100`;

  const { rows } = await pool.query(query, params);
  return rows;
}
