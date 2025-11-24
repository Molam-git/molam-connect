// src/routes/routingAdmin.ts
import { Router } from "express";
import { pool } from "../store/db";
import { requireRole } from "../utils/authz";
import { recordAudit } from "../utils/audit";

export const routingAdminRouter = Router();

routingAdminRouter.get("/", requireRole(["ops_notif_admin"]), async (req: any, res) => {
    try {
        const { country, event_type, limit = 50, offset = 0 } = req.query as any;

        const query = `
      SELECT country, event_type, primary_channel, fallback_channel, updated_by, updated_at
      FROM channel_routing_zones
      WHERE ($1::text IS NULL OR country = $1)
        AND ($2::text IS NULL OR event_type = $2)
      ORDER BY country, event_type
      LIMIT $3 OFFSET $4
    `;

        const { rows } = await pool.query(query, [
            country || null,
            event_type || null,
            parseInt(limit),
            parseInt(offset)
        ]);

        return res.json({ rows, limit, offset });
    } catch (error) {
        console.error('Error fetching routing rules:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

routingAdminRouter.put("/", requireRole(["ops_notif_admin"]), async (req: any, res) => {
    try {
        const { country, event_type, primary_channel, fallback_channel } = req.body;
        const userId = req.user.id;

        // Validation des canaux
        const allowed = ["push", "sms", "email", "ussd", "webhook"];
        if (!allowed.includes(primary_channel) ||
            (fallback_channel && !allowed.includes(fallback_channel))) {
            return res.status(400).json({ error: "invalid_channel" });
        }

        const query = `
      INSERT INTO channel_routing_zones(country, event_type, primary_channel, fallback_channel, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (country, event_type)
      DO UPDATE SET primary_channel = $3, fallback_channel = $4, updated_by = $5, updated_at = now()
      RETURNING *;
    `;

        const { rows } = await pool.query(query, [
            country,
            event_type,
            primary_channel,
            fallback_channel || null,
            userId
        ]);

        const newRow = rows[0];

        // Enregistrement version + audit
        await pool.query(
            `INSERT INTO channel_routing_zone_versions
       (country, event_type, primary_channel, fallback_channel, changed_by, change_type, diff)
       VALUES ($1, $2, $3, $4, $5, 'update', $6)`,
            [country, event_type, primary_channel, fallback_channel, userId, JSON.stringify(newRow)]
        );

        await recordAudit(userId, "routing_update", {
            country,
            event_type,
            primary_channel,
            fallback_channel
        });

        return res.json(newRow);
    } catch (error: any) {
        console.error('Error updating routing rule:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

routingAdminRouter.delete("/", requireRole(["ops_notif_admin"]), async (req: any, res) => {
    try {
        const { country, event_type } = req.body;
        const userId = req.user.id;

        const deleteQuery = `
      DELETE FROM channel_routing_zones 
      WHERE country = $1 AND event_type = $2 
      RETURNING *
    `;

        const { rows } = await pool.query(deleteQuery, [country, event_type]);
        const deleted = rows[0] || null;

        if (deleted) {
            await pool.query(
                `INSERT INTO channel_routing_zone_versions
         (country, event_type, primary_channel, fallback_channel, changed_by, change_type, diff)
         VALUES ($1, $2, $3, $4, $5, 'delete', $6)`,
                [country, event_type, deleted.primary_channel, deleted.fallback_channel, userId, JSON.stringify(deleted)]
            );

            await recordAudit(userId, "routing_delete", { country, event_type });
        }

        return res.json({ deleted });
    } catch (error: any) {
        console.error('Error deleting routing rule:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});