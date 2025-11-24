// src/models/ReconciliationLog.ts
import { db } from '../config';

export class ReconciliationLog {
    static async create(data: {
        actor: string;
        action: string;
        details: any;
    }) {
        const result = await db.query(
            `INSERT INTO reconciliation_logs (actor, action, details) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
            [data.actor, data.action, JSON.stringify(data.details)]
        );
        return result.rows[0];
    }

    static async findByAction(action: string) {
        const result = await db.query(
            'SELECT * FROM reconciliation_logs WHERE action = $1 ORDER BY created_at DESC',
            [action]
        );
        return result.rows;
    }
}