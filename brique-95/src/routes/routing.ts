/**
 * Routing API routes
 * Exposes routing decision and management endpoints
 */

import express, { Request, Response } from 'express';
import { decideRouting, RoutingInput } from '../lib/decision';
import { authzMiddleware, requireRole } from '../utils/authz';
import { pool } from '../db';
import { recordMetric } from '../utils/metrics';

export const routingRouter = express.Router();

/**
 * POST /v1/routing/decide
 * Make a routing decision for a payment
 */
routingRouter.post('/decide', authzMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Extract idempotency key
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Build input
    const input: RoutingInput = {
      idempotency_key: idempotencyKey,
      payment_id: req.body.payment_id,
      merchant_id: req.body.merchant_id || req.user?.merchant_id,
      user_id: req.body.user_id,
      amount: Number(req.body.amount),
      currency: req.body.currency,
      country: req.body.country,
      payment_method_hint: req.body.payment_method_hint,
      metadata: req.body.metadata
    };

    // Validate required fields
    const errors = validateRoutingInput(input);
    if (errors.length > 0) {
      res.status(400).json({
        error: 'validation_failed',
        errors
      });
      return;
    }

    // Make decision
    const decision = await decideRouting(input);

    // Record metrics
    const latency = Date.now() - startTime;
    recordMetric('routing_decision_latency_ms', latency);
    recordMetric('routing_decisions_total', 1, { route: decision.route });

    // Response
    res.json({
      decision_id: decision.id,
      route: decision.route,
      reason: decision.reason,
      cost_estimate: decision.costs[decision.route],
      sira: {
        score: decision.sira.score,
        reasons: decision.sira.reasons,
        confidence: decision.sira.confidence
      },
      fallback_routes: decision.fallback_routes,
      instructions: decision.reserve_ref
        ? { action: 'reserve_balance', reserve_ref: decision.reserve_ref }
        : undefined,
      expires_at: decision.expires_at,
      latency_ms: decision.latency_ms
    });

  } catch (error: any) {
    console.error('Routing decision error:', error);
    recordMetric('routing_errors_total', 1);

    res.status(500).json({
      error: 'routing_error',
      message: error.message
    });
  }
});

/**
 * GET /v1/routing/decisions/:decision_id
 * Retrieve a routing decision by ID
 */
routingRouter.get('/decisions/:decision_id', authzMiddleware, async (req: Request, res: Response) => {
  try {
    const { decision_id } = req.params;

    const result = await pool.query(
      `SELECT * FROM routing_decisions WHERE id = $1`,
      [decision_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'not_found',
        message: 'Decision not found'
      });
      return;
    }

    const decision = result.rows[0];

    // Authorization check (can only view own merchant's decisions)
    if (req.user?.role !== 'admin' && decision.merchant_id !== req.user?.merchant_id) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Access denied'
      });
      return;
    }

    res.json({
      id: decision.id,
      payment_id: decision.payment_id,
      merchant_id: decision.merchant_id,
      user_id: decision.user_id,
      amount: Number(decision.amount),
      currency: decision.currency,
      country: decision.country,
      decision: decision.decision,
      sira_snapshot: decision.sira_snapshot,
      execution_status: decision.execution_status,
      executed_at: decision.executed_at,
      created_at: decision.created_at,
      latency_ms: decision.decision_latency_ms
    });

  } catch (error: any) {
    console.error('Decision retrieval error:', error);
    res.status(500).json({
      error: 'retrieval_error',
      message: error.message
    });
  }
});

/**
 * GET /v1/routing/decisions
 * List routing decisions with filters
 */
routingRouter.get('/decisions', authzMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      merchant_id,
      user_id,
      route,
      limit = '100',
      offset = '0',
      from_date,
      to_date
    } = req.query;

    // Build query
    let query = `SELECT * FROM routing_decisions WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    // Authorization: non-admins can only see their own merchant
    if (req.user?.role !== 'admin') {
      query += ` AND merchant_id = $${paramIndex}`;
      params.push(req.user?.merchant_id);
      paramIndex++;
    } else if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex}`;
      params.push(merchant_id);
      paramIndex++;
    }

    if (user_id) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (route) {
      query += ` AND decision->>'route' = $${paramIndex}`;
      params.push(route);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await pool.query(query, params);

    res.json({
      decisions: result.rows,
      count: result.rows.length,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10)
    });

  } catch (error: any) {
    console.error('Decisions list error:', error);
    res.status(500).json({
      error: 'list_error',
      message: error.message
    });
  }
});

/**
 * PATCH /v1/routing/decisions/:decision_id/execute
 * Update execution status after payment processing
 */
routingRouter.patch('/decisions/:decision_id/execute', authzMiddleware, async (req: Request, res: Response) => {
  try {
    const { decision_id } = req.params;
    const { status, fallback_used } = req.body;

    if (!['success', 'failed', 'fallback_used'].includes(status)) {
      res.status(400).json({
        error: 'validation_failed',
        message: 'status must be one of: success, failed, fallback_used'
      });
      return;
    }

    const result = await pool.query(
      `UPDATE routing_decisions
       SET execution_status = $1,
           executed = true,
           executed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, decision_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'not_found',
        message: 'Decision not found'
      });
      return;
    }

    // If failed, create failure record
    if (status === 'failed') {
      const decision = result.rows[0];
      await pool.query(
        `INSERT INTO routing_failures (
          decision_id, route_attempted, error_message, status
        ) VALUES ($1, $2, $3, 'failed_permanent')`,
        [decision_id, decision.decision.route, req.body.error_message || 'Unknown error']
      );
    }

    res.json({
      success: true,
      decision_id,
      status
    });

  } catch (error: any) {
    console.error('Execution update error:', error);
    res.status(500).json({
      error: 'update_error',
      message: error.message
    });
  }
});

/**
 * GET /v1/routing/metrics
 * Get routing metrics
 */
routingRouter.get('/metrics', authzMiddleware, requireRole(['admin', 'ops']), async (req: Request, res: Response) => {
  try {
    const { days = '7' } = req.query;

    const result = await pool.query(
      `SELECT
        day,
        route,
        country,
        currency,
        count,
        total_amount,
        success_count,
        failed_count,
        fallback_count,
        total_molam_fees,
        total_partner_fees,
        avg_latency_ms
       FROM routing_metrics
       WHERE day >= CURRENT_DATE - $1::integer
       ORDER BY day DESC, count DESC`,
      [parseInt(days as string, 10)]
    );

    res.json({
      metrics: result.rows,
      period_days: parseInt(days as string, 10)
    });

  } catch (error: any) {
    console.error('Metrics retrieval error:', error);
    res.status(500).json({
      error: 'metrics_error',
      message: error.message
    });
  }
});

/**
 * Helper: Validate routing input
 */
function validateRoutingInput(input: RoutingInput): string[] {
  const errors: string[] = [];

  if (!input.merchant_id) {
    errors.push('merchant_id is required');
  }

  if (!input.user_id) {
    errors.push('user_id is required');
  }

  if (!input.amount || input.amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (!input.currency || input.currency.length !== 3) {
    errors.push('currency must be a 3-letter ISO code');
  }

  if (!input.country || input.country.length !== 2) {
    errors.push('country must be a 2-letter ISO code');
  }

  return errors;
}

export default routingRouter;
