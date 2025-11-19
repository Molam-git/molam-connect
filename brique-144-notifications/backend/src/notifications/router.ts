/**
 * BRIQUE 144 — Notification API Routes
 */
import { Router } from "express";
import { enqueueNotification } from "./producer";
import { pool } from "./db";

export const notifRouter = Router();

/**
 * POST /api/notifications/emit
 * Enqueue a new notification
 */
notifRouter.post("/emit", async (req: any, res) => {
  try {
    const result = await enqueueNotification(req.body);
    res.status(201).json(result);
  } catch (e: any) {
    console.error('Enqueue error:', e);
    res.status(500).json({ error: "enqueue_failed", detail: e.message });
  }
});

/**
 * GET /api/notifications/dlq
 * List quarantined notifications
 */
notifRouter.get("/dlq", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE status='quarantined'
       ORDER BY created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * POST /api/notifications/dlq/:id/requeue
 * Requeue a quarantined notification
 */
notifRouter.post("/dlq/:id/requeue", async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET status='pending', attempts=0, next_attempt_at=now(), last_error=null, updated_at=now()
       WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * GET /api/notifications/templates
 * List templates
 */
notifRouter.get("/templates", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notif_templates WHERE status='active'
       ORDER BY created_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * POST /api/notifications/templates
 * Create template
 */
notifRouter.post("/templates", async (req, res) => {
  try {
    const { tenant_type, tenant_id, key, lang, subject, body_text, body_html, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO notif_templates(tenant_type, tenant_id, key, lang, subject, body_text, body_html, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenant_type || 'global', tenant_id || null, key, lang || 'en', subject, body_text, body_html, status || 'active']
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * GET /api/notifications/providers
 * List providers
 */
notifRouter.get("/providers", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM notification_providers ORDER BY priority ASC`);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * PATCH /api/notifications/providers/:id
 * Update provider
 */
notifRouter.patch("/providers/:id", async (req, res) => {
  try {
    const { enabled } = req.body;
    const { rows } = await pool.query(
      `UPDATE notification_providers SET enabled=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [enabled, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

/**
 * GET /api/notifications/stats
 * Get notification stats
 */
notifRouter.get("/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='sent' AND created_at > NOW() - INTERVAL '24 hours') as sent_24h,
        COUNT(*) FILTER (WHERE status='failed' AND created_at > NOW() - INTERVAL '24 hours') as failed_24h,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='quarantined') as quarantined
      FROM notifications
    `);
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});
