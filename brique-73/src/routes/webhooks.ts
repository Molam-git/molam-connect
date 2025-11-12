/**
 * Webhook Management Routes
 * Brique 73 - Unified Webhooks + Observability + SIRA Guard
 */

import express, { Request, Response } from 'express';
import { requireRole } from '../utils/authz';
import {
  createWebhook,
  getWebhook,
  listWebhooksForApp,
  updateWebhook,
  deleteWebhook,
  queueWebhookDelivery,
  getWebhookMetrics,
} from '../services/webhooks';
import { analyzeWebhookHealth } from '../services/siraGuard';
import { pool } from '../db';

const router = express.Router();

// ========================================
// Webhook CRUD
// ========================================

/**
 * POST /webhooks
 * Create a new webhook
 */
router.post('/', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { appId, tenantType, tenantId, url, eventTypes, description, customHeaders } = req.body;

    // Validate required fields
    if (!appId || !tenantType || !tenantId || !url || !eventTypes) {
      return res.status(400).json({
        error: 'Missing required fields: appId, tenantType, tenantId, url, eventTypes',
      });
    }

    // Verify user has access to this app
    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'App not found or access denied' });
    }

    const webhook = await createWebhook({
      appId,
      tenantType,
      tenantId,
      url,
      eventTypes,
      description,
      customHeaders,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret, // Only returned once!
        eventTypes: webhook.eventTypes,
        enabled: webhook.enabled,
        retryConfig: webhook.retryConfig,
        createdAt: webhook.createdAt,
      },
      message: 'Webhook created. Save the secret securely - it will not be shown again.',
    });
  } catch (error: any) {
    console.error('Failed to create webhook', error);
    res.status(500).json({ error: error.message || 'Failed to create webhook' });
  }
});

/**
 * GET /webhooks/:webhookId
 * Get webhook details
 */
router.get('/:webhookId', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;

    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    // Verify user has access
    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ success: true, webhook });
  } catch (error: any) {
    console.error('Failed to get webhook', error);
    res.status(500).json({ error: error.message || 'Failed to get webhook' });
  }
});

/**
 * GET /apps/:appId/webhooks
 * List all webhooks for an app
 */
router.get('/apps/:appId/webhooks', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { appId } = req.params;

    // Verify user has access to this app
    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'App not found or access denied' });
    }

    const webhooks = await listWebhooksForApp(appId);

    res.json({
      success: true,
      webhooks,
      count: webhooks.length,
    });
  } catch (error: any) {
    console.error('Failed to list webhooks', error);
    res.status(500).json({ error: error.message || 'Failed to list webhooks' });
  }
});

/**
 * PATCH /webhooks/:webhookId
 * Update webhook configuration
 */
router.patch('/:webhookId', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { url, enabled, eventTypes } = req.body;

    // Verify webhook exists and user has access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await updateWebhook(webhookId, { url, enabled, eventTypes });

    res.json({
      success: true,
      message: 'Webhook updated successfully',
    });
  } catch (error: any) {
    console.error('Failed to update webhook', error);
    res.status(500).json({ error: error.message || 'Failed to update webhook' });
  }
});

/**
 * DELETE /webhooks/:webhookId
 * Delete a webhook
 */
router.delete('/:webhookId', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;

    // Verify webhook exists and user has access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await deleteWebhook(webhookId);

    res.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error: any) {
    console.error('Failed to delete webhook', error);
    res.status(500).json({ error: error.message || 'Failed to delete webhook' });
  }
});

// ========================================
// Webhook Deliveries & Monitoring
// ========================================

/**
 * GET /webhooks/:webhookId/deliveries
 * Get delivery history for a webhook
 */
router.get('/:webhookId/deliveries', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { limit = 50, offset = 0, status } = req.query;

    // Verify access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Query deliveries
    let query = `
      SELECT id, event_type, event_id, status, attempts, max_attempts,
             response_code, latency_ms, error_type, error_message,
             created_at, last_attempt_at, delivered_at, next_retry_at
      FROM webhook_deliveries
      WHERE webhook_id = $1
    `;
    const params: any[] = [webhookId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      deliveries: result.rows,
      count: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Failed to get deliveries', error);
    res.status(500).json({ error: error.message || 'Failed to get deliveries' });
  }
});

