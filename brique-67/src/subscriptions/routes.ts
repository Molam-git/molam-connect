import express from 'express';
import {
  createSubscriptionForMerchant,
  changePlan,
  cancelSubscription,
  recordUsage,
  getSubscriptionById,
  listSubscriptionsByMerchant,
  getSubscriptionStats,
} from './service';
import { pool } from '../utils/db';

export const subscriptionsRouter = express.Router();

/**
 * POST /api/subscriptions
 * Create a new subscription (requires Idempotency-Key)
 */
subscriptionsRouter.post('/', async (req, res) => {
  try {
    const idempotency = req.headers['idempotency-key'] as string;

    if (!idempotency) {
      return res.status(400).json({ error: 'idempotency_key_required' });
    }

    const { merchant_id, ...payload } = req.body;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id_required' });
    }

    const result = await createSubscriptionForMerchant({
      merchantId: merchant_id,
      payload,
      idempotency,
    });

    return res.status(201).json(result);
  } catch (e: any) {
    console.error('Error creating subscription:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions/:id
 * Get subscription by ID
 */
subscriptionsRouter.get('/:id', async (req, res) => {
  try {
    const subscription = await getSubscriptionById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ error: 'subscription_not_found' });
    }

    return res.json(subscription);
  } catch (e: any) {
    console.error('Error fetching subscription:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions
 * List subscriptions for merchant
 */
subscriptionsRouter.get('/', async (req, res) => {
  try {
    const { merchant_id, status, customer_id, limit, offset } = req.query;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id_required' });
    }

    const subscriptions = await listSubscriptionsByMerchant(merchant_id as string, {
      status: status as string,
      customer_id: customer_id as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    return res.json(subscriptions);
  } catch (e: any) {
    console.error('Error listing subscriptions:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/subscriptions/:id/change-plan
 * Change subscription plan
 */
subscriptionsRouter.post('/:id/change-plan', async (req, res) => {
  try {
    const { new_plan_id, effective_immediately, actor } = req.body;

    if (!new_plan_id) {
      return res.status(400).json({ error: 'new_plan_id_required' });
    }

    const result = await changePlan(req.params.id, actor || 'system', new_plan_id, {
      effectiveImmediately: effective_immediately,
    });

    return res.json(result);
  } catch (e: any) {
    console.error('Error changing plan:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
subscriptionsRouter.post('/:id/cancel', async (req, res) => {
  try {
    const { cancel_at_period_end, reason, actor } = req.body;

    const result = await cancelSubscription(req.params.id, actor || 'system', {
      cancel_at_period_end,
      reason,
    });

    return res.json(result);
  } catch (e: any) {
    console.error('Error canceling subscription:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/subscriptions/:id/usage
 * Record usage for metered billing
 */
subscriptionsRouter.post('/:id/usage', async (req, res) => {
  try {
    const { period_start, period_end, unit_count, description, unit_price } = req.body;

    if (!period_start || !period_end || unit_count === undefined) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const result = await recordUsage(req.params.id, {
      period_start,
      period_end,
      unit_count,
      description,
      unit_price,
    });

    return res.json(result);
  } catch (e: any) {
    console.error('Error recording usage:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions/:id/usage
 * Get usage records for subscription
 */
subscriptionsRouter.get('/:id/usage', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM usage_records WHERE subscription_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    return res.json(rows);
  } catch (e: any) {
    console.error('Error fetching usage:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions/:id/invoices
 * Get invoices for subscription
 */
subscriptionsRouter.get('/:id/invoices', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscription_invoices WHERE subscription_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    return res.json(rows);
  } catch (e: any) {
    console.error('Error fetching invoices:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions/:id/logs
 * Get audit logs for subscription
 */
subscriptionsRouter.get('/:id/logs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscription_logs WHERE subscription_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    return res.json(rows);
  } catch (e: any) {
    console.error('Error fetching logs:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/subscriptions/stats/:merchant_id
 * Get subscription statistics for merchant
 */
subscriptionsRouter.get('/stats/:merchant_id', async (req, res) => {
  try {
    const stats = await getSubscriptionStats(req.params.merchant_id);
    return res.json(stats);
  } catch (e: any) {
    console.error('Error fetching stats:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/plans
 * List all active plans
 */
subscriptionsRouter.get('/plans/list', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM plans WHERE is_active = true ORDER BY unit_amount ASC`
    );

    return res.json(rows);
  } catch (e: any) {
    console.error('Error fetching plans:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/plans/:id
 * Get plan by ID with prices
 */
subscriptionsRouter.get('/plans/:id', async (req, res) => {
  try {
    const { rows: planRows } = await pool.query(`SELECT * FROM plans WHERE id = $1`, [
      req.params.id,
    ]);

    if (planRows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const plan = planRows[0];

    // Get multi-currency prices
    const { rows: priceRows } = await pool.query(
      `SELECT * FROM plan_prices WHERE plan_id = $1`,
      [req.params.id]
    );

    return res.json({ ...plan, prices: priceRows });
  } catch (e: any) {
    console.error('Error fetching plan:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default subscriptionsRouter;