import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import * as subscriptionsService from '../services/subscriptionsService';

const router = Router();

/**
 * POST /api/subscriptions/plans - Create a plan
 */
router.post('/plans', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { sku, name, description, amount, currency, frequency, trial_days } = req.body;

    if (!sku || !name || !amount || !currency || !frequency) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const plan = await subscriptionsService.createPlan({
      merchant_id: merchantId,
      sku,
      name,
      description,
      amount: parseFloat(amount),
      currency,
      frequency,
      trial_days: trial_days ? parseInt(trial_days, 10) : 0,
    });

    res.status(201).json(plan);
  } catch (error: any) {
    console.error('[Routes] Error creating plan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subscriptions/plans - List plans
 */
router.get('/plans', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const plans = await subscriptionsService.listPlans(merchantId);
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions - Create a subscription
 */
router.post('/', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      res.status(400).json({ error: 'Idempotency-Key header required' });
      return;
    }

    const merchantId = req.user!.merchantId!;
    const { customer_id, plan_id, quantity, start_now } = req.body;

    if (!customer_id || !plan_id) {
      res.status(400).json({ error: 'Missing customer_id or plan_id' });
      return;
    }

    const subscription = await subscriptionsService.createSubscription({
      merchant_id: merchantId,
      customer_id,
      plan_id,
      quantity: quantity ? parseInt(quantity, 10) : 1,
      start_now: start_now !== false,
    });

    res.status(201).json(subscription);
  } catch (error: any) {
    console.error('[Routes] Error creating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subscriptions - List subscriptions
 */
router.get('/', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const subscriptions = await subscriptionsService.listSubscriptions(merchantId);
    res.json(subscriptions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/subscriptions/:id - Get subscription details
 */
router.get('/:id', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const subscription = await subscriptionsService.getSubscription(id);

    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    res.json(subscription);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions/:id/cancel - Cancel a subscription
 */
router.post('/:id/cancel', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { immediately, reason } = req.body;

    const subscription = await subscriptionsService.cancelSubscription(
      id,
      immediately === true,
      reason
    );

    res.json(subscription);
  } catch (error: any) {
    console.error('[Routes] Error cancelling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
