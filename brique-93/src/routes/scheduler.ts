// Scheduler API Routes

import express, { Request, Response } from 'express';
import { pool } from '../utils/db';
import schedulerService from '../services/scheduler';
import approvalService from '../services/approval';

export const schedulerRouter = express.Router();

/**
 * POST /api/scheduler/generate-plan
 * Generate a batch plan
 */
schedulerRouter.post('/generate-plan', async (req: Request, res: Response) => {
  try {
    const {
      treasury_account_id,
      planned_for,
      max_items,
      priority,
      currency
    } = req.body;

    if (!treasury_account_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'treasury_account_id is required'
      });
    }

    const plan = await schedulerService.generatePlan({
      treasury_account_id,
      planned_for: planned_for ? new Date(planned_for) : undefined,
      max_items: max_items || 500,
      priority: priority || 100,
      currency,
      created_by: req.user?.id || 'api'
    });

    res.status(201).json(plan);
  } catch (error: any) {
    console.error('[Scheduler API] Error generating plan:', error);

    res.status(500).json({
      error: 'plan_generation_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/execute-plan
 * Execute an approved plan
 */
schedulerRouter.post('/execute-plan', async (req: Request, res: Response) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'plan_id is required'
      });
    }

    const result = await schedulerService.executePlan(plan_id, req.user?.id || 'api');

    res.json(result);
  } catch (error: any) {
    console.error('[Scheduler API] Error executing plan:', error);

    res.status(500).json({
      error: 'plan_execution_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/cancel-plan
 * Cancel a plan
 */
schedulerRouter.post('/cancel-plan', async (req: Request, res: Response) => {
  try {
    const { plan_id, reason } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'plan_id is required'
      });
    }

    await schedulerService.cancelPlan(plan_id, req.user?.id || 'api', reason || 'User cancelled');

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Scheduler API] Error cancelling plan:', error);

    res.status(500).json({
      error: 'plan_cancellation_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/approve-plan
 * Add approval to a plan
 */
schedulerRouter.post('/approve-plan', async (req: Request, res: Response) => {
  try {
    const { plan_id, signature } = req.body;

    if (!plan_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'plan_id is required'
      });
    }

    const result = await approvalService.addApproval({
      entity_type: 'batch_plan',
      entity_id: plan_id,
      actor_id: req.user?.id || 'api',
      actor_name: req.user?.name || 'API User',
      actor_role: req.user?.role || 'finance_ops',
      signature
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Scheduler API] Error approving plan:', error);

    res.status(500).json({
      error: 'approval_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/scheduler/reject-plan
 * Reject a plan
 */
schedulerRouter.post('/reject-plan', async (req: Request, res: Response) => {
  try {
    const { plan_id, reason } = req.body;

    if (!plan_id || !reason) {
      return res.status(400).json({
        error: 'missing_required_fields',
        message: 'plan_id and reason are required'
      });
    }

    await approvalService.rejectApproval(
      'batch_plan',
      plan_id,
      req.user?.id || 'api',
      reason
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Scheduler API] Error rejecting plan:', error);

    res.status(500).json({
      error: 'rejection_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/scheduler/plan/:id
 * Get plan details
 */
schedulerRouter.get('/plan/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM payout_batch_plans WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Plan not found'
      });
    }

    const plan = rows[0];

    // Get approval status
    const approvalStatus = await approvalService.getApprovalStatus('batch_plan', id);

    res.json({
      ...plan,
      approval_status: approvalStatus
    });
  } catch (error: any) {
    console.error('[Scheduler API] Error fetching plan:', error);

    res.status(500).json({
      error: 'fetch_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/scheduler/plans
 * List plans with filtering
 */
schedulerRouter.get('/plans', async (req: Request, res: Response) => {
  try {
    const {
      status,
      treasury_account_id,
      currency,
      limit = 50,
      offset = 0
    } = req.query;

    let queryText = 'SELECT * FROM payout_batch_plans WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (status) {
      queryText += ` AND status = $${paramCount++}`;
      values.push(status);
    }

    if (treasury_account_id) {
      queryText += ` AND treasury_account_id = $${paramCount++}`;
      values.push(treasury_account_id);
    }

    if (currency) {
      queryText += ` AND currency = $${paramCount++}`;
      values.push(currency);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const { rows } = await pool.query(queryText, values);

    res.json({
      plans: rows,
      count: rows.length,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('[Scheduler API] Error listing plans:', error);

    res.status(500).json({
      error: 'list_failed',
      message: error.message
    });
  }
});

export default schedulerRouter;
