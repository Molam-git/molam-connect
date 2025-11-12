import { Router } from 'express';
import { pool } from '../db/pool';
import { authenticate, requireMerchantAccess, getMerchantFilter } from '../middleware/auth';

const router = Router();

/**
 * Create subscription plan (merchant/ops)
 */
router.post('/', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const {
      merchant_id,
      campaign_id,
      name,
      description,
      product_id,
      amount,
      currency,
      interval,
      interval_count,
      trial_period_days,
      features,
      metadata,
    } = req.body;

    if (!merchant_id || !name || !amount || !currency || !interval) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate merchant access
    if (req.user!.role === 'merchant' && req.user!.merchantId !== merchant_id) {
      return res.status(403).json({ error: 'Cannot create plan for other merchant' });
    }

    const result = await pool.query(
      `INSERT INTO subscription_plans (
        merchant_id, campaign_id, name, description, product_id,
        amount, currency, interval, interval_count, trial_period_days,
        features, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        merchant_id,
        campaign_id,
        name,
        description,
        product_id,
        amount,
        currency,
        interval,
        interval_count || 1,
        trial_period_days || 0,
        features ? JSON.stringify(features) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ error: 'Failed to create subscription plan' });
  }
});

/**
 * List subscription plans (public for display, filtered for merchant)
 */
router.get('/', async (req, res) => {
  try {
    const { merchant_id, is_active, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM subscription_plans WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    } else {
      // By default, show only active plans to public
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY amount ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error listing subscription plans:', error);
    res.status(500).json({ error: 'Failed to list subscription plans' });
  }
});

/**
 * Get subscription plan details (public)
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting subscription plan:', error);
    res.status(500).json({ error: 'Failed to get subscription plan' });
  }
});

/**
 * Update subscription plan (merchant/ops)
 */
router.patch('/:id', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      trial_period_days,
      features,
      metadata,
      is_active,
    } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT merchant_id FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    if (req.user!.role === 'merchant' && req.user!.merchantId !== checkResult.rows[0].merchant_id) {
      return res.status(403).json({ error: 'Cannot update other merchant plan' });
    }

    const result = await pool.query(
      `UPDATE subscription_plans SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        trial_period_days = COALESCE($3, trial_period_days),
        features = COALESCE($4, features),
        metadata = COALESCE($5, metadata),
        is_active = COALESCE($6, is_active),
        updated_at = now()
      WHERE id = $7
      RETURNING *`,
      [
        name,
        description,
        trial_period_days,
        features ? JSON.stringify(features) : undefined,
        metadata ? JSON.stringify(metadata) : undefined,
        is_active,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ error: 'Failed to update subscription plan' });
  }
});

/**
 * Delete/deactivate subscription plan (merchant/ops)
 */
router.delete('/:id', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT merchant_id FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    if (req.user!.role === 'merchant' && req.user!.merchantId !== checkResult.rows[0].merchant_id) {
      return res.status(403).json({ error: 'Cannot delete other merchant plan' });
    }

    // Deactivate instead of delete (don't break existing subscriptions)
    const result = await pool.query(
      `UPDATE subscription_plans SET is_active = false, updated_at = now()
      WHERE id = $1
      RETURNING *`,
      [id]
    );

    res.json({ message: 'Subscription plan deactivated', plan: result.rows[0] });
  } catch (error) {
    console.error('Error deactivating subscription plan:', error);
    res.status(500).json({ error: 'Failed to deactivate subscription plan' });
  }
});

/**
 * Get plan subscribers count
 */
router.get('/:id/stats', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        sp.*,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('active', 'trialing')) as active_subscribers,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'canceled') as canceled_subscribers,
        SUM(si.total_amount) FILTER (WHERE si.status = 'paid') as total_revenue
      FROM subscription_plans sp
      LEFT JOIN subscriptions s ON s.plan_id = sp.id
      LEFT JOIN subscription_invoices si ON si.subscription_id = s.id
      WHERE sp.id = $1
      GROUP BY sp.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting plan stats:', error);
    res.status(500).json({ error: 'Failed to get plan stats' });
  }
});

export default router;
