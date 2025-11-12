/**
 * Brique 76 - Notification API Routes
 *
 * REST API for:
 * - Template management (CRUD)
 * - User preferences (GDPR-compliant)
 * - Notification dispatch
 * - In-app notifications
 * - Delivery tracking
 * - Engagement tracking
 * - Ops dashboard
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as notifEngine from '../services/notificationEngine';
import { Pool } from 'pg';

const router = express.Router();

// PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// =====================================================================
// MIDDLEWARE
// =====================================================================

/**
 * Authentication middleware (checks JWT from Molam ID)
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    type: 'merchant' | 'ops_user' | 'customer' | 'connect_account';
    email?: string;
    roles?: string[];
  };
  ip_address?: string;
  user_agent?: string;
}

async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    // TODO: Verify JWT with Molam ID service
    // For now, mock authentication
    const decoded = {
      id: 'test-user-id',
      type: 'merchant' as const,
      email: 'test@example.com',
      roles: ['merchant'],
    };

    req.user = decoded;
    req.ip_address = req.ip;
    req.user_agent = req.headers['user-agent'];

    next();
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Authentication failed', details: error.message });
  }
}

/**
 * Role-based authorization middleware
 */
function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required_roles: allowedRoles,
      });
      return;
    }

    next();
  };
}

/**
 * Validation error handler
 */
function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

// =====================================================================
// NOTIFICATION DISPATCH ENDPOINTS
// =====================================================================

/**
 * POST /api/notifications
 * Create and dispatch a notification
 */
router.post(
  '/notifications',
  authenticateUser,
  [
    body('template_key').isString().notEmpty(),
    body('template_version').optional().isInt({ min: 1 }),
    body('recipient_type').isIn(['merchant', 'ops_user', 'customer', 'connect_account']),
    body('recipient_id').isUUID(),
    body('channels').optional().isArray(),
    body('channels.*').optional().isIn(['email', 'sms', 'push', 'in_app', 'webhook']),
    body('priority').optional().isIn(['critical', 'high', 'normal', 'low']),
    body('variables').isObject(),
    body('language_override').optional().isIn(['fr', 'en', 'pt', 'es']),
    body('send_at').optional().isISO8601(),
    body('idempotency_key').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const notification = await notifEngine.createNotification({
        template_key: req.body.template_key,
        template_version: req.body.template_version,
        recipient_type: req.body.recipient_type,
        recipient_id: req.body.recipient_id,
        channels: req.body.channels,
        priority: req.body.priority || 'normal',
        variables: req.body.variables,
        language_override: req.body.language_override,
        send_at: req.body.send_at ? new Date(req.body.send_at) : undefined,
        idempotency_key: req.body.idempotency_key,
        context: req.body.context,
        created_by: req.user!.id,
      });

      res.status(201).json({
        success: true,
        notification,
        message: 'Notification created and dispatched',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Notification creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Notification creation failed',
        details: error.message,
      });
    }
  }
);

/**
 * GET /api/notifications/:requestId
 * Get notification request details
 */
