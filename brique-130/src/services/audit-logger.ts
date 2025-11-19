// ============================================================================
// Immutable Audit Logger
// ============================================================================

import { Pool } from "pg";
import { signAudit } from "../utils/hmac";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Log audit event (immutable, HMAC signed)
 */
export async function logAuditEvent(params: {
  eventType: string;
  actor: string;
  entityId?: string;
  payload: any;
}) {
  const { eventType, actor, entityId, payload } = params;

  // Sign payload
  const signature = signAudit(payload);

  // Insert immutable log
  const { rows: [log] } = await pool.query(
    `INSERT INTO treasury_audit_logs(event_type, actor, entity_id, payload, signature, event_time)
     VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
    [eventType, actor, entityId || null, JSON.stringify(payload), signature]
  );

  return log;
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  actor?: string;
  limit?: number;
}) {
  const { eventType, startDate, endDate, actor, limit = 1000 } = filters;

  let query = `SELECT * FROM treasury_audit_logs WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (eventType) {
    query += ` AND event_type = $${paramIndex++}`;
    params.push(eventType);
  }

  if (startDate) {
    query += ` AND event_time >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND event_time <= $${paramIndex++}`;
    params.push(endDate);
  }

  if (actor) {
    query += ` AND actor = $${paramIndex++}`;
    params.push(actor);
  }

  query += ` ORDER BY event_time DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Verify audit log integrity
 */
export async function verifyAuditLogIntegrity(logId: string): Promise<boolean> {
  const { rows: [log] } = await pool.query(
    `SELECT * FROM treasury_audit_logs WHERE id=$1`,
    [logId]
  );

  if (!log) return false;

  const expectedSignature = signAudit(log.payload);
  return expectedSignature === log.signature;
}
