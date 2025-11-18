/**
 * Admin routes for managing routing rules and overrides
 * Restricted to ops/admin roles
 */

import express, { Request, Response } from 'express';
import { authzMiddleware, requireRole } from '../utils/authz';
import { pool } from '../db';
import { cacheDeletePattern } from '../lib/cache';

export const adminRouter = express.Router();

// All admin routes require ops or admin role
adminRouter.use(authzMiddleware);
adminRouter.use(requireRole(['admin', 'ops']));

/**
 * GET /v1/admin/rules
 * List all routing rules
 */
adminRouter.get('/rules', async (req: Request, res: Response) => {
  try {
    const { is_active, rule_type } = req.query;

    let query = `SELECT * FROM routing_rules WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(is_active === 'true');
      paramIndex++;
    }

    if (rule_type) {
      query += ` AND rule_type = $${paramIndex}`;
      params.push(rule_type);
      paramIndex++;
    }

    query += ` ORDER BY priority ASC, created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      rules: result.rows,
      count: result.rows.length
    });

  } catch (error: any) {
    console.error('Rules list error:', error);
    res.status(500).json({
      error: 'list_error',
      message: error.message
    });
  }
});

/**
 * POST /v1/admin/rules
 * Create a new routing rule
 */
adminRouter.post('/rules', async (req: Request, res: Response) => {
  try {
    const {
      scope,
      priority,
      rule_type,
      params,
      description
    } = req.body;

    // Validation
    const errors: string[] = [];

    if (priority === undefined || priority < 0) {
      errors.push('priority must be a non-negative integer');
    }

    const validRuleTypes = [
      'prefer_wallet', 'prefer_connect', 'cost_threshold',
      'force_connect', 'force_wallet', 'hybrid_threshold',
      'time_based', 'amount_based', 'merchant_override'
    ];

    if (!rule_type || !validRuleTypes.includes(rule_type)) {
      errors.push(`rule_type must be one of: ${validRuleTypes.join(', ')}`);
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: 'validation_failed',
        errors
      });
      return;
    }

    // Create rule
    const result = await pool.query(
      `INSERT INTO routing_rules (
        scope, priority, rule_type, params, description,
        created_by, created_by_email, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [
        JSON.stringify(scope || {}),
        priority,
        rule_type,
        JSON.stringify(params || {}),
        description || null,
        req.user?.id,
        req.user?.email
      ]
    );

    // Invalidate cache
    await cacheDeletePattern('sira:*');

    res.status(201).json({
      rule: result.rows[0]
    });

  } catch (error: any) {
    console.error('Rule creation error:', error);
    res.status(500).json({
      error: 'creation_error',
      message: error.message
    });
  }
});

/**
 * PATCH /v1/admin/rules/:rule_id
 * Update a routing rule
 */
adminRouter.patch('/rules/:rule_id', async (req: Request, res: Response) => {
  try {
    const { rule_id } = req.params;
    const {
      scope,
      priority,
      params,
      description,
      is_active
    } = req.body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (scope !== undefined) {
      updates.push(`scope = $${paramIndex}`);
      values.push(JSON.stringify(scope));
      paramIndex++;
    }

    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      values.push(priority);
      paramIndex++;
    }

    if (params !== undefined) {
      updates.push(`params = $${paramIndex}`);
      values.push(JSON.stringify(params));
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({
        error: 'validation_failed',
        message: 'No fields to update'
      });
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(rule_id);

    const query = `
      UPDATE routing_rules
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'not_found',
        message: 'Rule not found'
      });
      return;
    }

    // Invalidate cache
    await cacheDeletePattern('sira:*');

    res.json({
      rule: result.rows[0]
    });

  } catch (error: any) {
    console.error('Rule update error:', error);
    res.status(500).json({
      error: 'update_error',
      message: error.message
    });
  }
});

/**
 * DELETE /v1/admin/rules/:rule_id
 * Delete a routing rule
 */
