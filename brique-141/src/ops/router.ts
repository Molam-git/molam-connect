/**
 * BRIQUE 141 — Ops UI Routes
 * API pour plans opérationnels avec approbations multi-sig
 */

import express from 'express';
import { pool } from '../db';
import { requireRole, authzMiddleware } from '../utils/authz';
import { publishEvent } from '../events/publisher';
import { enqueuePlanRun } from './worker-queue';

export const opsRouter = express.Router();
opsRouter.use(authzMiddleware);

/**
 * POST /api/ops/plans
 * Create a plan (draft)
 */
opsRouter.post(
  '/plans',
  requireRole(['pay_admin', 'finance_ops', 'ops']),
  async (req: any, res) => {
    const { external_id, name, description, plan_type, payload, required_approvals } = req.body;

    if (!name || !plan_type || !payload) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO ops_plans(external_id, name, description, originator, plan_type, payload, required_approvals)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          external_id || null,
          name,
          description,
          req.user.id,
          plan_type,
          payload,
          required_approvals || 1,
        ]
      );

      // Journal
      await pool.query(
        `INSERT INTO ops_journal(plan_id, actor, role, action, details)
         VALUES ($1, $2, $3, 'create', $4)`,
        [rows[0].id, req.user.id, req.user.roles.join(','), { name }]
      );

      res.status(201).json(rows[0]);
    } catch (error: any) {
      console.error('[Ops] Error creating plan:', error);
      res.status(500).json({ error: 'failed_to_create_plan' });
    }
  }
);

/**
 * GET /api/ops/plans
 * List plans
 */
opsRouter.get('/plans', requireRole(['pay_admin', 'finance_ops', 'ops', 'auditor']), async (req: any, res) => {
  const { status, limit = 50 } = req.query;

  try {
    let query = `SELECT * FROM ops_plans_summary WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[Ops] Error listing plans:', error);
    res.status(500).json({ error: 'failed_to_list_plans' });
  }
});

/**
 * GET /api/ops/plans/:id
 * Get plan details
 */
opsRouter.get('/plans/:id', requireRole(['pay_admin', 'finance_ops', 'ops', 'auditor']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(`SELECT * FROM ops_plans WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Ops] Error fetching plan:', error);
    res.status(500).json({ error: 'failed_to_fetch_plan' });
  }
});

/**
 * POST /api/ops/plans/:id/stage
 * Stage a plan (optional: ask SIRA for recommendations)
 */
