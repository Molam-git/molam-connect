/**
 * Brique 120: Payouts Engine API Routes
 * Routes pour création et gestion des payouts
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';

const router = Router();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * Helper: Calculate fees using SQL function
 */
async function calculateFees(currency: string, amount: number, priority: string, originModule: string) {
  const result = await pool.query(
    'SELECT * FROM calculate_payout_fees($1, $2, $3, $4)',
    [currency, amount, priority, originModule]
  );
  return result.rows[0] || { molam_fee: 0, bank_fee: 0, net_amount: amount };
}

/**
 * Helper: Generate reference code
 */
function generateReferenceCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PO-${date}-${random}`;
}

/**
 * POST /api/payouts
 * Create a new payout (idempotent)
 */
router.post('/', async (req: Request, res: Response) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'idempotency_key_required',
      message: 'Header Idempotency-Key is required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check idempotency
    const existing = await client.query(
      'SELECT * FROM payouts WHERE external_id = $1',
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        payout: existing.rows[0],
        idempotent: true
      });
    }

    // Extract request data
    const {
      origin_module,
      origin_entity_id,
      currency,
      amount,
      beneficiary,
      priority = 'normal',
      scheduled_run,
      bank_profile_id,
      treasury_account_id,
      metadata
    } = req.body;

    // Validation
    if (!origin_module || !origin_entity_id || !currency || !amount || !beneficiary) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'missing_required_fields',
        required: ['origin_module', 'origin_entity_id', 'currency', 'amount', 'beneficiary']
      });
    }

    if (amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Amount must be greater than 0'
      });
    }

    const validPriorities = ['instant', 'priority', 'normal', 'low'];
    if (!validPriorities.includes(priority)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'invalid_priority',
        message: `Priority must be one of: ${validPriorities.join(', ')}`
      });
    }

    // Calculate fees
    const fees = await calculateFees(currency, amount, priority, origin_module);

    // Generate reference code
    const referenceCode = generateReferenceCode();

    // Create ledger hold
    const holdResult = await client.query(
      'SELECT create_ledger_hold($1, $2, $3, $4, $5, $6) as hold_id',
      [
        origin_entity_id,
        currency,
        amount,
        'payout_hold',
        'payout',
        null // Will update after payout creation
      ]
    );

    const holdId = holdResult.rows[0].hold_id;

    // Create payout
    const payoutResult = await client.query(`
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
        bank_profile_id,
        treasury_account_id,
        priority,
        scheduled_run,
        reference_code,
        metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      idempotencyKey,
      origin_module,
      origin_entity_id,
      currency,
      amount,
      fees.net_amount,
      fees.molam_fee,
      fees.bank_fee,
      JSON.stringify(beneficiary),
      bank_profile_id || null,
      treasury_account_id || null,
      priority,
      scheduled_run || null,
      referenceCode,
      metadata ? JSON.stringify(metadata) : null,
      req.body.user_id || null
    ]);

    const payout = payoutResult.rows[0];

    // Update hold with payout reference
    await client.query(
      'UPDATE ledger_holds SET ref_id = $1 WHERE id = $2',
      [payout.id, holdId]
    );

    // Log event
    await client.query(
      'SELECT log_payout_event($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        payout.id,
        null,
        'created',
        'operational',
        'info',
        `Payout created for ${origin_module} entity ${origin_entity_id}`,
        JSON.stringify({
          currency,
          amount,
          priority,
          reference_code: referenceCode
        }),
        req.body.user_id || null
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      payout,
      hold_id: holdId
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create payout error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to create payout'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/payouts/:id
 * Get payout details
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Get payout
    const payoutResult = await pool.query(
      'SELECT * FROM payouts WHERE id = $1',
      [id]
    );

    if (payoutResult.rows.length === 0) {
      return res.status(404).json({
        error: 'payout_not_found'
      });
    }

    const payout = payoutResult.rows[0];

    // Get hold
    const holdResult = await pool.query(
      'SELECT * FROM ledger_holds WHERE ref_type = $1 AND ref_id = $2',
      ['payout', id]
    );

    // Get events
    const eventsResult = await pool.query(
      'SELECT * FROM payout_events WHERE payout_id = $1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );

    // Get batch info if applicable
    const batchResult = await pool.query(`
      SELECT pb.* FROM payout_batches pb
      JOIN payout_batch_lines pbl ON pb.id = pbl.batch_id
      WHERE pbl.payout_id = $1
      LIMIT 1
    `, [id]);

    res.json({
      success: true,
      payout,
      hold: holdResult.rows[0] || null,
      events: eventsResult.rows,
      batch: batchResult.rows[0] || null
    });

  } catch (error) {
    console.error('Get payout error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  }
});

/**
 * GET /api/payouts
 * List payouts with filters
 */
router.get('/', async (req: Request, res: Response) => {
  const {
    status,
    priority,
    origin_module,
    origin_entity_id,
    currency,
    from_date,
    to_date,
    page = 1,
    limit = 20
  } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (priority) {
    conditions.push(`priority = $${paramIndex++}`);
    params.push(priority);
  }

  if (origin_module) {
    conditions.push(`origin_module = $${paramIndex++}`);
    params.push(origin_module);
  }

  if (origin_entity_id) {
    conditions.push(`origin_entity_id = $${paramIndex++}`);
    params.push(origin_entity_id);
  }

  if (currency) {
    conditions.push(`currency = $${paramIndex++}`);
    params.push(currency);
  }

  if (from_date) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(from_date);
  }

  if (to_date) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(to_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM payouts ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    // Get payouts
    const payoutsResult = await pool.query(`
      SELECT * FROM payouts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit as string), offset]);

    res.json({
      success: true,
      payouts: payoutsResult.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });

  } catch (error) {
    console.error('List payouts error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  }
});

/**
 * POST /api/payouts/:id/cancel
 * Cancel a pending payout
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get payout
    const payoutResult = await client.query(
      'SELECT * FROM payouts WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (payoutResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'payout_not_found'
      });
    }

    const payout = payoutResult.rows[0];

    // Check if cancellable
    const cancellableStatuses = ['pending', 'queued'];
    if (!cancellableStatuses.includes(payout.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'payout_not_cancellable',
        message: `Cannot cancel payout with status: ${payout.status}`
      });
    }

    // Update payout status
    await client.query(
      'UPDATE payouts SET status = $1, updated_at = now() WHERE id = $2',
      ['cancelled', id]
    );

    // Release hold
    const holdResult = await client.query(
      'SELECT id FROM ledger_holds WHERE ref_type = $1 AND ref_id = $2 AND status = $3',
      ['payout', id, 'active']
    );

    if (holdResult.rows.length > 0) {
      await client.query(
        'UPDATE ledger_holds SET status = $1, released_at = now() WHERE id = $2',
        ['cancelled', holdResult.rows[0].id]
      );
    }

    // Log event
    await client.query(
      'SELECT log_payout_event($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        id,
        null,
        'cancelled',
        'operational',
        'warning',
        reason || 'Payout cancelled by user',
        JSON.stringify({ cancelled_by: req.body.user_id }),
        req.body.user_id || null
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Payout cancelled successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel payout error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/payouts/summary/pending
 * Get summary of pending payouts
 */
router.get('/summary/pending', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM pending_payouts_summary
      ORDER BY total_amount DESC
    `);

    res.json({
      success: true,
      summary: result.rows
    });

  } catch (error) {
    console.error('Get pending summary error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  }
});

/**
 * GET /api/payouts/failed/dlq
 * Get failed payouts in dead letter queue
 */
router.get('/failed/dlq', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM failed_payouts_dlq
      LIMIT 100
    `);

    res.json({
      success: true,
      failed_payouts: result.rows
    });

  } catch (error) {
    console.error('Get DLQ error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  }
});

/**
 * GET /api/batches
 * List payout batches
 */
router.get('/batches', async (req: Request, res: Response) => {
  const { status, currency, from_date, limit = 20 } = req.query;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (currency) {
    conditions.push(`currency = $${paramIndex++}`);
    params.push(currency);
  }

  if (from_date) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(from_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(`
      SELECT * FROM batch_execution_summary
      ${whereClause}
      LIMIT $${paramIndex}
    `, [...params, parseInt(limit as string)]);

    res.json({
      success: true,
      batches: result.rows
    });

  } catch (error) {
    console.error('List batches error:', error);
    res.status(500).json({
      error: 'internal_error'
    });
  }
});

export default router;