/**
 * GET /webhooks/:webhookId/metrics
 * Get performance metrics and health status (B73bis integration)
 */
router.get('/:webhookId/metrics', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;
    const { periodHours = 24 } = req.query;

    // Verify access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get metrics from observability layer
    const metrics = await getWebhookMetrics(webhookId, parseInt(periodHours as string));

    res.json({
      success: true,
      metrics,
      periodHours: parseInt(periodHours as string),
    });
  } catch (error: any) {
    console.error('Failed to get webhook metrics', error);
    res.status(500).json({ error: error.message || 'Failed to get metrics' });
  }
});

/**
 * GET /webhooks/:webhookId/health
 * Run SIRA Guard health analysis on webhook
 */
router.get('/:webhookId/health', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;

    // Verify access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Gather stats for SIRA analysis
    const stats = await pool.query(
      `SELECT
         COUNT(*) as total_deliveries,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful_deliveries,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries,
         AVG(latency_ms) as avg_latency,
         MAX(latency_ms) as max_latency,
         jsonb_object_agg(COALESCE(error_type, 'none'), COUNT(*)) as error_types
       FROM webhook_deliveries
       WHERE webhook_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [webhookId]
    );

    // Get consecutive failures
    const consecutiveResult = await pool.query(
      `SELECT COUNT(*) as consecutive_failures
       FROM webhook_deliveries
       WHERE webhook_id = $1
         AND status = 'failed'
         AND created_at >= (
           SELECT COALESCE(MAX(created_at), NOW() - INTERVAL '1 day')
           FROM webhook_deliveries
           WHERE webhook_id = $1 AND status = 'delivered'
         )`,
      [webhookId]
    );

    const row = stats.rows[0];
    const healthAnalysis = await analyzeWebhookHealth({
      webhookId,
      totalDeliveries: parseInt(row.total_deliveries) || 0,
      successfulDeliveries: parseInt(row.successful_deliveries) || 0,
      failedDeliveries: parseInt(row.failed_deliveries) || 0,
      avgLatency: parseFloat(row.avg_latency) || 0,
      maxLatency: parseFloat(row.max_latency) || 0,
      errorTypes: row.error_types || {},
      consecutiveFailures: parseInt(consecutiveResult.rows[0].consecutive_failures) || 0,
    });

    res.json({
      success: true,
      health: {
        status: healthAnalysis.suspicious ? 'warning' : 'healthy',
        anomalyScore: healthAnalysis.anomalyScore,
        events: healthAnalysis.events,
        actionTaken: healthAnalysis.actionTaken,
        recommendations: healthAnalysis.recommendations,
      },
    });
  } catch (error: any) {
    console.error('Failed to analyze webhook health', error);
    res.status(500).json({ error: error.message || 'Failed to analyze health' });
  }
});

/**
 * POST /webhooks/:webhookId/test
 * Send a test webhook delivery
 */
router.post('/:webhookId/test', requireRole(['dev_admin', 'merchant_admin']), async (req: any, res: Response) => {
  try {
    const { webhookId } = req.params;

    // Verify access
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const appCheck = await pool.query(
      `SELECT id FROM dev_apps WHERE id = $1 AND tenant_id = $2`,
      [webhook.appId, req.user.tenantId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Queue test event
    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhookId,
      },
    };

    await queueWebhookDelivery(
      'webhook.test',
      `test-${Date.now()}`,
      testPayload,
      webhook.tenantType,
      webhook.tenantId
    );

    res.json({
      success: true,
      message: 'Test webhook queued for delivery',
      payload: testPayload,
    });
  } catch (error: any) {
    console.error('Failed to send test webhook', error);
    res.status(500).json({ error: error.message || 'Failed to send test webhook' });
  }
});

// ========================================
// Available Events
// ========================================

/**
 * GET /webhook-events
 * List all available webhook events
 */
router.get('/webhook-events', requireRole(['dev_admin', 'merchant_admin']), async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT event_type, category, description, example_payload
       FROM webhook_events
       WHERE enabled = TRUE
       ORDER BY category, event_type`
    );

    res.json({
      success: true,
      events: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error('Failed to list webhook events', error);
    res.status(500).json({ error: error.message || 'Failed to list events' });
  }
});

export default router;
