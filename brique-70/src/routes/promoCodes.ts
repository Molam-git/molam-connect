import { Router } from 'express';
import { pool } from '../db/pool';
import { authenticate, requireMerchantAccess, getMerchantFilter } from '../middleware/auth';
import { applyPromoCode, validatePromoCode, refundPromoCodeUsage } from '../services/applyPromo';

const router = Router();

/**
 * Apply a promo code (public endpoint for checkout)
 */
router.post('/apply', async (req, res) => {
  try {
    const {
      code,
      amount,
      currency,
      customer_id,
      order_id,
      product_ids,
      ip_address,
      user_agent,
    } = req.body;

    if (!code || !amount || !currency || !customer_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await applyPromoCode(
      code,
      amount,
      currency,
      customer_id,
      order_id,
      product_ids,
      ip_address || req.ip,
      user_agent || req.get('user-agent')
    );

    res.json(result);
  } catch (error) {
    console.error('Error applying promo code:', error);
    res.status(500).json({ error: 'Failed to apply promo code' });
  }
});

/**
 * Validate a promo code (public endpoint)
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, customer_id } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const result = await validatePromoCode(code, customer_id);
    res.json(result);
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
});

/**
 * Refund promo code usage (merchant/ops only)
 */
router.post('/refund/:usage_id', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { usage_id } = req.params;

    const result = await refundPromoCodeUsage(usage_id);
    res.json(result);
  } catch (error) {
    console.error('Error refunding promo code:', error);
    res.status(500).json({ error: 'Failed to refund promo code' });
  }
});

/**
 * Create promo code (merchant/ops only)
 */
router.post('/', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const {
      campaign_id,
      code,
      discount_type,
      discount_value,
      currency,
      usage_limit,
      per_user_limit,
      valid_from,
      valid_to,
    } = req.body;

    if (!campaign_id || !code || !discount_type || discount_value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO promo_codes (
        campaign_id, code, discount_type, discount_value, currency,
        usage_limit, per_user_limit, valid_from, valid_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        campaign_id,
        code,
        discount_type,
        discount_value,
        currency,
        usage_limit,
        per_user_limit,
        valid_from || new Date(),
        valid_to,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating promo code:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Promo code already exists' });
    }
    res.status(500).json({ error: 'Failed to create promo code' });
  }
});

/**
 * List promo codes (merchant/ops)
 */
router.get('/', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const merchantId = getMerchantFilter(req, req.query.merchant_id as string);
    const { campaign_id, is_active, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT pc.*, mc.name as campaign_name, mc.merchant_id
      FROM promo_codes pc
      JOIN marketing_campaigns mc ON mc.id = pc.campaign_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (merchantId) {
      query += ` AND mc.merchant_id = $${paramIndex++}`;
      params.push(merchantId);
    }

    if (campaign_id) {
      query += ` AND pc.campaign_id = $${paramIndex++}`;
      params.push(campaign_id);
    }

    if (is_active !== undefined) {
      query += ` AND pc.is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    query += ` ORDER BY pc.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error listing promo codes:', error);
    res.status(500).json({ error: 'Failed to list promo codes' });
  }
});

/**
 * Get promo code details (merchant/ops)
 */
router.get('/:id', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const merchantId = getMerchantFilter(req, req.query.merchant_id as string);

    let query = `
      SELECT pc.*, mc.name as campaign_name, mc.merchant_id
      FROM promo_codes pc
      JOIN marketing_campaigns mc ON mc.id = pc.campaign_id
      WHERE pc.id = $1
    `;
    const params: any[] = [id];

    if (merchantId) {
      query += ' AND mc.merchant_id = $2';
      params.push(merchantId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting promo code:', error);
    res.status(500).json({ error: 'Failed to get promo code' });
  }
});

/**
 * Update promo code (merchant/ops)
 */
router.patch('/:id', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      usage_limit,
      per_user_limit,
      valid_to,
      is_active,
    } = req.body;

    const result = await pool.query(
      `UPDATE promo_codes SET
        usage_limit = COALESCE($1, usage_limit),
        per_user_limit = COALESCE($2, per_user_limit),
        valid_to = COALESCE($3, valid_to),
        is_active = COALESCE($4, is_active),
        updated_at = now()
      WHERE id = $5
      RETURNING *`,
      [usage_limit, per_user_limit, valid_to, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating promo code:', error);
    res.status(500).json({ error: 'Failed to update promo code' });
  }
});

/**
 * Get promo code usage stats (merchant/ops)
 */
router.get('/:id/usage', authenticate, requireMerchantAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT
        pcu.*,
        c.email as customer_email
      FROM promo_code_usage pcu
      LEFT JOIN customers c ON c.id = pcu.customer_id
      WHERE pcu.promo_code_id = $1
      ORDER BY pcu.created_at DESC
      LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

export default router;