opsRouter.post('/plans/:id/stage', requireRole(['pay_admin', 'ops']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(`SELECT * FROM ops_plans WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const plan = rows[0];

    // Compute estimated impact via SIRA (stub)
    const estimated = {
      cost_usd: 0,
      affected_payouts: 0,
      affected_merchants: 0,
      risk_score: 0.1,
      simulation_recommended: plan.payload.total_amount > 100000,
    };

    await pool.query(
      `UPDATE ops_plans
       SET status = 'staged', estimated_impact = $2, updated_at = now()
       WHERE id = $1`,
      [id, estimated]
    );

    await pool.query(
      `INSERT INTO ops_journal(plan_id, actor, role, action, details)
       VALUES ($1, $2, $3, 'stage', $4)`,
      [id, req.user.id, req.user.roles.join(','), { estimated }]
    );

    res.json({ ok: true, estimated });
  } catch (error) {
    console.error('[Ops] Error staging plan:', error);
    res.status(500).json({ error: 'failed_to_stage_plan' });
  }
});

/**
 * POST /api/ops/plans/:id/approve
 * Approve plan (multi-sig)
 */
opsRouter.post('/plans/:id/approve', requireRole(['pay_admin', 'finance_ops', 'ops']), async (req: any, res) => {
  const { id } = req.params;
  const { signature } = req.body;

  try {
    const { rows } = await pool.query(`SELECT * FROM ops_plans WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const plan = rows[0];
    const approvals = plan.approvals || [];

    // Check if already approved by this user
    const alreadyApproved = approvals.find((a: any) => a.user_id === req.user.id);
    if (alreadyApproved) {
      return res.status(400).json({ error: 'already_approved' });
    }

    const approval = {
      user_id: req.user.id,
      role: req.user.roles.join(','),
      approved_at: new Date().toISOString(),
      signature: signature || null,
    };

    const newApprovals = [...approvals, approval];
    const approvedCount = newApprovals.length;
    const finalStatus = approvedCount >= plan.required_approvals ? 'approved' : plan.status;

    await pool.query(
      `UPDATE ops_plans
       SET approvals = $2, status = $3, updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(newApprovals), finalStatus]
    );

    await pool.query(
      `INSERT INTO ops_journal(plan_id, actor, role, action, details)
       VALUES ($1, $2, $3, 'approve', $4)`,
      [id, req.user.id, req.user.roles.join(','), approval]
    );

    publishEvent('ops', id, 'ops.plan.approved', {
      plan_id: id,
      approved_by: req.user.id,
      status: finalStatus,
      approvals_count: approvedCount,
      required: plan.required_approvals,
    });

    res.json({ status: finalStatus, approvals: newApprovals });
  } catch (error) {
    console.error('[Ops] Error approving plan:', error);
    res.status(500).json({ error: 'failed_to_approve_plan' });
  }
});

/**
 * POST /api/ops/plans/:id/execute
 * Execute plan (idempotent). Enqueue run worker.
 */
opsRouter.post('/plans/:id/execute', requireRole(['pay_admin', 'ops']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(`SELECT * FROM ops_plans WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    const plan = rows[0];

    if (plan.status !== 'approved' && !req.user.roles.includes('pay_admin')) {
      return res.status(403).json({ error: 'plan_not_approved' });
    }

    // Create run (idempotency via header optional)
    const idempotencyKey = req.headers['idempotency-key'] || `plan-${id}-${Date.now()}`;

    const { rows: runRows } = await pool.query(
      `INSERT INTO ops_plan_runs(plan_id, run_by, status)
       VALUES ($1, $2, 'queued')
       RETURNING *`,
      [id, req.user.id]
    );

    const run = runRows[0];

    await pool.query(
      `UPDATE ops_plans
       SET status = 'executing', updated_at = now()
       WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO ops_journal(plan_id, actor, role, action, details)
       VALUES ($1, $2, $3, 'execute', $4)`,
      [id, req.user.id, req.user.roles.join(','), { run_id: run.id, idempotency_key: idempotencyKey }]
    );

    // Enqueue background worker
    await enqueuePlanRun(run.id);

    publishEvent('ops', id, 'ops.plan.executing', {
      plan_id: id,
      run_id: run.id,
      executed_by: req.user.id,
    });

    res.json({ run_id: run.id });
  } catch (error) {
    console.error('[Ops] Error executing plan:', error);
    res.status(500).json({ error: 'failed_to_execute_plan' });
  }
});

/**
 * POST /api/ops/plans/:id/rollback
 * Rollback plan execution
 */
opsRouter.post('/plans/:id/rollback', requireRole(['pay_admin', 'ops']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(`SELECT * FROM ops_plans WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found' });
    }

    // Create rollback run
    const { rows: runRows } = await pool.query(
      `INSERT INTO ops_plan_runs(plan_id, run_by, status)
       VALUES ($1, $2, 'queued')
       RETURNING *`,
      [id, req.user.id]
    );

    await pool.query(
      `INSERT INTO ops_journal(plan_id, actor, role, action, details)
       VALUES ($1, $2, $3, 'rollback', $4)`,
      [id, req.user.id, req.user.roles.join(','), { run_id: runRows[0].id }]
    );

    await pool.query(
      `UPDATE ops_plans
       SET status = 'rolling_back', updated_at = now()
       WHERE id = $1`,
      [id]
    );

    await enqueuePlanRun(runRows[0].id, { rollback: true });

    res.json({ ok: true, run_id: runRows[0].id });
  } catch (error) {
    console.error('[Ops] Error rolling back plan:', error);
    res.status(500).json({ error: 'failed_to_rollback_plan' });
  }
});

/**
 * GET /api/ops/plans/:id/journal
 * Get plan journal (audit trail)
 */
opsRouter.get('/plans/:id/journal', requireRole(['pay_admin', 'ops', 'auditor']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ops_journal
       WHERE plan_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error('[Ops] Error fetching journal:', error);
    res.status(500).json({ error: 'failed_to_fetch_journal' });
  }
});

/**
 * GET /api/ops/plans/:id/runs
 * Get plan runs
 */
opsRouter.get('/plans/:id/runs', requireRole(['pay_admin', 'ops', 'auditor']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ops_plan_runs
       WHERE plan_id = $1
       ORDER BY run_at DESC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error('[Ops] Error fetching runs:', error);
    res.status(500).json({ error: 'failed_to_fetch_runs' });
  }
});

export default opsRouter;
