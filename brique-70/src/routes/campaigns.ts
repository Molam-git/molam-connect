import { Router } from 'express';
import { pool } from '../db/pool';
import { authenticate, requireRole, getMerchantFilter } from '../middleware/auth';

const router = Router();

/**
 * Create marketing campaign (ops/merchant)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      merchant_id,
      name,
      description,
      type,
      min_purchase_amount,
      max_discount_amount,
      applicable_products,
      applicable_categories,
      excluded_products,
      total_usage_limit,
      per_user_limit,
      starts_at,
      ends_at,
    } = req.body;

    if (!merchant_id || !name || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate merchant access
    if (req.user!.role === 'merchant' && req.user!.merchantId !== merchant_id) {
      return res.status(403).json({ error: 'Cannot create campaign for other merchant' });
    }

    const result = await pool.query(
      `INSERT INTO marketing_campaigns (
        merchant_id, name, description, type,
        min_purchase_amount, max_discount_amount,
        applicable_products, applicable_categories, excluded_products,
        total_usage_limit, per_user_limit,
        starts_at, ends_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        merchant_id,
        name,
        description,
        type,
        min_purchase_amount,
        max_discount_amount,
        applicable_products,
        applicable_categories,
        excluded_products,
        total_usage_limit,
        per_user_limit,
        starts_at || new Date(),
        ends_at,
        req.user!.userId,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * List campaigns (ops can see all, merchants see their own)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const merchantId = getMerchantFilter(req, req.query.merchant_id as string);
    const { type, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM marketing_campaigns WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (merchantId) {
      query += ` AND merchant_id = $${paramIndex++}`;
      params.push(merchantId);
    }

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

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
    console.error('Error listing campaigns:', error);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

/**
 * Get campaign details
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const merchantId = getMerchantFilter(req, req.query.merchant_id as string);

    let query = 'SELECT * FROM marketing_campaigns WHERE id = $1';
    const params: any[] = [id];

    if (merchantId) {
      query += ' AND merchant_id = $2';
      params.push(merchantId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting campaign:', error);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

/**
 * Update campaign
 */
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      status,
      min_purchase_amount,
      max_discount_amount,
      total_usage_limit,
      per_user_limit,
      ends_at,
    } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT merchant_id FROM marketing_campaigns WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (req.user!.role === 'merchant' && req.user!.merchantId !== checkResult.rows[0].merchant_id) {
      return res.status(403).json({ error: 'Cannot update other merchant campaign' });
    }

    const result = await pool.query(
      `UPDATE marketing_campaigns SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        min_purchase_amount = COALESCE($4, min_purchase_amount),
        max_discount_amount = COALESCE($5, max_discount_amount),
        total_usage_limit = COALESCE($6, total_usage_limit),
        per_user_limit = COALESCE($7, per_user_limit),
        ends_at = COALESCE($8, ends_at),
        updated_at = now()
      WHERE id = $9
      RETURNING *`,
      [
        name,
        description,
        status,
        min_purchase_amount,
        max_discount_amount,
        total_usage_limit,
        per_user_limit,
        ends_at,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/**
 * Delete/archive campaign (ops only)
 */
router.delete('/:id', authenticate, requireRole('ops', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Archive instead of delete
    const result = await pool.query(
      `UPDATE marketing_campaigns SET status = 'archived', updated_at = now()
      WHERE id = $1
      RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ message: 'Campaign archived', campaign: result.rows[0] });
  } catch (error) {
    console.error('Error archiving campaign:', error);
    res.status(500).json({ error: 'Failed to archive campaign' });
  }
});

/**
 * Get campaign stats
 */
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        mc.*,
        COUNT(DISTINCT pc.id) as promo_codes_count,
        COUNT(DISTINCT pcu.id) as total_uses,
        SUM(pcu.discount_amount) as total_discount_given,
        COUNT(DISTINCT pcu.customer_id) as unique_customers
      FROM marketing_campaigns mc
      LEFT JOIN promo_codes pc ON pc.campaign_id = mc.id
      LEFT JOIN promo_code_usage pcu ON pcu.promo_code_id = pc.id
      WHERE mc.id = $1
      GROUP BY mc.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting campaign stats:', error);
    res.status(500).json({ error: 'Failed to get campaign stats' });
  }
});

export default router;