router.get(
  '/notifications/:requestId',
  authenticateUser,
  [param('requestId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await notifEngine.getNotificationRequest(req.params.requestId);

      if (!request) {
        res.status(404).json({ success: false, error: 'Notification request not found' });
        return;
      }

      const deliveries = await notifEngine.getDeliveriesForRequest(req.params.requestId);

      res.json({
        success: true,
        request,
        deliveries,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get notification:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/notifications/:requestId/deliveries
 * Get deliveries for a notification request
 */
router.get(
  '/notifications/:requestId/deliveries',
  authenticateUser,
  [param('requestId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const deliveries = await notifEngine.getDeliveriesForRequest(req.params.requestId);

      res.json({
        success: true,
        deliveries,
        count: deliveries.length,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get deliveries:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// IN-APP NOTIFICATIONS ENDPOINTS
// =====================================================================

/**
 * GET /api/notifications/in-app
 * Get in-app notifications for current user
 */
router.get(
  '/notifications/in-app',
  authenticateUser,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const notifications = await notifEngine.getInAppNotifications(
        req.user!.type,
        req.user!.id,
        limit,
        offset
      );

      const unreadCount = await notifEngine.getUnreadCount(req.user!.type, req.user!.id);

      res.json({
        success: true,
        notifications,
        unread_count: unreadCount,
        pagination: {
          limit,
          offset,
          total: notifications.length,
        },
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get in-app notifications:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/notifications/in-app/:notificationId/read
 * Mark in-app notification as read
 */
router.post(
  '/notifications/in-app/:notificationId/read',
  authenticateUser,
  [param('notificationId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await notifEngine.markNotificationAsRead(req.params.notificationId);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to mark as read:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/notifications/in-app/unread-count
 * Get unread notification count for current user
 */
router.get(
  '/notifications/in-app/unread-count',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const count = await notifEngine.getUnreadCount(req.user!.type, req.user!.id);

      res.json({
        success: true,
        unread_count: count,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get unread count:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// USER PREFERENCES ENDPOINTS
// =====================================================================

/**
 * GET /api/notifications/preferences
 * Get current user's notification preferences
 */
router.get(
  '/notifications/preferences',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT * FROM notif_preferences WHERE user_type = $1 AND user_id = $2`,
        [req.user!.type, req.user!.id]
      );

      const preferences = result.rows[0] || null;

      res.json({
        success: true,
        preferences,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get preferences:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PUT /api/notifications/preferences
 * Update current user's notification preferences
 */
router.put(
  '/notifications/preferences',
  authenticateUser,
  [
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('email_enabled').optional().isBoolean(),
    body('sms_enabled').optional().isBoolean(),
    body('push_enabled').optional().isBoolean(),
    body('in_app_enabled').optional().isBoolean(),
    body('webhook_enabled').optional().isBoolean(),
    body('category_preferences').optional().isObject(),
    body('granular_preferences').optional().isObject(),
    body('quiet_hours_enabled').optional().isBoolean(),
    body('quiet_hours_start').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('quiet_hours_end').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('quiet_hours_timezone').optional().isString(),
    body('preferred_language').optional().isIn(['fr', 'en', 'pt', 'es']),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preferences = await notifEngine.updateUserPreferences(
        req.user!.type,
        req.user!.id,
        req.body
      );

      res.json({
        success: true,
        preferences,
        message: 'Preferences updated successfully',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to update preferences:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/notifications/unsubscribe/:token
 * Unsubscribe using token (GDPR one-click)
 */
router.get(
  '/notifications/unsubscribe/:token',
  [
    param('token').isString(),
    query('channel').optional().isIn(['email', 'sms', 'push', 'in_app']),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await notifEngine.unsubscribeByToken(
        req.params.token,
        req.query.channel as any
      );

      res.json({
        success: true,
        message: 'Successfully unsubscribed',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Unsubscribe failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// ENGAGEMENT TRACKING ENDPOINTS
// =====================================================================

/**
 * POST /api/notifications/track/opened
 * Track notification opened event
 */
router.post(
  '/notifications/track/opened',
  [body('delivery_id').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await notifEngine.recordEngagement(req.body.delivery_id, 'opened');

      res.json({
        success: true,
        message: 'Engagement tracked',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to track opened:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/notifications/track/clicked
 * Track notification clicked event
 */
router.post(
  '/notifications/track/clicked',
  [body('delivery_id').isUUID(), body('url').optional().isURL()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      await notifEngine.recordEngagement(
        req.body.delivery_id,
        'clicked',
        req.body.url
      );

      res.json({
        success: true,
        message: 'Click tracked',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to track click:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// TEMPLATE MANAGEMENT ENDPOINTS (OPS ONLY)
// =====================================================================

/**
 * GET /api/ops/notifications/templates
 * List all notification templates
 */
router.get(
  '/ops/notifications/templates',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [
    query('scope').optional().isIn(['global', 'merchant', 'ops']),
    query('status').optional().isIn(['draft', 'active', 'archived', 'deprecated']),
    query('category').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { scope, status, category, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM notif_templates WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (scope) {
        query += ` AND scope = $${paramIndex}`;
        params.push(scope);
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      query += ` ORDER BY template_key, version DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        templates: result.rows,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.rows.length,
        },
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to list templates:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/notifications/templates/:templateId
 * Get specific template
 */
router.get(
  '/ops/notifications/templates/:templateId',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [param('templateId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        'SELECT * FROM notif_templates WHERE id = $1',
        [req.params.templateId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        template: result.rows[0],
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get template:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/ops/notifications/templates
 * Create a new notification template
 */
router.post(
  '/ops/notifications/templates',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [
    body('template_key').isString().notEmpty(),
    body('version').optional().isInt({ min: 1 }),
    body('scope').isIn(['global', 'merchant', 'ops']),
    body('scope_id').optional().isUUID(),
    body('category').isIn([
      'transaction',
      'account',
      'security',
      'marketing',
      'operational',
      'compliance',
      'fraud_alert',
      'payout',
      'subscription',
    ]),
    body('channels').isArray(),
    body('channels.*').isIn(['email', 'sms', 'push', 'in_app', 'webhook']),
    body('content').isObject(),
    body('variables').isArray(),
    body('status').optional().isIn(['draft', 'active', 'archived', 'deprecated']),
    body('is_default').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await pool.query(
        `INSERT INTO notif_templates (
          template_key, version, scope, scope_id, category, channels,
          content, variables, status, is_default, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          req.body.template_key,
          req.body.version || 1,
          req.body.scope,
          req.body.scope_id,
          req.body.category,
          req.body.channels,
          JSON.stringify(req.body.content),
          req.body.variables,
          req.body.status || 'draft',
          req.body.is_default || false,
          req.user!.id,
        ]
      );

      res.status(201).json({
        success: true,
        template: result.rows[0],
        message: 'Template created successfully',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to create template:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PUT /api/ops/notifications/templates/:templateId
 * Update a notification template
 */
router.put(
  '/ops/notifications/templates/:templateId',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [
    param('templateId').isUUID(),
    body('content').optional().isObject(),
    body('variables').optional().isArray(),
    body('status').optional().isIn(['draft', 'active', 'archived', 'deprecated']),
    body('is_default').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(req.body)) {
        if (['content', 'variables'].includes(key)) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }

      if (fields.length === 0) {
        res.status(400).json({ success: false, error: 'No fields to update' });
        return;
      }

      fields.push(`updated_by = $${paramIndex}`);
      values.push(req.user!.id);
      paramIndex++;

      values.push(req.params.templateId);

      const result = await pool.query(
        `UPDATE notif_templates
         SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        template: result.rows[0],
        message: 'Template updated successfully',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to update template:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * DELETE /api/ops/notifications/templates/:templateId
 * Delete/archive a notification template
 */
router.delete(
  '/ops/notifications/templates/:templateId',
  authenticateUser,
  requireRole(['ops_admin']),
  [param('templateId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `UPDATE notif_templates SET status = 'archived', updated_at = now()
         WHERE id = $1 RETURNING *`,
        [req.params.templateId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }

      res.json({
        success: true,
        message: 'Template archived successfully',
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to archive template:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// OPS DASHBOARD ENDPOINTS
// =====================================================================

/**
 * GET /api/ops/notifications/stats
 * Get aggregated notification statistics
 */
router.get(
  '/ops/notifications/stats',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('template_key').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { start_date, end_date, template_key } = req.query;

      let query = 'SELECT * FROM notif_template_stats WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (template_key) {
        query += ` AND template_key = $${paramIndex}`;
        params.push(template_key);
        paramIndex++;
      }

      const result = await pool.query(query, params);

      res.json({
        success: true,
        stats: result.rows,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/notifications/deliveries
 * Get delivery logs (Ops dashboard)
 */
router.get(
  '/ops/notifications/deliveries',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [
    query('status').optional().isString(),
    query('channel').optional().isIn(['email', 'sms', 'push', 'in_app', 'webhook']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { status, channel, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM notif_deliveries WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (channel) {
        query += ` AND channel = $${paramIndex}`;
        params.push(channel);
        paramIndex++;
      }

      query += ` ORDER BY queued_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        deliveries: result.rows,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: result.rows.length,
        },
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get deliveries:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/ops/notifications/merchant/:merchantId/dashboard
 * Get notification dashboard for specific merchant
 */
router.get(
  '/ops/notifications/merchant/:merchantId/dashboard',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [param('merchantId').isUUID()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        'SELECT * FROM merchant_notif_dashboard WHERE merchant_id = $1',
        [req.params.merchantId]
      );

      res.json({
        success: true,
        dashboard: result.rows[0] || null,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to get merchant dashboard:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/ops/notifications/retry-failed
 * Manually trigger retry for failed deliveries
 */
router.post(
  '/ops/notifications/retry-failed',
  authenticateUser,
  requireRole(['ops_admin']),
  async (req: Request, res: Response) => {
    try {
      const retried = await notifEngine.retryFailedDeliveries();

      res.json({
        success: true,
        retried_count: retried,
        message: `Retried ${retried} failed deliveries`,
      });
    } catch (error: any) {
      console.error('[NotifAPI] Failed to retry deliveries:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =====================================================================
// HEALTH CHECK
// =====================================================================

/**
 * GET /api/notifications/health
 * Health check endpoint
 */
router.get('/notifications/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// =====================================================================
// EXPORT
// =====================================================================

export default router;
