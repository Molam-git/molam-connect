/**
 * Brique 41 - Molam Connect
 * Audit logging utilities
 */

import { pool } from "../db";

/**
 * Log an audit event
 *
 * @param connect_account_id - Connect account ID (null for system-wide events)
 * @param actor - User ID or 'system'
 * @param action - Action performed (e.g., 'connect_account.created')
 * @param details - Additional details (will be stored as JSONB)
 */
export async function audit(
  connect_account_id: string | null,
  actor: string,
  action: string,
  details: any = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO connect_audit_logs (connect_account_id, actor, action, details)
       VALUES ($1, $2, $3, $4)`,
      [connect_account_id, actor, action, details]
    );

    console.log(`[Audit] ${action} by ${actor}`, {
      account: connect_account_id,
      details: JSON.stringify(details)
    });
  } catch (e: any) {
    console.error("[Audit] Failed to log event:", e.message);
    // Don't throw - audit failure shouldn't break the main operation
  }
}

/**
 * Get audit logs for an account
 */
export async function getAuditLogs(
  connect_account_id: string,
  options: {
    limit?: number;
    offset?: number;
    action_filter?: string;
    from?: Date;
    to?: Date;
  } = {}
) {
  const { limit = 100, offset = 0, action_filter, from, to } = options;

  let query = `
    SELECT id, connect_account_id, actor, action, details, created_at
    FROM connect_audit_logs
    WHERE connect_account_id = $1
  `;

  const params: any[] = [connect_account_id];
  let paramIndex = 2;

  if (action_filter) {
    query += ` AND action LIKE $${paramIndex}`;
    params.push(`%${action_filter}%`);
    paramIndex++;
  }

  if (from) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(from);
    paramIndex++;
  }

  if (to) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(to);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Common audit actions
 */
export const AuditActions = {
  // Account actions
  ACCOUNT_CREATED: "connect_account.created",
  ACCOUNT_UPDATED: "connect_account.updated",
  ACCOUNT_DELETED: "connect_account.deleted",
  ACCOUNT_APPROVED: "connect_account.approved",
  ACCOUNT_REJECTED: "connect_account.rejected",
  ACCOUNT_BLOCKED: "connect_account.blocked",

  // Verification actions
  VERIFICATION_REFRESHED: "connect_account.verification_refreshed",
  VERIFICATION_APPROVED: "connect_account.verification_approved",
  VERIFICATION_FAILED: "connect_account.verification_failed",

  // Capability actions
  CAPABILITIES_UPDATED: "connect_account.capabilities_updated",
  CAPABILITY_ENABLED: "connect_account.capability_enabled",
  CAPABILITY_DISABLED: "connect_account.capability_disabled",

  // Fee actions
  FEE_PROFILE_SET: "connect_account.fee_profile_set",
  FEE_PROFILE_UPDATED: "connect_account.fee_profile_updated",

  // External account actions
  EXTERNAL_ACCOUNT_ADDED: "external_account.added",
  EXTERNAL_ACCOUNT_REMOVED: "external_account.removed",
  EXTERNAL_ACCOUNT_UPDATED: "external_account.updated",

  // Onboarding actions
  ONBOARDING_TASK_CREATED: "onboarding.task_created",
  ONBOARDING_TASK_RESOLVED: "onboarding.task_resolved",
  ONBOARDING_TASK_UPDATED: "onboarding.task_updated",

  // Webhook actions
  WEBHOOK_CREATED: "webhook.created",
  WEBHOOK_UPDATED: "webhook.updated",
  WEBHOOK_DELETED: "webhook.deleted",
  WEBHOOK_SENT: "webhook.sent",
  WEBHOOK_FAILED: "webhook.failed",

  // Person actions
  PERSON_ADDED: "person.added",
  PERSON_UPDATED: "person.updated",
  PERSON_REMOVED: "person.removed",
} as const;
