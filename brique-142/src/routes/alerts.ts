/**
 * BRIQUE 142 — Alerts Routes
 * API pour gestion des alertes temps réel
 */

import { Router } from 'express';
import { pool } from '../db';
import { requireRole, authzMiddleware } from '../utils/authz';
import { publishEvent } from '../events/publisher';
import { triggerNotifications } from '../alerts/notifications';

export const alertsRouter = Router();
alertsRouter.use(authzMiddleware);

/**
 * GET /api/alerts
 * List alerts with filters
 */
alertsRouter.get('/', requireRole(['ops', 'fraud_ops', 'pay_admin', 'auditor']), async (req: any, res) => {
  const { status, severity, type, limit = 100 } = req.query;

  try {
    let query = `SELECT * FROM alerts_summary WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[Alerts] Error listing:', error);
    res.status(500).json({ error: 'failed_to_list_alerts' });
  }
});

/**
 * POST /api/alerts
 * Create alert (used by monitoring systems, SIRA, etc.)
 */
alertsRouter.post('/', async (req: any, res) => {
  const { type, severity, message, metadata, priority } = req.body;

  if (!type || !severity || !message) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO alerts(type, severity, message, metadata, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [type, severity, message, metadata || {}, priority || 50]
    );

    const alert = rows[0];

    // Trigger notifications
    await triggerNotifications(alert.id);

    // Check for auto-playbooks
    await checkAutoPlaybooks(alert);

    publishEvent('alerts', alert.id, 'alert.created', {
      alert_id: alert.id,
      type,
      severity,
    });

    res.status(201).json(alert);
  } catch (error) {
    console.error('[Alerts] Error creating:', error);
    res.status(500).json({ error: 'failed_to_create_alert' });
  }
});

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge alert
 */
alertsRouter.post('/:id/acknowledge', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE alerts
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
       WHERE id = $1
       RETURNING *`,
      [id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'alert_not_found' });
    }

    publishEvent('alerts', id, 'alert.acknowledged', {
      alert_id: id,
      acknowledged_by: req.user.id,
    });

    res.json(rows[0]);
  } catch (error) {
    console.error('[Alerts] Error acknowledging:', error);
    res.status(500).json({ error: 'failed_to_acknowledge_alert' });
  }
});

/**
 * POST /api/alerts/:id/resolve
 * Resolve alert
 */
alertsRouter.post('/:id/resolve', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { id } = req.params;
  const { resolution_notes } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE alerts
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $2,
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{resolution_notes}', $3::jsonb)
       WHERE id = $1
       RETURNING *`,
      [id, req.user.id, JSON.stringify(resolution_notes || '')]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'alert_not_found' });
    }

    publishEvent('alerts', id, 'alert.resolved', {
      alert_id: id,
      resolved_by: req.user.id,
    });

    res.json(rows[0]);
  } catch (error) {
    console.error('[Alerts] Error resolving:', error);
    res.status(500).json({ error: 'failed_to_resolve_alert' });
  }
});

/**
 * GET /api/alerts/stats
 * Alert statistics for dashboard
 */
alertsRouter.get('/stats', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  try {
    const { rows: statusCounts } = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM alerts
       WHERE detected_at > NOW() - INTERVAL '24 hours'
       GROUP BY status`
    );

    const { rows: severityCounts } = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM alerts
       WHERE detected_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    );

    const { rows: typeCounts } = await pool.query(
      `SELECT type, COUNT(*) as count
       FROM alerts
       WHERE detected_at > NOW() - INTERVAL '24 hours'
       GROUP BY type
       ORDER BY count DESC
       LIMIT 10`
    );

    res.json({
      by_status: statusCounts,
      by_severity: severityCounts,
      by_type: typeCounts,
    });
  } catch (error) {
    console.error('[Alerts] Error fetching stats:', error);
    res.status(500).json({ error: 'failed_to_fetch_stats' });
  }
});

/**
 * Check and trigger auto-playbooks for alert
 */
async function checkAutoPlaybooks(alert: any): Promise<void> {
  try {
    const { rows: playbooks } = await pool.query(
      `SELECT * FROM playbooks
       WHERE active = true
         AND auto_execute = true
         AND triggers @> $1::jsonb`,
      [JSON.stringify({ alert_type: alert.type, severity: alert.severity })]
    );

    for (const playbook of playbooks) {
      await pool.query(
        `INSERT INTO playbook_executions(playbook_id, alert_id, executed_by, execution_mode, actions)
         VALUES ($1, $2, 'sira-auto', 'auto', $3)`,
        [playbook.id, alert.id, playbook.actions]
      );

      console.log(`[Alerts] Auto-triggered playbook ${playbook.id} for alert ${alert.id}`);
    }
  } catch (error) {
    console.error('[Alerts] Error checking auto-playbooks:', error);
  }
}

export default alertsRouter;
