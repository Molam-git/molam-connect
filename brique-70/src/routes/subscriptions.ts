import { Router } from 'express';
import { pool } from '../db/pool';
import { authenticate, getMerchantFilter } from '../middleware/auth';
import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
} from '../services/subscriptions';

const router = Router();

/**
 * Create subscription (customer)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      plan_id,
      merchant_id,
      coupon_id,
      payment_method_id,
      metadata,
    } = req.body;

    if (!plan_id || !merchant_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const subscription = await createSubscription({
      planId: plan_id,
      customerId: req.user!.userId,
      merchantId: merchant_id,
      couponId: coupon_id,
      paymentMethodId: payment_method_id,
      metadata,
    });

    res.status(201).json(subscription);
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

/**
 * List subscriptions
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM subscriptions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    // Filter based on role
    if (req.user!.role === 'customer') {
      query += ` AND customer_id = $${paramIndex++}`;
      params.push(req.user!.userId);
    } else if (req.user!.role === 'merchant') {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(req.user!.merchantId);
    }
    // Ops can see all subscriptions

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
});

/**
 * Get subscription details
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        s.*,
        sp.name as plan_name,
        sp.amount as plan_amount,
        sp.currency as plan_currency,
        sp.interval as plan_interval,
        sp.interval_count as plan_interval_count,
        c.name as coupon_name,
        c.discount_value as coupon_discount_value
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN coupons c ON c.id = s.coupon_id
      WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = result.rows[0];

    // Check access
    if (req.user!.role === 'customer' && subscription.customer_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user!.role === 'merchant' && subscription.merchant_id !== req.user!.merchantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

/**
 * Cancel subscription
 */
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_at_period_end = true, reason } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT customer_id FROM subscriptions WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (req.user!.role === 'customer' && checkResult.rows[0].customer_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Cannot cancel other customer subscription' });
    }

    const subscription = await cancelSubscription(id, cancel_at_period_end, reason);
    res.json(subscription);
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

/**
 * Reactivate subscription
 */
router.post('/:id/reactivate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT customer_id FROM subscriptions WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (req.user!.role === 'customer' && checkResult.rows[0].customer_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Cannot reactivate other customer subscription' });
    }

    const subscription = await reactivateSubscription(id);
    res.json(subscription);
  } catch (error: any) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to reactivate subscription' });
  }
});

/**
 * Get subscription invoices
 */
router.get('/:id/invoices', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify access
    const subResult = await pool.query(
      'SELECT customer_id, merchant_id FROM subscriptions WHERE id = $1',
      [id]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subResult.rows[0];

    if (req.user!.role === 'customer' && subscription.customer_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user!.role === 'merchant' && subscription.merchant_id !== req.user!.merchantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT * FROM subscription_invoices
      WHERE subscription_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

/**
 * Update payment method
 */
router.patch('/:id/payment-method', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({ error: 'payment_method_id is required' });
    }

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT customer_id FROM subscriptions WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (req.user!.role === 'customer' && checkResult.rows[0].customer_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Cannot update other customer subscription' });
    }

    const result = await pool.query(
      `UPDATE subscriptions SET
        default_payment_method_id = $1,
        updated_at = now()
      WHERE id = $2
      RETURNING *`,
      [payment_method_id, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

export default router;
