// src/routes/prefs.ts
import { Router } from 'express';
import { pool } from '../store/db';

export const prefsRouter = Router();

// GET user preferences
prefsRouter.get('/', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { rows } = await pool.query(
            'SELECT * FROM user_notification_prefs WHERE user_id = $1',
            [userId]
        );

        if (rows.length === 0) {
            // Retourner les valeurs par défaut
            return res.json({
                user_id: userId,
                lang: null,
                currency: null,
                tz: null,
                push_enabled: true,
                sms_enabled: true,
                email_enabled: true,
                ussd_enabled: false,
                quiet_hours: { start: "22:00", end: "07:00" },
                updated_at: new Date().toISOString()
            });
        }

        return res.json(rows[0]);
    } catch (error: any) {
        console.error('Error fetching user prefs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATE user preferences
prefsRouter.put('/', async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const {
            lang,
            currency,
            tz,
            push_enabled,
            sms_enabled,
            email_enabled,
            ussd_enabled,
            quiet_hours
        } = req.body;

        const query = `
      INSERT INTO user_notification_prefs 
      (user_id, lang, currency, tz, push_enabled, sms_enabled, email_enabled, ussd_enabled, quiet_hours)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id)
      DO UPDATE SET 
        lang = EXCLUDED.lang,
        currency = EXCLUDED.currency,
        tz = EXCLUDED.tz,
        push_enabled = EXCLUDED.push_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        email_enabled = EXCLUDED.email_enabled,
        ussd_enabled = EXCLUDED.ussd_enabled,
        quiet_hours = EXCLUDED.quiet_hours,
        updated_at = now()
      RETURNING *
    `;

        const { rows } = await pool.query(query, [
            userId,
            lang,
            currency,
            tz,
            push_enabled ?? true,
            sms_enabled ?? true,
            email_enabled ?? true,
            ussd_enabled ?? false,
            JSON.stringify(quiet_hours || { start: "22:00", end: "07:00" })
        ]);

        return res.json(rows[0]);
    } catch (error: any) {
        console.error('Error updating user prefs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});