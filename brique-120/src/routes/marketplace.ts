/**
 * Sous-Brique 120bis: Multi-Seller Payout Orchestrator API
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * POST /api/marketplace/:marketplaceId/sellers
 * Create a seller sub-account
 */
router.post('/:marketplaceId/sellers', async (req: Request, res: Response) => {
  const { marketplaceId } = req.params;
  const {
    seller_name,
    seller_email,
    currency,
    commission_rate,
    settlement_schedule,
    settlement_day,
    beneficiary_details,
    is_vip
  } = req.body;

  if (!seller_name || !currency) {
    return res.status(400).json({
      error: 'missing_required_fields',
      required: ['seller_name', 'currency']
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO marketplace_sellers (
        marketplace_account_id,
        seller_name,
        seller_email,
        currency,
        commission_rate,
        settlement_schedule,
        settlement_day,
        beneficiary_details,
        is_vip,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      marketplaceId,
      seller_name,
      seller_email || null,
      currency,
      commission_rate || 0.10,
      settlement_schedule || 'weekly',
      settlement_day || 1,
      beneficiary_details ? JSON.stringify(beneficiary_details) : null,
      is_vip || false,
      req.body.user_id || null
    ]);

    res.status(201).json({
      success: true,
      seller: result.rows[0]
    });

  } catch (error: any) {
    console.error('Create seller error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/marketplace/:marketplaceId/sellers
 * List sellers
 */
router.get('/:marketplaceId/sellers', async (req: Request, res: Response) => {
  const { marketplaceId } = req.params;
  const { kyc_status, is_active } = req.query;

  const conditions: string[] = ['marketplace_account_id = $1'];
  const params: any[] = [marketplaceId];
  let paramIndex = 2;

  if (kyc_status) {
    conditions.push(`kyc_status = $${paramIndex++}`);
    params.push(kyc_status);
  }

  if (is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    params.push(is_active === 'true');
  }

  try {
    const result = await pool.query(`
      SELECT * FROM marketplace_sellers
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `, params);

    res.json({
      success: true,
      sellers: result.rows
    });

  } catch (error) {
    console.error('List sellers error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * PATCH /api/marketplace/:marketplaceId/sellers/:sellerId/kyc
 * Update seller KYC status
 */
router.patch('/:marketplaceId/sellers/:sellerId/kyc', async (req: Request, res: Response) => {
  const { marketplaceId, sellerId } = req.params;
  const { kyc_status } = req.body;

  const validStatuses = ['pending', 'verified', 'blocked', 'suspended'];
  if (!validStatuses.includes(kyc_status)) {
    return res.status(400).json({
      error: 'invalid_kyc_status',
      valid: validStatuses
    });
  }

  try {
    const result = await pool.query(`
      UPDATE marketplace_sellers
      SET kyc_status = $1,
          kyc_verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE kyc_verified_at END,
          updated_by = $2
      WHERE id = $3 AND marketplace_account_id = $4
      RETURNING *
    `, [kyc_status, req.body.user_id || null, sellerId, marketplaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'seller_not_found' });
    }

    res.json({
      success: true,
      seller: result.rows[0]
    });

  } catch (error) {
    console.error('Update KYC error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/transactions
 * Record a transaction for netting
 */
router.post('/:marketplaceId/sellers/:sellerId/transactions', async (req: Request, res: Response) => {
  const { marketplaceId, sellerId } = req.params;
  const {
    transaction_type,
    amount,
    currency,
    reference_type,
    reference_id,
    description
  } = req.body;

  const validTypes = ['sale', 'refund', 'commission', 'adjustment', 'fee'];
  if (!validTypes.includes(transaction_type)) {
    return res.status(400).json({
      error: 'invalid_transaction_type',
      valid: validTypes
    });
  }

  try {
    // Verify seller belongs to marketplace
    const sellerCheck = await pool.query(
      'SELECT id FROM marketplace_sellers WHERE id = $1 AND marketplace_account_id = $2',
      [sellerId, marketplaceId]
    );

    if (sellerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'seller_not_found' });
    }

    const result = await pool.query(`
      INSERT INTO seller_transactions (
        marketplace_seller_id,
        transaction_type,
        amount,
        currency,
        reference_type,
        reference_id,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      sellerId,
      transaction_type,
      amount,
      currency,
      reference_type || null,
      reference_id || null,
      description || null
    ]);

    res.status(201).json({
      success: true,
      transaction: result.rows[0]
    });

  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/marketplace/:marketplaceId/sellers/:sellerId/balance
 * Get seller balance (pending transactions)
 */
router.get('/:marketplaceId/sellers/:sellerId/balance', async (req: Request, res: Response) => {
  const { sellerId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM calculate_seller_balance($1)',
      [sellerId]
    );

    res.json({
      success: true,
      balance: result.rows[0] || { gross: 0, refunds: 0, commission: 0, net: 0 }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/payout
 * Create payout for seller
 */
router.post('/:marketplaceId/sellers/:sellerId/payout', async (req: Request, res: Response) => {
  const { marketplaceId, sellerId } = req.params;
  const { scheduled_run, force } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get seller
    const sellerResult = await client.query(
      'SELECT * FROM marketplace_sellers WHERE id = $1 AND marketplace_account_id = $2 FOR UPDATE',
      [sellerId, marketplaceId]
    );

    if (sellerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'seller_not_found' });
    }

    const seller = sellerResult.rows[0];

    // Check KYC unless force override
    if (seller.kyc_status !== 'verified' && !force) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'seller_not_verified',
        kyc_status: seller.kyc_status
      });
    }

    // Check for active holds
    const holdsResult = await client.query(
      'SELECT * FROM seller_holds WHERE marketplace_seller_id = $1 AND status = $2',
      [sellerId, 'active']
    );

    if (holdsResult.rows.length > 0 && !force) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'seller_has_active_holds',
        holds: holdsResult.rows
      });
    }

    // Calculate balance
    const balanceResult = await client.query(
      'SELECT * FROM calculate_seller_balance($1)',
      [sellerId]
    );

    const balance = balanceResult.rows[0];

    if (balance.net <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'insufficient_balance',
        net: balance.net
      });
    }

    // Check min payout amount
    if (balance.net < seller.min_payout_amount && !force) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'below_minimum_payout',
        net: balance.net,
        minimum: seller.min_payout_amount
      });
    }

    // Create parent payout (simplified - would call actual payout creation)
    const parentPayoutResult = await client.query(`
      INSERT INTO payouts (
        external_id,
        origin_module,
        origin_entity_id,
        currency,
        amount,
        net_amount,
        molam_fee,
        bank_fee,
        beneficiary,
        priority,
        scheduled_run,
        reference_code,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      `seller-payout-${sellerId}-${Date.now()}`,
      'marketplace',
      sellerId,
      seller.currency,
      balance.net,
      balance.net,
      0,
      0,
      seller.beneficiary_details || JSON.stringify({}),
      seller.is_vip ? 'priority' : 'normal',
      scheduled_run || null,
      `SP-${Date.now()}`,
      req.body.user_id || null
    ]);

    const parentPayout = parentPayoutResult.rows[0];

    // Create seller payout record
    const sellerPayoutResult = await client.query(`
      INSERT INTO seller_payouts (
        marketplace_seller_id,
        parent_payout_id,
        gross_amount,
        commission,
        refunds,
        net_amount,
        sales_count,
        refunds_count,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `, [
      sellerId,
      parentPayout.id,
      balance.gross,
      balance.commission,
      balance.refunds,
      balance.net,
      0, // Would count from transactions
      0  // Would count from transactions
    ]);

    // Settle transactions
    const settledCount = await client.query(
      'SELECT settle_seller_transactions($1, $2) as count',
      [sellerId, sellerPayoutResult.rows[0].id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      parent_payout: parentPayout,
      seller_payout: sellerPayoutResult.rows[0],
      settled_transactions: settledCount.rows[0].count
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create seller payout error:', error);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/hold
 * Create a hold on seller payouts
 */
router.post('/:marketplaceId/sellers/:sellerId/hold', async (req: Request, res: Response) => {
  const { sellerId } = req.params;
  const { hold_type, reason, amount } = req.body;

  if (!hold_type || !reason) {
    return res.status(400).json({
      error: 'missing_required_fields',
      required: ['hold_type', 'reason']
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO seller_holds (
        marketplace_seller_id,
        hold_type,
        reason,
        amount,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [sellerId, hold_type, reason, amount || null, req.body.user_id || null]);

    res.status(201).json({
      success: true,
      hold: result.rows[0]
    });

  } catch (error) {
    console.error('Create hold error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/hold/:holdId/release
 * Release a hold
 */
router.post('/:marketplaceId/sellers/:sellerId/hold/:holdId/release', async (req: Request, res: Response) => {
  const { holdId } = req.params;

  try {
    const result = await pool.query(`
      UPDATE seller_holds
      SET status = 'released',
          released_at = now(),
          released_by = $1
      WHERE id = $2
      RETURNING *
    `, [req.body.user_id || null, holdId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'hold_not_found' });
    }

    res.json({
      success: true,
      hold: result.rows[0]
    });

  } catch (error) {
    console.error('Release hold error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/marketplace/settlement/ready
 * Get sellers ready for settlement
 */
router.get('/settlement/ready', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM sellers_ready_for_settlement
      ORDER BY is_vip DESC, priority_level DESC, created_at ASC
    `);

    res.json({
      success: true,
      sellers: result.rows
    });

  } catch (error) {
    console.error('Get ready sellers error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