adminRouter.delete('/rules/:rule_id', async (req: Request, res: Response) => {
  try {
    const { rule_id } = req.params;

    const result = await pool.query(
      `DELETE FROM routing_rules WHERE id = $1 RETURNING id`,
      [rule_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'not_found',
        message: 'Rule not found'
      });
      return;
    }

    // Invalidate cache
    await cacheDeletePattern('sira:*');

    res.json({
      success: true,
      rule_id
    });

  } catch (error: any) {
    console.error('Rule deletion error:', error);
    res.status(500).json({
      error: 'deletion_error',
      message: error.message
    });
  }
});

/**
 * POST /v1/admin/overrides
 * Create a manual routing override (emergency use)
 */
adminRouter.post('/overrides', async (req: Request, res: Response) => {
  try {
    const {
      scope,
      forced_route,
      reason,
      valid_until
    } = req.body;

    // Validation
    if (!forced_route || !['wallet', 'connect', 'hybrid', 'disabled'].includes(forced_route)) {
      res.status(400).json({
        error: 'validation_failed',
        message: 'forced_route must be one of: wallet, connect, hybrid, disabled'
      });
      return;
    }

    if (!reason || reason.length < 10) {
      res.status(400).json({
        error: 'validation_failed',
        message: 'reason must be at least 10 characters'
      });
      return;
    }

    // Create override
    const result = await pool.query(
      `INSERT INTO routing_overrides (
        scope, forced_route, reason, valid_until,
        created_by, created_by_email, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *`,
      [
        JSON.stringify(scope || {}),
        forced_route,
        reason,
        valid_until || null,
        req.user?.id,
        req.user?.email
      ]
    );

    // Invalidate decision cache
    await cacheDeletePattern('routing:idem:*');

    res.status(201).json({
      override: result.rows[0],
      warning: 'This override will affect routing decisions immediately'
    });

  } catch (error: any) {
    console.error('Override creation error:', error);
    res.status(500).json({
      error: 'creation_error',
      message: error.message
    });
  }
});

/**
 * GET /v1/admin/overrides
 * List all routing overrides
 */
adminRouter.get('/overrides', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.query;

    let query = `SELECT * FROM routing_overrides WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(is_active === 'true');
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      overrides: result.rows,
      count: result.rows.length
    });

  } catch (error: any) {
    console.error('Overrides list error:', error);
    res.status(500).json({
      error: 'list_error',
      message: error.message
    });
  }
});

/**
 * DELETE /v1/admin/overrides/:override_id
 * Deactivate a routing override
 */
adminRouter.delete('/overrides/:override_id', async (req: Request, res: Response) => {
  try {
    const { override_id } = req.params;

    const result = await pool.query(
      `UPDATE routing_overrides
       SET is_active = false
       WHERE id = $1
       RETURNING *`,
      [override_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'not_found',
        message: 'Override not found'
      });
      return;
    }

    // Invalidate cache
    await cacheDeletePattern('routing:idem:*');

    res.json({
      success: true,
      override_id
    });

  } catch (error: any) {
    console.error('Override deactivation error:', error);
    res.status(500).json({
      error: 'deactivation_error',
      message: error.message
    });
  }
});

/**
 * GET /v1/admin/failures
 * List routing failures for monitoring
 */
adminRouter.get('/failures', async (req: Request, res: Response) => {
  try {
    const { status, limit = '100', offset = '0' } = req.query;

    let query = `
      SELECT rf.*, rd.payment_id, rd.merchant_id, rd.user_id, rd.amount
      FROM routing_failures rf
      JOIN routing_decisions rd ON rf.decision_id = rd.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND rf.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY rf.last_attempted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await pool.query(query, params);

    res.json({
      failures: result.rows,
      count: result.rows.length,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10)
    });

  } catch (error: any) {
    console.error('Failures list error:', error);
    res.status(500).json({
      error: 'list_error',
      message: error.message
    });
  }
});

/**
 * POST /v1/admin/simulate
 * Simulate a routing decision without persisting (testing)
 */
adminRouter.post('/simulate', async (req: Request, res: Response) => {
  try {
    // This would call the decision logic in dry-run mode
    // For now, just return mock response
    res.json({
      simulation: true,
      message: 'Simulation endpoint - not yet implemented'
    });

  } catch (error: any) {
    console.error('Simulation error:', error);
    res.status(500).json({
      error: 'simulation_error',
      message: error.message
    });
  }
});

export default adminRouter;
