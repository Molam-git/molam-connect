/**
 * Brique 120ter: Smart Marketplace Flow API
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { callSiraForPayout } from '../sira/client';
import crypto from 'crypto';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

function generatePayoutRef(): string {
  return `SPO-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/smart-payout
 * Create smart payout with SIRA routing
 */
router.post('/:marketplaceId/sellers/:sellerId/smart-payout', async (req: Request, res: Response) => {
  const idempotency = req.headers['idempotency-key'] as string;
  if (!idempotency) {
    return res.status(400).json({ error: 'idempotency_required' });
  }

  const { marketplaceId, sellerId } = req.params;
  const { requested_amount, currency, mode = 'auto' } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check idempotency
    const existingPayout = await client.query(
      'SELECT * FROM payouts WHERE external_id = $1',
      [idempotency]
    );

    if (existingPayout.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        payout: existingPayout.rows[0],
        idempotent: true
      });
    }

    // Verify seller
    const sellerResult = await client.query(
      'SELECT * FROM marketplace_sellers WHERE id = $1 AND marketplace_account_id = $2',
      [sellerId, marketplaceId]
    );

    if (sellerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'seller_not_found' });
    }

    const seller = sellerResult.rows[0];

    // Check KYC
    if (seller.kyc_status !== 'verified') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'seller_not_verified',
        kyc_status: seller.kyc_status
      });
    }

    // Check for active holds
    const holdsResult = await client.query(
      'SELECT COUNT(*) as count FROM seller_holds WHERE marketplace_seller_id = $1 AND status = $2',
      [sellerId, 'active']
    );

    if (parseInt(holdsResult.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'seller_has_active_holds' });
    }

    // Call SIRA for recommendations
    const siraRec = await callSiraForPayout({
      sellerId,
      amount: requested_amount,
      currency,
      mode
    });

    // Store SIRA recommendation
    const siraRecResult = await client.query(`
      INSERT INTO sira_payout_recommendations (
        seller_id,
        priority_score,
        risk_score,
        multi_bank,
        recommended_slices,
        recommended_action,
        recommended_treasury_id,
        reasons,
        model_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      sellerId,
      siraRec.priority_score,
      siraRec.risk_score || 0,
      siraRec.multi_bank,
      siraRec.recommended_slices ? JSON.stringify(siraRec.recommended_slices) : null,
      siraRec.recommended_action,
      siraRec.treasury_account_id || null,
      siraRec.reasons ? JSON.stringify(siraRec.reasons) : null,
      siraRec.model_version || 'v1.0'
    ]);

    // Handle SIRA recommendations
    if (siraRec.recommended_action === 'hold' || siraRec.recommended_action === 'escrow') {
      // Create escrow
      const escrowResult = await client.query(`
        INSERT INTO seller_escrows (
          seller_id,
          amount,
          currency,
          reason,
          risk_score
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        sellerId,
        requested_amount,
        currency,
        'sira_risk_hold',
        siraRec.risk_score
      ]);

      await client.query('COMMIT');

      return res.json({
        success: true,
        status: 'held',
        escrow: escrowResult.rows[0],
        sira_recommendation: siraRecResult.rows[0]
      });
    }

    // Create parent payout
    const referenceCode = generatePayoutRef();

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
        reference_code,
        metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      idempotency,
      'marketplace_smart',
      sellerId,
      currency,
      requested_amount,
      requested_amount,
      0,
      0,
      seller.beneficiary_details || JSON.stringify({}),
      siraRec.priority_score >= 85 ? 'priority' : 'normal',
      referenceCode,
      JSON.stringify({ sira_rec_id: siraRecResult.rows[0].id }),
      req.body.user_id || null
    ]);

    const parentPayout = parentPayoutResult.rows[0];

    // Update SIRA rec with parent payout ID
    await client.query(
      'UPDATE sira_payout_recommendations SET parent_payout_id = $1 WHERE id = $2',
      [parentPayout.id, siraRecResult.rows[0].id]
    );

    // Create slices based on SIRA recommendation
    if (siraRec.multi_bank && siraRec.recommended_slices && siraRec.recommended_slices.length > 0) {
      for (const slice of siraRec.recommended_slices) {
        await client.query(`
          INSERT INTO payout_slices (
            parent_payout_id,
            treasury_account_id,
            slice_amount,
            currency,
            slice_order
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          parentPayout.id,
          slice.treasury_account_id,
          slice.amount,
          currency,
          slice.order || 1
        ]);
      }

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        parent_payout: parentPayout,
        slices: siraRec.recommended_slices,
        sira_recommendation: siraRecResult.rows[0]
      });
    }

    // Single slice (standard flow)
    await client.query(`
      INSERT INTO payout_slices (
        parent_payout_id,
        treasury_account_id,
        slice_amount,
        currency,
        slice_order
      ) VALUES ($1, $2, $3, $4, 1)
    `, [
      parentPayout.id,
      siraRec.treasury_account_id || null,
      requested_amount,
      currency
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      parent_payout: parentPayout,
      sira_recommendation: siraRecResult.rows[0]
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Smart payout error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/marketplace/:marketplaceId/sellers/:sellerId/advance
 * Request advance
 */
router.post('/:marketplaceId/sellers/:sellerId/advance', async (req: Request, res: Response) => {
  const idempotency = req.headers['idempotency-key'] as string;
  if (!idempotency) {
    return res.status(400).json({ error: 'idempotency_required' });
  }

  const { sellerId } = req.params;
  const { amount, currency } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check idempotency
    const existing = await client.query(
      'SELECT * FROM seller_advances WHERE external_id = $1',
      [idempotency]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({ success: true, advance: existing.rows[0], idempotent: true });
    }

    // Get seller
    const sellerResult = await client.query(
      'SELECT * FROM marketplace_sellers WHERE id = $1',
      [sellerId]
    );

    if (sellerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'seller_not_found' });
    }

    const seller = sellerResult.rows[0];

    if (seller.kyc_status !== 'verified') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'seller_not_verified' });
    }

    // Check eligibility
    const eligibilityResult = await client.query(
      'SELECT * FROM seller_advance_eligibility WHERE seller_id = $1',
      [sellerId]
    );

    const eligibility = eligibilityResult.rows[0];

    if (!eligibility || parseFloat(eligibility.max_advance_available) < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'advance_not_eligible',
        max_available: eligibility?.max_advance_available || 0
      });
    }

    // Create advance request
    const advanceResult = await client.query(`
      INSERT INTO seller_advances (
        seller_id,
        external_id,
        advance_amount,
        currency,
        fee_percent,
        status,
        repayment_schedule
      ) VALUES ($1, $2, $3, $4, $5, 'requested', 'future_sales')
      RETURNING *
    `, [
      sellerId,
      idempotency,
      amount,
      currency,
      0.05 // 5% fee
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      advance: advanceResult.rows[0]
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Advance request error:', error);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/marketplace/slices/pending
 * Get pending slices for worker
 */
router.get('/slices/pending', async (req: Request, res: Response) => {
  const { limit = 50 } = req.query;

  try {
    const result = await pool.query(`
      SELECT * FROM active_payout_slices
      LIMIT $1
    `, [parseInt(limit as string)]);

    res.json({
      success: true,
      slices: result.rows
    });

  } catch (error) {
    console.error('Get pending slices error:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
