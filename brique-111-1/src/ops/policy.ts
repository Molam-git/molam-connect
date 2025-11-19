/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Ops Policy Management
 */

import { pool } from "../db";

export interface OpsPolicy {
  id: number;
  autopatch_enabled: boolean;
  autopatch_whitelist: string[];
  autopatch_max_severity: "low" | "medium" | "high" | "critical";
  require_multisig_for_major: boolean;
  require_multisig_for_high_impact: boolean;
  multisig_quorum_count: number;
  require_staging_test: boolean;
  staging_timeout_seconds: number;
  health_check_timeout_seconds: number;
  health_check_interval_seconds: number;
  auto_rollback_on_error_rate_threshold: number;
  auto_rollback_on_heartbeat_missed_seconds: number;
  sira_min_confidence: number;
  sira_learning_enabled: boolean;
  canary_percentage: number;
  canary_merchants: string[];
}

/**
 * Get current Ops policy
 */
export async function getOpsPolicy(): Promise<OpsPolicy> {
  const { rows } = await pool.query(
    `SELECT * FROM ops_policy WHERE id = 1`
  );

  if (rows.length === 0) {
    // Return default policy
    return {
      id: 1,
      autopatch_enabled: true,
      autopatch_whitelist: [],
      autopatch_max_severity: "medium",
      require_multisig_for_major: true,
      require_multisig_for_high_impact: true,
      multisig_quorum_count: 2,
      require_staging_test: true,
      staging_timeout_seconds: 300,
      health_check_timeout_seconds: 90,
      health_check_interval_seconds: 3,
      auto_rollback_on_error_rate_threshold: 10.0,
      auto_rollback_on_heartbeat_missed_seconds: 120,
      sira_min_confidence: 0.75,
      sira_learning_enabled: true,
      canary_percentage: 0,
      canary_merchants: []
    };
  }

  const policy = rows[0];
  return {
    ...policy,
    autopatch_whitelist: policy.autopatch_whitelist || [],
    canary_merchants: policy.canary_merchants || []
  };
}

/**
 * Update Ops policy
 */
export async function updateOpsPolicy(
  updates: Partial<OpsPolicy>,
  updatedBy: string
): Promise<OpsPolicy> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (key === "id" || key === "updated_at" || key === "updated_by") continue;
    
    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex++;
  }

  setClauses.push(`updated_at = now()`);
  setClauses.push(`updated_by = $${paramIndex}`);
  values.push(updatedBy);

  await pool.query(
    `UPDATE ops_policy SET ${setClauses.join(", ")} WHERE id = 1`,
    values
  );

  return await getOpsPolicy();
}



