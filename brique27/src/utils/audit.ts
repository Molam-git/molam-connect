import { pool } from "../store/db";

export async function recordAudit(
    userId: number | null,
    action: string,
    details: any
) {
    await pool.query(
        `INSERT INTO molam_audit_logs (user_id, action, resource_type, resource_id, diff)
     VALUES ($1, $2, $3, $4, $5)`,
        [userId, action, details.resource_type, details.resource_id, JSON.stringify(details)]
    );
}