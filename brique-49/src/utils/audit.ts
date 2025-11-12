/**
 * Brique 49 - Taxes & Compliance
 * Audit Logging Utility
 */

import { pool } from "./db.js";

export interface AuditLogEntry {
  action: string;
  actor_id?: string;
  actor_type?: string;
  resource_type?: string;
  resource_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Log an action to the audit trail (immutable)
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO molam_audit_logs(action, actor_id, actor_type, resource_type, resource_id, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        entry.action,
        entry.actor_id || null,
        entry.actor_type || "user",
        entry.resource_type || null,
        entry.resource_id || null,
        entry.details || {},
        entry.ip_address || null,
        entry.user_agent || null,
      ]
    );
  } catch (err) {
    console.error("Audit log error:", err);
    // Don't throw - audit failures shouldn't block operations
  }
}
