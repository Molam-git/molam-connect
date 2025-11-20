/**
 * SOUS-BRIQUE 140quater-1 — Simulator API Routes
 * Endpoints pour créer et exécuter simulations sandbox
 */

import express from 'express';
import { pool } from '../db';
import { requireRole, authzMiddleware } from '../utils/authz';
import { enqueueSimulationRun } from './queue';
import { v4 as uuidv4 } from 'uuid';

export const simulatorRouter = express.Router();
simulatorRouter.use(authzMiddleware);

/**
 * POST /api/simulator
 * Create a simulation definition
 */
simulatorRouter.post(
  '/',
  requireRole(['ops', 'dev', 'sira']),
  async (req: any, res) => {
    const {
      tenantType,
      tenantId,
      name,
      description,
      sdkLanguage,
      scenario,
      patchReference,
    } = req.body;

    if (!name || !sdkLanguage || !scenario) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO sdk_simulations
         (tenant_type, tenant_id, name, description, sdk_language, scenario, patch_reference, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
         RETURNING *`,
        [
          tenantType || 'internal',
          tenantId || null,
          name,
          description,
          sdkLanguage,
          scenario,
          patchReference || null,
          req.user.id,
        ]
      );

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('[Simulator] Error creating simulation:', error);
      res.status(500).json({ error: 'failed_to_create_simulation' });
    }
  }
);

/**
 * GET /api/simulator
 * List simulations (filtered by tenant if not ops)
 */
simulatorRouter.get('/', requireRole(['ops', 'dev', 'sira']), async (req: any, res) => {
  const { tenant_type, status, limit = 50 } = req.query;

  try {
    let query = `SELECT * FROM sdk_simulations WHERE 1=1`;
    const params: any[] = [];

    if (tenant_type) {
      params.push(tenant_type);
      query += ` AND tenant_type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json({ simulations: rows });
  } catch (error) {
    console.error('[Simulator] Error listing simulations:', error);
    res.status(500).json({ error: 'failed_to_list_simulations' });
  }
});

/**
 * GET /api/simulator/:id
 * Get simulation details
 */
simulatorRouter.get('/:id', requireRole(['ops', 'dev', 'sira']), async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(`SELECT * FROM sdk_simulations WHERE id = $1`, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'simulation_not_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Simulator] Error fetching simulation:', error);
    res.status(500).json({ error: 'failed_to_fetch_simulation' });
  }
});

/**
 * POST /api/simulator/:id/run
 * Launch a run (idempotent via Idempotency-Key header)
 */
