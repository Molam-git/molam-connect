/**
 * Brique 70octies - Audit Trail
 * Immutable audit logging for all loyalty operations
 */

import pool from '../db';

export interface AuditLogEntry {
  entityType: 'program' | 'balance' | 'campaign' | 'transaction' | 'voucher' | 'approval';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'freeze' | 'adjust' | 'approve' | 'reject' | 'redeem';
  actorId?: string;
  actorRole?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

/**
 * Create immutable audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO loyalty_audit_logs
       (entity_type, entity_id, action, actor_id, actor_role, changes, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.actorId,
        entry.actorRole,
        entry.changes ? JSON.stringify(entry.changes) : null,
        entry.ipAddress,
        entry.userAgent
      ]
    );
  } catch (error) {
    // Audit logging failures should not break the main operation
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get audit trail for an entity
 */
export async function getAuditTrail(
  entityType: string,
  entityId: string,
  limit: number = 100
): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM loyalty_audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );

  return result.rows;
}

/**
 * Get audit logs by actor (user)
 */
export async function getAuditLogsByActor(
  actorId: string,
  limit: number = 100
): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM loyalty_audit_logs
     WHERE actor_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [actorId, limit]
  );

  return result.rows;
}

/**
 * Search audit logs (for Ops console)
 */
export async function searchAuditLogs(filters: {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorId?: string;
  actorRole?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    params.push(filters.entityType);
  }

  if (filters.entityId) {
    conditions.push(`entity_id = $${paramIndex++}`);
    params.push(filters.entityId);
  }

  if (filters.action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(filters.action);
  }

  if (filters.actorId) {
    conditions.push(`actor_id = $${paramIndex++}`);
    params.push(filters.actorId);
  }

  if (filters.actorRole) {
    conditions.push(`actor_role = $${paramIndex++}`);
    params.push(filters.actorRole);
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;

  const result = await pool.query(
    `SELECT * FROM loyalty_audit_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex}`,
    [...params, limit]
  );

  return result.rows;
}
