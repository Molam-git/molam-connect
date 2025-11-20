/**
 * Experiments API Routes
 */
import express, { Request, Response } from 'express';
import { pool } from '../db';
import { authz } from '../middleware/auth';
import { getOptimalVariant, updateBanditState, shouldStopExperiment, getExperimentInsights } from '../services/sira';

const router = express.Router();

/**
 * Create experiment
 */
router.post('/', authz(['ops_admin', 'marketing']), async (req: Request, res: Response) => {
  const { name, description, targeting, variants } = req.body;

  if (!name || !variants || variants.length < 2) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Name and at least 2 variants required'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create experiment
    const { rows: [experiment] } = await client.query(
      `INSERT INTO experiments (name, description, targeting, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, targeting || {}, req.user!.sub]
    );

    // Create variants
    for (const v of variants) {
      await client.query(
        `INSERT INTO experiment_variants (experiment_id, name, config, traffic_share, is_control)
         VALUES ($1, $2, $3, $4, $5)`,
        [experiment.id, v.name, v.config, v.traffic_share || 0, v.is_control || false]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO experiment_audit_logs (experiment_id, actor, action, details)
       VALUES ($1, $2, 'created', $3)`,
      [experiment.id, req.user!.sub, { name, variants: variants.length }]
    );

    await client.query('COMMIT');

    res.status(201).json(experiment);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create experiment error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  } finally {
    client.release();
  }
});

/**
 * List experiments
 */
router.get('/', authz(['ops_admin', 'marketing', 'data_science']), async (req: Request, res: Response) => {
  const { status, limit = 50, offset = 0 } = req.query;

  const whereClause = status ? `WHERE status = $1` : '';
  const params = status ? [status, limit, offset] : [limit, offset];
  const paramStart = status ? 2 : 1;

  const { rows } = await pool.query(
    `SELECT e.*, COUNT(ea.id) as assignments_count
     FROM experiments e
     LEFT JOIN experiment_assignments ea ON ea.experiment_id = e.id
     ${whereClause}
     GROUP BY e.id
     ORDER BY e.created_at DESC
     LIMIT $${paramStart} OFFSET $${paramStart + 1}`,
    params
  );

  res.json(rows);
});

/**
 * Get experiment details
 */
router.get('/:id', authz(['ops_admin', 'marketing', 'data_science']), async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT e.*,
       json_agg(
         json_build_object(
           'id', ev.id,
           'name', ev.name,
           'config', ev.config,
           'traffic_share', ev.traffic_share,
           'is_control', ev.is_control
         )
       ) as variants
     FROM experiments e
     LEFT JOIN experiment_variants ev ON ev.experiment_id = e.id
     WHERE e.id = $1
     GROUP BY e.id`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json(rows[0]);
});

/**
 * Update experiment
 */
router.patch('/:id', authz(['ops_admin', 'marketing']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, targeting, status } = req.body;

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(description);
  }
  if (targeting !== undefined) {
    updates.push(`targeting = $${paramIndex++}`);
    values.push(targeting);
  }
  if (status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'no_updates' });
  }

  values.push(id);

  const { rows } = await pool.query(
    `UPDATE experiments
     SET ${updates.join(', ')}, updated_at = now()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }

  // Audit log
  await pool.query(
    `INSERT INTO experiment_audit_logs (experiment_id, actor, action, details)
     VALUES ($1, $2, 'updated', $3)`,
    [id, req.user!.sub, req.body]
  );

  res.json(rows[0]);
});

/**
 * Start experiment
 */
router.post('/:id/start', authz(['ops_admin', 'marketing']), async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `UPDATE experiments
     SET status = 'running', start_date = now(), updated_at = now()
     WHERE id = $1 AND status = 'draft'
     RETURNING *`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(400).json({ error: 'cannot_start', message: 'Experiment not in draft status' });
  }

  // Audit log
  await pool.query(
    `INSERT INTO experiment_audit_logs (experiment_id, actor, action, details)
     VALUES ($1, $2, 'started', $3)`,
    [id, req.user!.sub, { start_date: new Date() }]
  );

  res.json(rows[0]);
});

/**
 * Stop experiment
 */
