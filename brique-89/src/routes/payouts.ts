// Payout REST API Routes

import express, { Request, Response } from 'express';
import {
  createPayout,
  getPayoutById,
  approvePayout,
  cancelPayout,
  listPayouts,
} from '../services/payout-service';

const router = express.Router();

/**
 * POST /api/payouts
 * Create new payout
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Get idempotency key from header or body
    const idempotency_key =
      req.headers['idempotency-key'] || req.body.external_id;

    if (!idempotency_key) {
      return res.status(400).json({
        error: 'idempotency_key_required',
        message: 'Please provide Idempotency-Key header or external_id in body',
      });
    }

    const {
      origin_module,
      origin_entity_id,
      amount,
      currency,
      beneficiary,
      priority,
      scheduled_for,
      metadata,
    } = req.body;

    // Validate required fields
    if (!origin_module || !origin_entity_id || !amount || !currency || !beneficiary) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'origin_module, origin_entity_id, amount, currency, and beneficiary are required',
      });
    }

    // Create payout
    const result = await createPayout({
      external_id: idempotency_key as string,
      origin_module,
      origin_entity_id,
      amount: parseFloat(amount),
      currency,
      beneficiary,
      priority: priority || 'normal',
      scheduled_for: scheduled_for ? new Date(scheduled_for) : undefined,
      created_by: (req as any).user?.id || null,
      metadata,
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating payout:', error);
    res.status(500).json({
      error: 'payout_creation_failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/payouts
 * List payouts with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      origin_module,
      currency,
      priority,
      limit = '50',
      offset = '0',
    } = req.query;

    const payouts = await listPayouts({
      status: status as string,
      origin_module: origin_module as string,
      currency: currency as string,
      priority: priority as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({
      payouts,
      count: payouts.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Error listing payouts:', error);
    res.status(500).json({
      error: 'list_payouts_failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/payouts/:id
 * Get payout by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const payout = await getPayoutById(id);

    if (!payout) {
      return res.status(404).json({
        error: 'payout_not_found',
        message: `Payout with ID ${id} not found`,
      });
    }

    res.json(payout);
  } catch (error: any) {
    console.error('Error getting payout:', error);
    res.status(500).json({
      error: 'get_payout_failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/payouts/:id/approve
 * Approve payout
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approver_id, approver_role, comment } = req.body;

    if (!approver_id || !approver_role) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'approver_id and approver_role are required',
      });
    }

    const result = await approvePayout(id, approver_id, approver_role, comment);

    if (!result.success) {
      return res.status(400).json({
        error: 'approval_failed',
        message: result.error,
      });
    }

    res.json({
      success: true,
      approved: result.approved,
      message: result.approved
        ? 'Payout fully approved and queued for processing'
        : 'Approval recorded, waiting for additional approvals',
    });
  } catch (error: any) {
    console.error('Error approving payout:', error);
    res.status(500).json({
      error: 'approve_payout_failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/payouts/:id/cancel
 * Cancel payout
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, cancelled_by } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'reason is required',
      });
    }

    const result = await cancelPayout(id, reason, cancelled_by);

    if (!result.success) {
      return res.status(400).json({
        error: 'cancellation_failed',
        message: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Payout cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling payout:', error);
    res.status(500).json({
      error: 'cancel_payout_failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/payouts/:id/attempts
 * Get payout attempt history
 */
router.get('/:id/attempts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: attempts } = await (req as any).db.query(
      `SELECT * FROM payout_attempts WHERE payout_id = $1 ORDER BY attempted_at DESC`,
      [id]
    );

    res.json({ attempts });
  } catch (error: any) {
    console.error('Error getting payout attempts:', error);
    res.status(500).json({
      error: 'get_attempts_failed',
      message: error.message,
    });
  }
});

/**
 * GET /health
 * Health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const { rows: stats } = await (req as any).db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'created') as created_count,
        COUNT(*) FILTER (WHERE status = 'queued') as queued_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'held') as held_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
      FROM payouts
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: stats[0],
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
