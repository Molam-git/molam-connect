/**
 * Brique 116quinquies: Dynamic A/B Routing - API Routes
 * API endpoints for managing A/B routing tests
 */

import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';

const router = express.Router();

// Validation schemas
const CreateABTestSchema = z.object({
  merchantId: z.string().uuid(),
  currency: z.string().min(3).max(3),
  primaryRoute: z.string().min(1),
  testRoute: z.string().min(1),
  allocationPercent: z.number().int().min(1).max(50).default(5),
});

const UpdateABTestSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
  allocationPercent: z.number().int().min(1).max(50).optional(),
  endDate: z.string().datetime().optional(),
});

// Middleware pour vérifier les rôles (à adapter selon votre système)
function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * POST /api/routing/ab-test
 * Create a new A/B routing test
 */
router.post(
  '/ab-test',
  requireRole(['ops', 'pay_admin', 'sira_admin']),
  async (req: Request, res: Response) => {
    try {
      const data = CreateABTestSchema.parse(req.body);
      const db = req.app.locals.db as Pool;

      const { rows } = await db.query(
        `INSERT INTO routing_ab_tests (
          merchant_id, currency, primary_route, test_route, allocation_percent, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          data.merchantId,
          data.currency,
          data.primaryRoute,
          data.testRoute,
          data.allocationPercent,
          req.headers['x-user-id'] || 'system',
        ]
      );

      res.status(201).json({
        success: true,
        test: rows[0],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Error creating A/B test:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/routing/ab-test/list
 * List A/B tests with optional filters
 */
router.get('/ab-test/list', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { merchantId, status, currency } = req.query;

    let query = 'SELECT * FROM routing_ab_tests WHERE 1=1';
    const params: any[] = [];

    if (merchantId) {
      params.push(merchantId);
      query += ` AND merchant_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (currency) {
      params.push(currency);
      query += ` AND currency = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await db.query(query, params);

    res.json({
      success: true,
      tests: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error listing A/B tests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/ab-test/:id
 * Get details of a specific A/B test
 */
router.get('/ab-test/:id', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    const { rows } = await db.query(
      'SELECT * FROM routing_ab_tests WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json({
      success: true,
      test: rows[0],
    });
  } catch (error) {
    console.error('Error getting A/B test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/routing/ab-test/:id
 * Update an A/B test (status, allocation, etc.)
 */
router.patch(
  '/ab-test/:id',
  requireRole(['ops', 'pay_admin', 'sira_admin']),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateABTestSchema.parse(req.body);
      const db = req.app.locals.db as Pool;
      const { id } = req.params;

      const updates: string[] = [];
      const params: any[] = [];

      if (data.status) {
        params.push(data.status);
        updates.push(`status = $${params.length}`);
      }

      if (data.allocationPercent) {
        params.push(data.allocationPercent);
        updates.push(`allocation_percent = $${params.length}`);
      }

      if (data.endDate) {
        params.push(data.endDate);
        updates.push(`end_date = $${params.length}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      params.push(id);
      const { rows } = await db.query(
        `UPDATE routing_ab_tests SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Test not found' });
      }

      res.json({
        success: true,
        test: rows[0],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Error updating A/B test:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/routing/ab-test/:id/results
 * Get results for an A/B test
 */
router.get('/ab-test/:id/results', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;
    const { limit = 1000, offset = 0 } = req.query;

    const { rows } = await db.query(
      `SELECT * FROM routing_ab_results
       WHERE ab_test_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      success: true,
      results: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error getting A/B test results:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/ab-test/:id/performance
 * Get aggregated performance metrics for an A/B test
 */
router.get('/ab-test/:id/performance', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    const { rows } = await db.query(
      'SELECT * FROM routing_ab_performance WHERE test_id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Test not found or no data yet' });
    }

    res.json({
      success: true,
      performance: rows[0],
    });
  } catch (error) {
    console.error('Error getting A/B test performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/ab-test/:id/stats
 * Get detailed statistics using the Postgres function
 */
router.get('/ab-test/:id/stats', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    const { rows } = await db.query('SELECT * FROM get_ab_test_stats($1)', [id]);

    res.json({
      success: true,
      stats: rows,
    });
  } catch (error) {
    console.error('Error getting A/B test stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/ab-test/:id/evaluate
 * Evaluate an A/B test and make a decision using Sira
 */
router.post(
  '/ab-test/:id/evaluate',
  requireRole(['ops', 'pay_admin', 'sira_admin']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { minTransactions = 100, autoApply = false } = req.body;

      // Call Python Sira engine
      const pythonScript = path.join(__dirname, '..', 'sira', 'ab-router.py');
      const pythonProcess = spawn('python', [
        pythonScript,
        'evaluate',
        id,
        minTransactions.toString(),
        autoApply.toString(),
      ]);

      let result = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', error);
          return res.status(500).json({ error: 'Evaluation failed', details: error });
        }

        try {
          const decision = JSON.parse(result);
          res.json({
            success: true,
            decision,
          });
        } catch (parseError) {
          res.status(500).json({ error: 'Failed to parse evaluation result' });
        }
      });
    } catch (error) {
      console.error('Error evaluating A/B test:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/routing/ab-test/:id/decisions
 * Get decision history for an A/B test
 */
router.get('/ab-test/:id/decisions', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    const { rows } = await db.query(
      `SELECT * FROM routing_ab_decisions
       WHERE ab_test_id = $1
       ORDER BY decision_date DESC`,
      [id]
    );

    res.json({
      success: true,
      decisions: rows,
    });
  } catch (error) {
    console.error('Error getting decisions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/ab-test/:id/record-result
 * Record a transaction result for an A/B test
 */
router.post('/ab-test/:id/record-result', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;
    const { txnId, routeUsed, routeName, success, latencyMs, feePercent, errorCode, errorMessage } =
      req.body;

    await db.query(
      `INSERT INTO routing_ab_results (
        ab_test_id, txn_id, route_used, route_name,
        success, latency_ms, fee_percent, error_code, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, txnId, routeUsed, routeName, success, latencyMs, feePercent, errorCode, errorMessage]
    );

    res.json({
      success: true,
      message: 'Result recorded',
    });
  } catch (error) {
    console.error('Error recording result:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/routing/ab-test/:id
 * Delete an A/B test (soft delete by setting status to cancelled)
 */
router.delete(
  '/ab-test/:id',
  requireRole(['ops', 'pay_admin', 'sira_admin']),
  async (req: Request, res: Response) => {
    try {
      const db = req.app.locals.db as Pool;
      const { id } = req.params;

      const { rows } = await db.query(
        `UPDATE routing_ab_tests SET status = 'cancelled', end_date = now()
         WHERE id = $1 RETURNING *`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Test not found' });
      }

      res.json({
        success: true,
        message: 'Test cancelled',
        test: rows[0],
      });
    } catch (error) {
      console.error('Error deleting A/B test:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