simulatorRouter.post(
  '/:id/run',
  requireRole(['ops', 'dev']),
  async (req: any, res) => {
    const simId = req.params.id;
    const idempotencyKey =
      req.headers['idempotency-key'] || `${simId}-${req.user.id}-${Date.now()}`;
    const seed = Number(req.body.seed || Date.now());

    try {
      // Verify simulation exists
      const { rows: simRows } = await pool.query(
        `SELECT * FROM sdk_simulations WHERE id = $1`,
        [simId]
      );

      if (simRows.length === 0) {
        return res.status(404).json({ error: 'simulation_not_found' });
      }

      // Upsert run (idempotent)
      const insertQuery = `
        INSERT INTO sdk_simulation_runs(simulation_id, idempotency_key, seed, status)
        VALUES ($1, $2, $3, 'queued')
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING *`;

      const { rows } = await pool.query(insertQuery, [simId, idempotencyKey, seed]);
      let run = rows[0];

      if (!run) {
        // Already exists, fetch it
        const { rows: existing } = await pool.query(
          `SELECT * FROM sdk_simulation_runs WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        run = existing[0];
        return res.json({ run, already_queued: true });
      }

      // Journal entry
      await pool.query(
        `INSERT INTO sdk_simulation_journal(run_id, actor, action, details)
         VALUES ($1, $2, 'queued', $3)`,
        [run.id, `ops:${req.user.id}`, { seed, idempotency_key: idempotencyKey }]
      );

      // Enqueue background worker
      await enqueueSimulationRun(run.id);

      res.json({ run, queued: true });
    } catch (error: any) {
      console.error('[Simulator] Error launching run:', error);
      res.status(500).json({ error: 'failed_to_launch_run', message: error.message });
    }
  }
);

/**
 * GET /api/simulator/:id/runs
 * List runs for a simulation
 */
simulatorRouter.get(
  '/:id/runs',
  requireRole(['ops', 'dev', 'sira', 'auditor']),
  async (req: any, res) => {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    try {
      const { rows } = await pool.query(
        `SELECT * FROM sdk_simulation_runs
         WHERE simulation_id = $1
         ORDER BY run_at DESC
         LIMIT $2`,
        [id, limit]
      );

      res.json({ runs: rows });
    } catch (error) {
      console.error('[Simulator] Error listing runs:', error);
      res.status(500).json({ error: 'failed_to_list_runs' });
    }
  }
);

/**
 * GET /api/simulator/:id/runs/:runId
 * Fetch run status + metrics
 */
simulatorRouter.get(
  '/:id/runs/:runId',
  requireRole(['ops', 'dev', 'sira', 'auditor']),
  async (req: any, res) => {
    const { runId } = req.params;

    try {
      const { rows } = await pool.query(
        `SELECT * FROM sdk_simulation_runs WHERE id = $1`,
        [runId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'run_not_found' });
      }

      // Fetch journal entries
      const { rows: journalRows } = await pool.query(
        `SELECT * FROM sdk_simulation_journal
         WHERE run_id = $1
         ORDER BY created_at ASC`,
        [runId]
      );

      res.json({ run: rows[0], journal: journalRows });
    } catch (error) {
      console.error('[Simulator] Error fetching run:', error);
      res.status(500).json({ error: 'failed_to_fetch_run' });
    }
  }
);

/**
 * GET /api/ops/simulation-runs
 * Recent runs across all simulations (for Ops dashboard)
 */
simulatorRouter.get(
  '/ops/simulation-runs',
  requireRole(['ops', 'auditor']),
  async (req: any, res) => {
    const { limit = 20, status } = req.query;

    try {
      let query = `SELECT * FROM sdk_simulation_runs_summary WHERE 1=1`;
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
      console.error('[Simulator] Error fetching ops runs:', error);
      res.status(500).json({ error: 'failed_to_fetch_ops_runs' });
    }
  }
);

/**
 * POST /api/simulator/runs/:runId/approve-patch
 * Approve patch based on successful simulation
 */
simulatorRouter.post(
  '/runs/:runId/approve-patch',
  requireRole(['ops']),
  async (req: any, res) => {
    const { runId } = req.params;
    const { approval_notes } = req.body;

    try {
      // Fetch run
      const { rows: runRows } = await pool.query(
        `SELECT sr.*, s.patch_reference
         FROM sdk_simulation_runs sr
         JOIN sdk_simulations s ON sr.simulation_id = s.id
         WHERE sr.id = $1`,
        [runId]
      );

      if (runRows.length === 0) {
        return res.status(404).json({ error: 'run_not_found' });
      }

      const run = runRows[0];

      if (!run.patch_reference) {
        return res.status(400).json({ error: 'no_patch_reference' });
      }

      if (run.status !== 'success') {
        return res.status(400).json({ error: 'run_not_successful' });
      }

      // Create approval
      const { rows } = await pool.query(
        `INSERT INTO sdk_patch_approvals
         (patch_id, simulation_run_id, approver_id, status, approval_notes, approved_at)
         VALUES ($1, $2, $3, 'approved', $4, NOW())
         RETURNING *`,
        [run.patch_reference, runId, req.user.id, approval_notes || '']
      );

      // Update patch sandbox_tested flag
      await pool.query(
        `UPDATE sdk_self_healing_registry
         SET sandbox_tested = true, updated_at = NOW()
         WHERE id = $1`,
        [run.patch_reference]
      );

      res.json({ approval: rows[0] });
    } catch (error) {
      console.error('[Simulator] Error approving patch:', error);
      res.status(500).json({ error: 'failed_to_approve_patch' });
    }
  }
);

/**
 * GET /api/simulator/metrics
 * Prometheus metrics endpoint
 */
simulatorRouter.get('/metrics', async (req: any, res) => {
  try {
    const { rows: statusCounts } = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM sdk_simulation_runs
       WHERE run_at > NOW() - INTERVAL '24 hours'
       GROUP BY status`
    );

    const { rows: avgMetrics } = await pool.query(
      `SELECT
         AVG((metrics->>'success_rate')::DECIMAL) as avg_success_rate,
         AVG((metrics->>'avg_latency_ms')::DECIMAL) as avg_latency
       FROM sdk_simulation_runs
       WHERE status = 'success'
         AND run_at > NOW() - INTERVAL '24 hours'`
    );

    let metrics = '# Molam Simulator Metrics\n';
    statusCounts.forEach((row) => {
      metrics += `molam_simulator_runs_total{status="${row.status}"} ${row.count}\n`;
    });

    if (avgMetrics[0]) {
      metrics += `molam_simulator_success_rate ${avgMetrics[0].avg_success_rate || 0}\n`;
      metrics += `molam_simulator_avg_latency_ms ${avgMetrics[0].avg_latency || 0}\n`;
    }

    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    console.error('[Simulator] Metrics error:', error);
    res.status(500).send('# Error generating metrics');
  }
});

export default simulatorRouter;
