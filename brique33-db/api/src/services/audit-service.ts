// api/src/services/audit-service.ts
import { pool } from '../db';

export interface AuditLog {
    actor: string;
    action: string;
    target_type: string;
    target_id: string;
    details: any;
}

export class AuditService {
    static async log(auditData: AuditLog): Promise<void> {
        try {
            await pool.query(
                `INSERT INTO molam_audit_logs (actor, action, target_type, target_id, details, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
                [auditData.actor, auditData.action, auditData.target_type, auditData.target_id, JSON.stringify(auditData.details)]
            );
        } catch (error) {
            console.error('Failed to write audit log:', error);
        }
    }

    static async getLogs(targetType?: string, targetId?: string): Promise<any[]> {
        let query = `SELECT * FROM molam_audit_logs WHERE 1=1`;
        const params: any[] = [];

        if (targetType) {
            params.push(targetType);
            query += ` AND target_type = $${params.length}`;
        }

        if (targetId) {
            params.push(targetId);
            query += ` AND target_id = $${params.length}`;
        }

        query += ` ORDER BY created_at DESC LIMIT 100`;

        const result = await pool.query(query, params);
        return result.rows;
    }
}