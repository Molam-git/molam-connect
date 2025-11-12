/**
 * Brique 77 - Dashboard API Routes
 *
 * REST API for real-time unified dashboard:
 * - Overview & snapshots
 * - Metrics time-series
 * - Ops actions (create, approve, execute)
 * - Alerts management
 * - SIRA recommendations
 * - Widget data
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as dashService from '../services/dashboardService';

const router = express.Router();

// =======================================================================
// MIDDLEWARE
// =======================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    type: 'merchant' | 'ops_user' | 'finance_ops' | 'pay_admin';
    email?: string;
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
      res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
      return;
    }

    // TODO: Verify JWT with Molam ID service
    req.user = {
      id: 'test-user-id',
      type: 'ops_user',
      email: 'ops@molam.app',
      roles: ['ops_admin', 'pay_admin'],
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

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', required_roles: allowedRoles });
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
// DASHBOARD OVERVIEW
// =======================================================================

/**
 * GET /api/dashboard/overview
 * Get dashboard snapshot (precomputed KPIs)
 */
router.get(
  '/dashboard/overview',
  authenticateUser,
  [
    query('tenantType').isIn(['platform', 'merchant', 'agent', 'bank', 'region']),
    query('tenantId').optional().isUUID(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId } = req.query;

      const snapshot = await dashService.getDashboardSnapshot(
        tenantType as any,
        tenantId as string
      );

      if (!snapshot) {
        res.status(404).json({ success: false, error: 'Snapshot not found' });
        return;
      }

      res.json({
        success: true,
        snapshot: snapshot.payload,
        snapshot_ts: snapshot.snapshot_ts,
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Overview failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * GET /api/dashboard/metrics/:metric/timeseries
 * Get time-series data for a specific metric
 */
router.get(
  '/dashboard/metrics/:metric/timeseries',
  authenticateUser,
  [
    param('metric').isString(),
    query('tenantType').isIn(['platform', 'merchant', 'agent', 'bank', 'region']),
    query('tenantId').optional().isUUID(),
    query('timeRange').optional().matches(/^\d+(h|d|w|m)$/),
    query('groupBy').optional().isIn(['hour', 'day']),
    query('country').optional().isString(),
    query('region').optional().isString(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { metric } = req.params;
      const { tenantType, tenantId, timeRange = '7d', groupBy = 'day', country, region } = req.query;

      const timeSeries = await dashService.getMetricTimeSeries({
        tenant_type: tenantType as any,
        tenant_id: tenantId as string,
        metric: metric as any,
        time_range: timeRange as string,
        group_by: groupBy as 'hour' | 'day',
        country: country as string,
        region: region as string,
      });

      res.json({
        success: true,
        metric,
        time_range: timeRange,
        group_by: groupBy,
        data: timeSeries,
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Timeseries failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// OPS ACTIONS
// =======================================================================

/**
 * POST /api/dashboard/ops/actions
 * Create an ops action request
 */
router.post(
  '/dashboard/ops/actions',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin', 'finance_ops']),
  [
    body('action_type').isString(),
    body('target').isObject(),
    body('params').optional().isObject(),
    body('risk_level').optional().isIn(['low', 'medium', 'high', 'critical']),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { action_type, target, params, risk_level } = req.body;

      const action = await dashService.createOpsAction({
        actor_id: req.user!.id,
        actor_role: req.user!.roles!.join(','),
        actor_email: req.user!.email,
        action_type,
        target,
        params,
        risk_level,
      });

      res.status(201).json({
        success: true,
        action,
        message: 'Ops action requested. Awaiting approvals.',
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Action creation failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/ops/actions/:actionId/approve
 * Approve an ops action (multi-sig)
 */
router.post(
  '/dashboard/ops/actions/:actionId/approve',
  authenticateUser,
  requireRole(['ops_admin', 'pay_admin']),
  [param('actionId').isUUID(), body('comment').optional().isString()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { actionId } = req.params;
      const { comment } = req.body;

      const action = await dashService.approveOpsAction({
        action_id: actionId,
        approver_id: req.user!.id,
        comment,
      });

      res.json({
        success: true,
        action,
        message:
          action.status === 'approved'
            ? 'Action approved and ready for execution'
            : 'Approval recorded. Additional approvals required.',
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Action approval failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/ops/actions/:actionId/execute
 * Execute an approved ops action
 */
router.post(
  '/dashboard/ops/actions/:actionId/execute',
  authenticateUser,
  requireRole(['ops_admin']),
  [param('actionId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { actionId } = req.params;

      const action = await dashService.executeOpsAction({
        action_id: actionId,
        executor_id: req.user!.id,
      });

      res.json({
        success: true,
        action,
        message: 'Action execution started. Check status for completion.',
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Action execution failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// ALERTS
// =======================================================================

/**
 * GET /api/dashboard/alerts
 * Get alerts for a tenant
 */
router.get(
  '/dashboard/alerts',
  authenticateUser,
  [
    query('tenantType').isIn(['platform', 'merchant', 'agent', 'bank', 'region']),
    query('tenantId').optional().isUUID(),
    query('status').optional().isIn(['open', 'acknowledged', 'resolved', 'dismissed']),
    query('severity').optional().isArray(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, status, severity, limit } = req.query;

      const alerts = await dashService.getAlerts({
        tenant_type: tenantType as any,
        tenant_id: tenantId as string,
        status: status as any,
        severity: severity as string[],
        limit: limit ? parseInt(limit as string) : 50,
      });

      res.json({
        success: true,
        alerts,
        count: alerts.length,
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Alerts fetch failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post(
  '/dashboard/alerts/:alertId/acknowledge',
  authenticateUser,
  [param('alertId').isUUID()],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { alertId } = req.params;

      await dashService.acknowledgeAlert({
        alert_id: alertId,
        user_id: req.user!.id,
      });

      res.json({
        success: true,
        message: 'Alert acknowledged',
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Alert acknowledge failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// SIRA RECOMMENDATIONS
// =======================================================================

/**
 * GET /api/dashboard/sira/recommendations
 * Get SIRA recommendations
 */
router.get(
  '/dashboard/sira/recommendations',
  authenticateUser,
  [
    query('tenantType').isIn(['platform', 'merchant', 'agent', 'bank', 'region']),
    query('tenantId').optional().isUUID(),
    query('status').optional().isIn(['pending', 'applied', 'rejected']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { tenantType, tenantId, status, limit } = req.query;

      const recommendations = await dashService.getSiraRecommendations({
        tenant_type: tenantType as any,
        tenant_id: tenantId as string,
        status: status as any,
        limit: limit ? parseInt(limit as string) : 50,
      });

      res.json({
        success: true,
        recommendations,
        count: recommendations.length,
      });
    } catch (error: any) {
      console.error('[DashboardAPI] SIRA recommendations fetch failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// WIDGETS
// =======================================================================

/**
 * GET /api/dashboard/widgets/:widgetId/data
 * Get widget data
 */
router.get(
  '/dashboard/widgets/:widgetId/data',
  authenticateUser,
  [
    param('widgetId').isUUID(),
    query('tenantType').isIn(['platform', 'merchant', 'agent', 'bank', 'region']),
    query('tenantId').optional().isUUID(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { widgetId } = req.params;
      const { tenantType, tenantId } = req.query;

      const data = await dashService.getWidgetData({
        widget_id: widgetId,
        tenant_type: tenantType as any,
        tenant_id: tenantId as string,
      });

      res.json({
        success: true,
        widget_id: widgetId,
        data,
      });
    } catch (error: any) {
      console.error('[DashboardAPI] Widget data fetch failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// =======================================================================
// HEALTH CHECK
// =======================================================================

router.get('/dashboard/health', async (req: Request, res: Response) => {
  try {
    await dashService.pool.query('SELECT 1');

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
