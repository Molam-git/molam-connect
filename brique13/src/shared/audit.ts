import { db } from "./db";
import { Request } from "express";

export async function auditTrail(req: Request, action: string, data: any) {
    try {
        await db.query(
            `INSERT INTO molam_audit_logs (actor_id, action, details, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5)`,
            [
                req.user?.id || null,
                action,
                data,
                req.ip,
                req.get('User-Agent')
            ]
        );
    } catch (error) {
        console.error('Audit trail error:', error);
        // Ne pas bloquer la requête en cas d'erreur d'audit
    }
}