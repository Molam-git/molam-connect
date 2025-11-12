import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import * as analyticsService from '../services/analyticsService';
import * as churnService from '../services/churnService';

const router = Router();

/**
 * GET /api/analytics/subscriptions/metrics
 * Get subscription analytics metrics for a merchant
 */
router.get(
  '/subscriptions/metrics',
  authzMiddleware,
  requireRole('merchant_admin', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user!.merchantId!;
      const limit = parseInt(req.query.limit as string) || 12;

      const metrics = await analyticsService.getAnalytics(merchantId, limit);
      res.json(metrics);
    } catch (error: any) {
      console.error('[Analytics API] Error fetching metrics:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/analytics/subscriptions/metrics/calculate
 * Trigger analytics calculation for a merchant
 */
router.post(
  '/subscriptions/metrics/calculate',
  authzMiddleware,
  requireRole('billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user!.merchantId!;
      await analyticsService.calculateAnalytics(merchantId);
      res.json({ success: true, message: 'Analytics calculation triggered' });
    } catch (error: any) {
      console.error('[Analytics API] Error calculating metrics:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/analytics/subscriptions/churn
 * Get churn predictions for a merchant
 */
router.get(
  '/subscriptions/churn',
  authzMiddleware,
  requireRole('merchant_admin', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const merchantId = req.user!.merchantId!;
      const predictions = await churnService.getChurnPredictions(merchantId);
      res.json(predictions);
    } catch (error: any) {
      console.error('[Analytics API] Error fetching churn predictions:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/analytics/subscriptions/churn/:id/feedback
 * Submit feedback on a churn prediction
 */
router.post(
  '/subscriptions/churn/:id/feedback',
  authzMiddleware,
  requireRole('merchant_admin', 'billing_ops'),
  async (req: AuthRequest, res: Response) => {
    try {
      const churnPredictionId = req.params.id;
      const { action, details } = req.body;

      if (!action || !['approve', 'reject', 'modify'].includes(action)) {
        res.status(400).json({ error: 'Invalid action. Must be: approve, reject, or modify' });
        return;
      }

      await churnService.submitFeedback({
        churn_prediction_id: churnPredictionId,
        actor_id: req.user!.id,
        actor_role: req.user!.roles.includes('billing_ops') ? 'ops' : 'merchant',
        action,
        details: details || {},
      });

      res.json({ success: true, message: 'Feedback submitted successfully' });
    } catch (error: any) {
      console.error('[Analytics API] Error submitting feedback:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
