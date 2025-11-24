import { Router } from 'express';
import { requireRole } from '../utils/authz';
import { pool } from '../store/db';

export const outboxRouter = Router();

outboxRouter.get('/', requireRole(['pay_admin', 'auditor']), async (req: any, res) => {
    const { status, event_type, limit = 50, offset = 0 } = req.query;

    let query = `
    SELECT * FROM notification_outbox
    WHERE ($1::text IS NULL OR status = $1)
      AND ($2::text IS NULL OR event_type = $2)
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `;

    const { rows } = await pool.query(query, [
        status || null,
        event_type || null,
        parseInt(limit),
        parseInt(offset)
    ]);

    res.json({ rows, limit, offset });
});