router.post('/:id/stop', authz(['ops_admin', 'marketing']), async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `UPDATE experiments
     SET status = 'stopped', end_date = now(), updated_at = now()
     WHERE id = $1 AND status = 'running'
     RETURNING *`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(400).json({ error: 'cannot_stop', message: 'Experiment not running' });
  }

  // Audit log
  await pool.query(
    `INSERT INTO experiment_audit_logs (experiment_id, actor, action, details)
     VALUES ($1, $2, 'stopped', $3)`,
    [id, req.user!.sub, { end_date: new Date() }]
  );

  res.json(rows[0]);
});

/**
 * Assign user to variant (via SIRA)
 */
router.post('/:id/assign', authz(['pay_module', 'connect_module', 'ops_admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { molam_id } = req.body;

  if (!molam_id) {
    return res.status(400).json({ error: 'molam_id_required' });
  }

  try {
    // Check if already assigned
    const { rows: existing } = await pool.query(
      `SELECT * FROM experiment_assignments
       WHERE experiment_id = $1 AND molam_id = $2`,
      [id, molam_id]
    );

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    // Get optimal variant from SIRA
    const variantId = await getOptimalVariant(id, molam_id);

    // Create assignment
    const { rows } = await pool.query(
      `INSERT INTO experiment_assignments (experiment_id, variant_id, molam_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, variantId, molam_id]
    );

    res.json(rows[0]);
  } catch (error: any) {
    console.error('Assignment error:', error);
    res.status(500).json({ error: 'assignment_failed', message: error.message });
  }
});

/**
 * Get user assignment
 */
router.get('/:id/assignment/:molam_id', async (req: Request, res: Response) => {
  const { id, molam_id } = req.params;

  const { rows } = await pool.query(
    `SELECT ea.*, ev.name as variant_name, ev.config as variant_config
     FROM experiment_assignments ea
     JOIN experiment_variants ev ON ev.id = ea.variant_id
     WHERE ea.experiment_id = $1 AND ea.molam_id = $2`,
    [id, molam_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }

  res.json(rows[0]);
});

/**
 * Track metric
 */
router.post('/:id/track', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { variant_id, molam_id, event_type, value, metadata } = req.body;

  if (!variant_id || !molam_id || !event_type) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    // Insert metric
    await pool.query(
      `INSERT INTO experiment_metrics (experiment_id, variant_id, molam_id, event_type, value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, variant_id, molam_id, event_type, value, metadata || {}]
    );

    // Update bandit state
    const isSuccess = event_type === 'conversion';
    await updateBanditState(id, variant_id, isSuccess);

    // Check if experiment should be stopped
    const stopCheck = await shouldStopExperiment(id);
    if (stopCheck.shouldStop) {
      console.warn(`⚠️ Experiment ${id} should be stopped: ${stopCheck.reason}`);
      // Optionally auto-stop (requires ops_admin approval in production)
    }

    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Track metric error:', error);
    res.status(500).json({ error: 'track_failed', message: error.message });
  }
});

/**
 * Get experiment results
 */
router.get('/:id/results', authz(['ops_admin', 'marketing', 'data_science']), async (req: Request, res: Response) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT
       ev.id,
       ev.name,
       ev.config,
       ev.is_control,
       COUNT(DISTINCT ea.molam_id) as assignments,
       COUNT(CASE WHEN em.event_type = 'conversion' THEN 1 END) as conversions,
       COUNT(CASE WHEN em.event_type = 'refund' THEN 1 END) as refunds,
       COUNT(CASE WHEN em.event_type = 'churn' THEN 1 END) as churns,
       SUM(CASE WHEN em.event_type = 'conversion' THEN em.value ELSE 0 END) as total_value
     FROM experiment_variants ev
     LEFT JOIN experiment_assignments ea ON ea.variant_id = ev.id
     LEFT JOIN experiment_metrics em ON em.variant_id = ev.id
     WHERE ev.experiment_id = $1
     GROUP BY ev.id, ev.name, ev.config, ev.is_control
     ORDER BY ev.is_control DESC, conversions DESC`,
    [id]
  );

  const results = rows.map(row => ({
    ...row,
    conversion_rate: row.assignments > 0 ? (row.conversions / row.assignments) : 0,
    average_value: row.conversions > 0 ? (row.total_value / row.conversions) : 0
  }));

  res.json(results);
});

/**
 * Get SIRA insights
 */
router.get('/:id/insights', authz(['ops_admin', 'marketing', 'data_science']), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const insights = await getExperimentInsights(id);
    res.json(insights);
  } catch (error: any) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'insights_failed', message: error.message });
  }
});

export default router;
