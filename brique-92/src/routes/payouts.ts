// Payouts API Routes
// POST /api/payouts - Create payout with idempotency
// GET /api/payouts/:id - Get payout status
// POST /api/payouts/:id/cancel - Cancel payout

import express, { Request, Response } from 'express';
import { pool, withTransaction } from '../utils/db';
import { createLedgerHold, releaseLedgerHold } from '../ledger/client';
import { calculatePayoutFees } from '../services/fee-calculator';
import publishEvent from '../utils/events';

export const payoutsRouter = express.Router();

/**
 * POST /api/payouts
 * Create a new payout with idempotency
 * Headers: Idempotency-Key (required)
 */
payoutsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'idempotency_required',
        message: 'Idempotency-Key header is required'
      });
    }

    // Check idempotency
    const { rows: existingKeys } = await pool.query(
      'SELECT * FROM idempotency_keys WHERE key = $1 AND expires_at > now()',
      [idempotencyKey]
    );

    if (existingKeys.length > 0) {
      console.log(`[Payouts] Idempotency key already used: ${idempotencyKey}`);
      return res.status(200).json(existingKeys[0].response_snapshot);
    }

    // Extract request body
    const {
      origin_module,
      origin_entity_id,
      currency,
      amount,
      beneficiary,
      bank_profile_id,
      treasury_account_id,
      scheduled_for,
      priority,
      notes,
      metadata
    } = req.body;

    // Validation
    if (!origin_module || !origin_entity_id || !currency || !amount || !beneficiary) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'origin_module, origin_entity_id, currency, amount, and beneficiary are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Amount must be greater than 0'
      });
    }

    if (!beneficiary.name || !beneficiary.account) {
      return res.status(400).json({
        error: 'invalid_beneficiary',
        message: 'Beneficiary must have name and account details'
      });
    }

    // Calculate fees
    const fees = calculatePayoutFees({
      origin_module,
      amount,
      currency,
      bank_profile_id
    });

    // Create within transaction
    const result = await withTransaction(async (client) => {
      // Create ledger hold
      console.log(`[Payouts] Creating ledger hold for ${currency} ${fees.total_deducted}`);

      const holdResult = await createLedgerHold({
        owner_id: origin_entity_id,
        owner_type: origin_module,
        amount: fees.total_deducted,
        currency,
        reason: `payout:${idempotencyKey}`,
        idempotency_key: `hold:${idempotencyKey}`,
        metadata: { origin_module, beneficiary: beneficiary.name }
      });

      if (holdResult.status === 'failed') {
        throw new Error(`Ledger hold failed: ${holdResult.error}`);
      }

      // Insert payout
      const { rows: payouts } = await client.query(
        `INSERT INTO payouts (
          external_id,
          origin_module,
          origin_entity_id,
          currency,
          amount,
          beneficiary,
          bank_profile_id,
          treasury_account_id,
          molam_fee,
          bank_fee,
          total_deducted,
          reserved_ledger_ref,
          status,
          priority,
          scheduled_for,
          notes,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING *`,
        [
          idempotencyKey,
          origin_module,
          origin_entity_id,
          currency,
          amount,
          JSON.stringify(beneficiary),
          bank_profile_id || null,
          treasury_account_id || null,
          fees.molam_fee,
          fees.estimated_bank_fee,
          fees.total_deducted,
          holdResult.hold_ref,
          'reserved', // Holdcreated successfully
          priority || 10,
          scheduled_for || new Date(),
          notes || null,
          JSON.stringify(metadata || {})
        ]
      );

      const payout = payouts[0];

      // Enqueue for processing
      await client.query(
        `INSERT INTO payout_queue (payout_id, next_attempt_at, priority)
         VALUES ($1, $2, $3)`,
        [payout.id, payout.scheduled_for, payout.priority]
      );

      // Audit log
      await client.query(
        `INSERT INTO payout_audit (payout_id, actor_type, actor_id, action, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          payout.id,
          'user',
          req.user?.id || 'api',
          'created',
          JSON.stringify({ idempotency_key: idempotencyKey, amount, currency })
        ]
      );

      return payout;
    });

    // Store idempotency response
    await pool.query(
      `INSERT INTO idempotency_keys (key, owner_id, response_snapshot, expires_at, resource_type, resource_id)
       VALUES ($1, $2, $3, now() + interval '24 hours', $4, $5)`,
      [idempotencyKey, req.user?.id || null, JSON.stringify(result), 'payout', result.id]
    );

    // Publish event
    await publishEvent('payouts', result.origin_entity_id, 'payout.created', {
      payout_id: result.id,
      reference_code: result.reference_code,
      amount: result.amount,
      currency: result.currency
    });

    console.log(`[Payouts] ✓ Created payout ${result.reference_code}`);

    res.status(201).json(result);
  } catch (error: any) {
    console.error('[Payouts] Error creating payout:', error);

    res.status(500).json({
      error: 'payout_creation_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/payouts/:id
 * Get payout status
 */
payoutsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM payouts WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Payout not found'
      });
    }

    // Get latest attempt
    const { rows: attempts } = await pool.query(
      `SELECT * FROM payout_attempts
       WHERE payout_id = $1
       ORDER BY attempted_at DESC
       LIMIT 1`,
      [id]
    );

    const payout = rows[0];
    payout.latest_attempt = attempts[0] || null;

    res.json(payout);
  } catch (error: any) {
    console.error('[Payouts] Error fetching payout:', error);

    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/payouts/:id/cancel
 * Cancel a pending payout
 */
payoutsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await withTransaction(async (client) => {
      // Get payout
      const { rows } = await client.query(
        'SELECT * FROM payouts WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (rows.length === 0) {
        throw new Error('Payout not found');
      }

      const payout = rows[0];

      // Check if cancellable
      if (!['pending', 'reserved', 'processing'].includes(payout.status)) {
        throw new Error(`Cannot cancel payout with status: ${payout.status}`);
      }

      // Release ledger hold
      if (payout.reserved_ledger_ref) {
        const releaseResult = await releaseLedgerHold({
          hold_ref: payout.reserved_ledger_ref,
          payout_id: payout.id,
          reason: reason || 'user_cancelled',
          metadata: { cancelled_by: req.user?.id }
        });

        if (releaseResult.status === 'failed') {
          throw new Error(`Failed to release hold: ${releaseResult.error}`);
        }
      }

      // Update payout
      await client.query(
        `UPDATE payouts
         SET status = 'cancelled',
             cancelled_at = now(),
             notes = COALESCE(notes, '') || ' | Cancelled: ' || $2
         WHERE id = $1`,
        [id, reason || 'user_cancelled']
      );

      // Remove from queue
      await client.query(
        'DELETE FROM payout_queue WHERE payout_id = $1',
        [id]
      );

      // Audit log
      await client.query(
        `INSERT INTO payout_audit (payout_id, actor_type, actor_id, action, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, 'user', req.user?.id || 'api', 'cancelled', JSON.stringify({ reason })]
      );

      return payout;
    });

    // Publish event
    await publishEvent('payouts', result.origin_entity_id, 'payout.cancelled', {
      payout_id: result.id,
      reference_code: result.reference_code,
      reason
    });

    console.log(`[Payouts] ✓ Cancelled payout ${result.reference_code}`);

    res.json({ success: true, payout_id: id });
  } catch (error: any) {
    console.error('[Payouts] Error cancelling payout:', error);

    res.status(500).json({
      error: 'cancellation_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/payouts
 * List payouts with filtering
 */
payoutsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      origin_module,
      origin_entity_id,
      currency,
      limit = 50,
      offset = 0
    } = req.query;

    let queryText = 'SELECT * FROM payouts WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (status) {
      queryText += ` AND status = $${paramCount++}`;
      values.push(status);
    }

    if (origin_module) {
      queryText += ` AND origin_module = $${paramCount++}`;
      values.push(origin_module);
    }

    if (origin_entity_id) {
      queryText += ` AND origin_entity_id = $${paramCount++}`;
      values.push(origin_entity_id);
    }

    if (currency) {
      queryText += ` AND currency = $${paramCount++}`;
      values.push(currency);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const { rows } = await pool.query(queryText, values);

    res.json({
      payouts: rows,
      count: rows.length,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('[Payouts] Error listing payouts:', error);

    res.status(500).json({
      error: 'list_failed',
      message: error.message
    });
  }
});

export default payoutsRouter;
