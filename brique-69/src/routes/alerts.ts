/**
 * Alerts API Routes
 * Manages analytics alerts and alert rules
 */

import { Router } from 'express';
import { AuthenticatedRequest, requirePermission, getMerchantFilter } from '../middleware/auth';
import { query } from '../services/db';
import { apiRequestDuration, apiRequestsTotal } from '../utils/metrics';

const router = Router();

/**
 * GET /api/analytics/alerts
 * Returns alerts with filtering
 */
router.get('/', requirePermission('analytics:view'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/alerts' });

  try {
    const {
      merchantId,
      status = 'open',
      severity,
      limit = 50,
      offset = 0,
    } = req.query as any;

    const effectiveMerchantId = getMerchantFilter(req, merchantId);

    const queryText = `
      SELECT
        id, source, alert_type, merchant_id, region, country,
        severity, metric, current_value, threshold_value,
        deviation_percent, title, description, payload,
        recommended_action, auto_action_taken, status,
        acknowledged_by, acknowledged_at, created_at, updated_at
      FROM analytics_alerts
      WHERE
        ($1::uuid IS NULL OR merchant_id = $1)
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR severity = $3)
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const result = await query(queryText, [
      effectiveMerchantId,
      status,
      severity || null,
      limit,
      offset,
    ]);

    apiRequestsTotal.inc({ method: 'GET', route: '/alerts', status: '200' });
    endTimer({ status: '200' });
    res.json({
      alerts: result.rows,
      total: result.rowCount,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in GET /alerts:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/alerts', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/analytics/alerts/:id
 * Update alert status (acknowledge, resolve, close)
 */
router.patch('/:id', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'PATCH', route: '/alerts/:id' });

  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    const validStatuses = ['open', 'acknowledged', 'investigating', 'resolved', 'closed', 'false_positive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let queryText: string;
    let params: any[];

    if (status === 'acknowledged') {
      queryText = `
        UPDATE analytics_alerts
        SET status = $1, acknowledged_by = $2, acknowledged_at = now(), updated_at = now()
        WHERE id = $3
        RETURNING *
      `;
      params = [status, req.user!.id, id];
    } else if (status === 'resolved' || status === 'closed') {
      queryText = `
        UPDATE analytics_alerts
        SET status = $1, resolved_by = $2, resolved_at = now(), resolution_notes = $3, updated_at = now()
        WHERE id = $4
        RETURNING *
      `;
      params = [status, req.user!.id, resolution_notes || null, id];
    } else {
      queryText = `
        UPDATE analytics_alerts
        SET status = $1, updated_at = now()
        WHERE id = $2
        RETURNING *
      `;
      params = [status, id];
    }

    const result = await query(queryText, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    apiRequestsTotal.inc({ method: 'PATCH', route: '/alerts/:id', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in PATCH /alerts/:id:', error);
    apiRequestsTotal.inc({ method: 'PATCH', route: '/alerts/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/alerts/rules
 * Returns alert rules
 */
router.get('/rules', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'GET', route: '/alerts/rules' });

  try {
    const { merchantId, is_active = true } = req.query as any;

    const queryText = `
      SELECT
        id, name, description, merchant_id, region, country,
        metric, comparator, threshold, window_minutes,
        severity, notify_channels, webhook_url, auto_actions,
        is_active, created_by, created_at, updated_at
      FROM analytics_alert_rules
      WHERE
        ($1::uuid IS NULL OR merchant_id = $1 OR merchant_id IS NULL)
        AND ($2::boolean IS NULL OR is_active = $2)
      ORDER BY created_at DESC
    `;

    const result = await query(queryText, [merchantId || null, is_active]);

    apiRequestsTotal.inc({ method: 'GET', route: '/alerts/rules', status: '200' });
    endTimer({ status: '200' });
    res.json(result.rows);
  } catch (error) {
    console.error('Error in GET /alerts/rules:', error);
    apiRequestsTotal.inc({ method: 'GET', route: '/alerts/rules', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/alerts/rules
 * Create a new alert rule
 */
router.post('/rules', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'POST', route: '/alerts/rules' });

  try {
    const {
      name,
      description,
      merchant_id,
      region,
      country,
      metric,
      comparator,
      threshold,
      window_minutes = 60,
      severity,
      notify_channels,
      webhook_url,
      auto_actions,
    } = req.body;

    // Validation
    if (!name || !metric || !comparator || threshold === undefined || !severity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validComparators = ['>', '<', '>=', '<=', '=', '!='];
    const validSeverities = ['info', 'warn', 'critical'];

    if (!validComparators.includes(comparator)) {
      return res.status(400).json({ error: 'Invalid comparator' });
    }

    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity' });
    }

    const queryText = `
      INSERT INTO analytics_alert_rules (
        name, description, merchant_id, region, country,
        metric, comparator, threshold, window_minutes,
        severity, notify_channels, webhook_url, auto_actions,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await query(queryText, [
      name,
      description || null,
      merchant_id || null,
      region || null,
      country || null,
      metric,
      comparator,
      threshold,
      window_minutes,
      severity,
      notify_channels ? JSON.stringify(notify_channels) : null,
      webhook_url || null,
      auto_actions ? JSON.stringify(auto_actions) : null,
      req.user!.id,
    ]);

    apiRequestsTotal.inc({ method: 'POST', route: '/alerts/rules', status: '201' });
    endTimer({ status: '201' });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error in POST /alerts/rules:', error);
    apiRequestsTotal.inc({ method: 'POST', route: '/alerts/rules', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/analytics/alerts/rules/:id
 * Delete (or deactivate) an alert rule
 */
router.delete('/rules/:id', requirePermission('analytics:ops'), async (req: AuthenticatedRequest, res) => {
  const endTimer = apiRequestDuration.startTimer({ method: 'DELETE', route: '/alerts/rules/:id' });

  try {
    const { id } = req.params;

    // Soft delete by setting is_active = false
    const queryText = `
      UPDATE analytics_alert_rules
      SET is_active = false, updated_at = now()
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(queryText, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    apiRequestsTotal.inc({ method: 'DELETE', route: '/alerts/rules/:id', status: '200' });
    endTimer({ status: '200' });
    res.json({ message: 'Rule deactivated', rule: result.rows[0] });
  } catch (error) {
    console.error('Error in DELETE /alerts/rules/:id:', error);
    apiRequestsTotal.inc({ method: 'DELETE', route: '/alerts/rules/:id', status: '500' });
    endTimer({ status: '500' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
