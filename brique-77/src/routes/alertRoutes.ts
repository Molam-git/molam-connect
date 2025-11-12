/**
 * Sous-Brique 77.1 - Alert API Routes
 *
 * REST API for real-time alerts and auto-remediation:
 * - List alerts
 * - Acknowledge/resolve alerts
 * - Manual remediation trigger
 * - Remediation policy CRUD
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as alertService from '../services/alertService';

const router = express.Router();

// =======================================================================
// MIDDLEWARE
// =======================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    type: string;
    roles?: string[];
  };
}

async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing authorization header' });
      return;
    }

    // TODO: Verify JWT
    req.user = {
      id: 'test-user-id',
      type: 'ops_user',
      roles: ['ops_admin'],
    };

    next();
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const hasRole = allowedRoles.some((role) => req.user!.roles?.includes(role));

    if (!hasRole) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

// =======================================================================
// ALERT ENDPOINTS
// =======================================================================

/**
 * GET /api/alerts
 * List alerts for tenant
 */
router.get(
  '/alerts',
  authenticateUser,
  [
    query('tenantType').isString(),
    query('tenantId').optional().isUUID(),
    query('status').optional().isIn(['open', 'acknowledged', 'resolved', 'suppressed', 'auto_remediated']),
    query('severity').optional().isArray(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, status, severity, limit, offset } = req.query;

      const alerts = await alertService.getAlerts({
        tenant_type: tenantType as string,
        tenant_id: tenantId as string,
        status: status as any,
        severity: severity as any[],
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json({
        success: true,
        alerts,
        count: alerts.length,
      });
    } catch (error: any) {
      console.error('[AlertAPI] List alerts failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post(
  '/alerts/:alertId/acknowledge',
  authenticateUser,
  [param('alertId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertId } = req.params;

      await alertService.acknowledgeAlert(alertId, req.user!.id);

      res.json({
        success: true,
        message: 'Alert acknowledged',
      });
    } catch (error: any) {
      console.error('[AlertAPI] Acknowledge failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/alerts/:alertId/resolve
 * Resolve an alert manually
 */
router.post(
  '/alerts/:alertId/resolve',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [param('alertId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertId } = req.params;

      await alertService.resolveAlert(alertId, req.user!.id);

      res.json({
        success: true,
        message: 'Alert resolved',
      });
    } catch (error: any) {
      console.error('[AlertAPI] Resolve failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/alerts/:alertId/remediate
 * Manually trigger remediation for an alert
 */
router.post(
  '/alerts/:alertId/remediate',
  authenticateUser,
  requireRole(['ops_admin']),
  [param('alertId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertId } = req.params;

      // Get alert
      const alertResult = await alertService.pool.query(
        `SELECT * FROM alerts WHERE id = $1`,
        [alertId]
      );

      if (alertResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Alert not found' });
        return;
      }

      const alert = alertResult.rows[0];

      // Manually trigger remediation (force execution)
      // TODO: Implement manual remediation trigger

      res.json({
        success: true,
        message: 'Remediation triggered',
        alert_id: alertId,
      });
    } catch (error: any) {
      console.error('[AlertAPI] Remediation failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// REMEDIATION POLICY ENDPOINTS
// =======================================================================

/**
 * GET /api/remediation-policies
 * List all remediation policies
 */
router.get(
  '/remediation-policies',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  async (req: Request, res: Response) => {
    try {
      const result = await alertService.pool.query(
        `SELECT * FROM remediation_policies ORDER BY alert_type`
      );

      res.json({
        success: true,
        policies: result.rows,
      });
    } catch (error: any) {
      console.error('[AlertAPI] List policies failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/remediation-policies/:alertType
 * Get specific remediation policy
 */
router.get(
  '/remediation-policies/:alertType',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [param('alertType').isString()],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { alertType } = req.params;

      const policy = await alertService.getPolicy(alertType as any);

      if (!policy) {
        res.status(404).json({ success: false, error: 'Policy not found' });
        return;
      }

      res.json({
        success: true,
        policy,
      });
    } catch (error: any) {
      console.error('[AlertAPI] Get policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * PUT /api/remediation-policies/:alertType
 * Update remediation policy
 */
router.put(
  '/remediation-policies/:alertType',
  authenticateUser,
  requireRole(['ops_admin']),
  [
    param('alertType').isString(),
    body('enabled').optional().isBoolean(),
    body('auto_action').optional().isObject(),
    body('auto_threshold').optional().isFloat({ min: 0, max: 1 }),
    body('cooldown_seconds').optional().isInt({ min: 0 }),
    body('require_multi_sig').optional().isBoolean(),
    body('required_approvals').optional().isInt({ min: 1 }),
    body('notify_channels').optional().isArray(),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertType } = req.params;
      const updates = req.body;

      const policy = await alertService.updatePolicy(
        alertType as any,
        updates,
        req.user!.id
      );

      res.json({
        success: true,
        policy,
        message: 'Policy updated successfully',
      });
    } catch (error: any) {
      console.error('[AlertAPI] Update policy failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// METRICS & STATS
// =======================================================================

/**
 * GET /api/alerts/stats
 * Get alert statistics
 */
router.get(
  '/alerts/stats',
  authenticateUser,
  [
    query('tenantType').optional().isString(),
    query('tenantId').optional().isUUID(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId } = req.query;

      // Get active alerts count by severity
      const activeAlertsResult = await alertService.pool.query(
        `SELECT * FROM get_active_alerts_count($1, $2)`,
        [tenantType || 'platform', tenantId || null]
      );

      // Get auto-remediation stats
      const remediationStatsResult = await alertService.pool.query(
        `SELECT * FROM auto_remediation_stats`
      );

      res.json({
        success: true,
        active_alerts_by_severity: activeAlertsResult.rows,
        auto_remediation_stats: remediationStatsResult.rows,
      });
    } catch (error: any) {
      console.error('[AlertAPI] Get stats failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// HEALTH CHECK
// =======================================================================

router.get('/alerts/health', async (req: Request, res: Response) => {
  try {
    await alertService.pool.query('SELECT 1');

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

export default router;
