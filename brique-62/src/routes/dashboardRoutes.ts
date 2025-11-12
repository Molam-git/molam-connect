import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import * as dashboardService from '../services/dashboardService';

const router = Router();

/**
 * GET /api/dashboard/:merchantId/widgets
 * Get all widgets for merchant user
 */
router.get(
  '/:merchantId/widgets',
  authzMiddleware,
  requireRole('merchant_admin', 'merchant_finance', 'merchant_support'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const userId = req.user!.id;

      const widgets = await dashboardService.getWidgets(merchantId, userId);
      res.json(widgets);
    } catch (error: any) {
      console.error('[Dashboard API] Error fetching widgets:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/:merchantId/widgets
 * Create a new widget
 */
router.post(
  '/:merchantId/widgets',
  authzMiddleware,
  requireRole('merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const userId = req.user!.id;
      const { widget_type, config, sort_order } = req.body;

      if (!widget_type) {
        res.status(400).json({ error: 'Missing widget_type' });
        return;
      }

      const widget = await dashboardService.upsertWidget({
        merchant_id: merchantId,
        user_id: userId,
        widget_type,
        config,
        sort_order,
      });

      res.status(201).json(widget);
    } catch (error: any) {
      console.error('[Dashboard API] Error creating widget:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * PUT /api/dashboard/widget/:id
 * Update widget configuration
 */
router.put(
  '/widget/:id',
  authzMiddleware,
  requireRole('merchant_admin', 'merchant_finance', 'merchant_support'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { config } = req.body;

      if (!config) {
        res.status(400).json({ error: 'Missing config' });
        return;
      }

      await dashboardService.updateWidgetConfig(id, config);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[Dashboard API] Error updating widget:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * DELETE /api/dashboard/widget/:id
 * Delete (hide) a widget
 */
router.delete(
  '/widget/:id',
  authzMiddleware,
  requireRole('merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await dashboardService.deleteWidget(id);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[Dashboard API] Error deleting widget:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/dashboard/:merchantId/tiles
 * Get real-time tiles (alerts, notifications)
 */
router.get(
  '/:merchantId/tiles',
  authzMiddleware,
  requireRole('merchant_admin', 'merchant_finance', 'merchant_support', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const tiles = await dashboardService.getTiles(merchantId, limit);
      res.json(tiles);
    } catch (error: any) {
      console.error('[Dashboard API] Error fetching tiles:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/tile/:id/acknowledge
 * Acknowledge a tile
 */
router.post(
  '/tile/:id/acknowledge',
  authzMiddleware,
  requireRole('merchant_admin', 'merchant_finance', 'merchant_support', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await dashboardService.acknowledgeTile(id, userId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[Dashboard API] Error acknowledging tile:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/dashboard/:merchantId/metrics
 * Get metrics summary
 */
router.get(
  '/:merchantId/metrics',
  authzMiddleware,
  requireRole('merchant_admin', 'merchant_finance', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { merchantId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const metrics = await dashboardService.getMetricsSummary(merchantId, days);
      res.json(metrics);
    } catch (error: any) {
      console.error('[Dashboard API] Error fetching metrics:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/dashboard/ops/rules
 * Get ops dashboard rules
 */
router.get(
  '/ops/rules',
  authzMiddleware,
  requireRole('billing_ops', 'merchant_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const scope = req.query.scope as string | undefined;
      const rules = await dashboardService.getOpsRules(scope);
      res.json(rules);
    } catch (error: any) {
      console.error('[Dashboard API] Error fetching ops rules:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/dashboard/ops/rules
 * Create or update ops rule
 */
router.post(
  '/ops/rules',
  authzMiddleware,
  requireRole('billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { rule_name, scope, rule_type, params, active } = req.body;

      if (!rule_name || !scope || !rule_type || !params) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const rule = await dashboardService.upsertOpsRule({
        rule_name,
        scope,
        rule_type,
        params,
        active,
        created_by: req.user!.id,
      });

      res.status(201).json(rule);
    } catch (error: any) {
      console.error('[Dashboard API] Error creating ops rule:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
