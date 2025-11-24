import express from 'express';
import { Pool } from 'pg';
import { body, query, validationResult } from 'express-validator';
import { authUserJWT, authServiceMTLS } from './security-mw';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
export const router = express.Router();

router.get('/api/notify/preferences',
    authUserJWT,
    async (req: any, res) => {
        const userId = req.user.sub;
        const { rows } = await db.query(`
      SELECT event_key, channel, opted_in, quiet_hours_start, quiet_hours_end, dnd
      FROM notification_preferences WHERE user_id=$1
    `, [userId]);
        res.json({ userId, preferences: rows });
    });

router.put('/api/notify/preferences',
    authUserJWT,
    body('eventKey').isString().notEmpty(),
    body('channel').isIn(['inapp', 'push', 'sms', 'email', 'ussd']),
    body('optedIn').isBoolean().optional(),
    body('quietHoursStart').optional().isString(),
    body('quietHoursEnd').optional().isString(),
    body('dnd').optional().isBoolean(),
    async (req: any, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const userId = req.user.sub;
        const { eventKey, channel, optedIn = true, quietHoursStart, quietHoursEnd, dnd = false } = req.body;

        await db.query(`
      INSERT INTO notification_preferences (user_id,event_key,channel,opted_in,quiet_hours_start,quiet_hours_end,dnd,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$1)
      ON CONFLICT (user_id,event_key,channel)
      DO UPDATE SET opted_in=$4, quiet_hours_start=$5, quiet_hours_end=$6, dnd=$7, updated_at=NOW()
    `, [userId, eventKey, channel, optedIn, quietHoursStart ?? null, quietHoursEnd ?? null, dnd]);

        res.status(204).end();
    });

router.put('/api/notify/admin/defaults',
    authServiceMTLS,
    body('userId').isUUID(),
    body('defaults').isArray(),
    async (req, res) => {
        const { userId, defaults } = req.body as { userId: string, defaults: Array<{ channel: string, optedIn: boolean }> };
        for (const d of defaults) {
            await db.query(`
         INSERT INTO notification_preferences (user_id,event_key,channel,opted_in)
         VALUES ($1,'*',$2,$3)
         ON CONFLICT (user_id,event_key,channel) DO UPDATE SET opted_in=$3, updated_at=NOW()
      `, [userId, d.channel, d.optedIn]);
        }
        res.status(204).end();
    });

export default router;