/**
 * BRIQUE 142 — Playbooks Routes
 * API pour playbooks automatisés
 */

import { Router } from 'express';
import { pool } from '../db';
import { requireRole, authzMiddleware } from '../utils/authz';
import { publishEvent } from '../events/publisher';
import { enqueuePlaybookExecution } from '../playbooks/queue';

export const playbooksRouter = Router();
playbooksRouter.use(authzMiddleware);

/**
 * GET /api/playbooks
 * List playbooks
 */
playbooksRouter.get('/', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { active } = req.query;

  try {
    let query = `SELECT * FROM playbooks WHERE 1=1`;
    const params: any[] = [];

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND active = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[Playbooks] Error listing:', error);
    res.status(500).json({ error: 'failed_to_list_playbooks' });
  }
});

/**
 * POST /api/playbooks
 * Create playbook
 */
playbooksRouter.post('/', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { name, description, triggers, actions, auto_execute, require_approval } = req.body;

  if (!name || !actions) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO playbooks(name, description, triggers, actions, auto_execute, require_approval, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        description,
        triggers || {},
        actions,
        auto_execute || false,
        require_approval !== false,
        req.user.id,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[Playbooks] Error creating:', error);
    res.status(500).json({ error: 'failed_to_create_playbook' });
  }
});

/**
 * POST /api/playbooks/:id/execute
 * Execute playbook manually
 */
playbooksRouter.post('/:id/execute', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { id } = req.params;
  const { alert_id } = req.body;

  try {
    const { rows: playbookRows } = await pool.query(
      `SELECT * FROM playbooks WHERE id = $1 AND active = true`,
      [id]
    );

    if (playbookRows.length === 0) {
      return res.status(404).json({ error: 'playbook_not_found' });
    }

    const playbook = playbookRows[0];

    // Create execution record
    const { rows } = await pool.query(
      `INSERT INTO playbook_executions(playbook_id, alert_id, executed_by, execution_mode, actions, status)
       VALUES ($1, $2, $3, 'manual', $4, 'pending')
       RETURNING *`,
      [id, alert_id || null, req.user.id, playbook.actions]
    );

    const execution = rows[0];

    // Enqueue for async worker execution
    await enqueuePlaybookExecution(execution.id);

    publishEvent('playbooks', execution.id, 'playbook.executed', {
      playbook_id: id,
      execution_id: execution.id,
      alert_id,
      executed_by: req.user.id,
    });

    res.json(execution);
  } catch (error) {
    console.error('[Playbooks] Error executing:', error);
    res.status(500).json({ error: 'failed_to_execute_playbook' });
  }
});

/**
 * GET /api/playbooks/:id/executions
 * Get playbook execution history
 */
playbooksRouter.get('/:id/executions', requireRole(['ops', 'fraud_ops', 'pay_admin', 'auditor']), async (req: any, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM playbook_executions
       WHERE playbook_id = $1
       ORDER BY executed_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json(rows);
  } catch (error) {
    console.error('[Playbooks] Error fetching executions:', error);
    res.status(500).json({ error: 'failed_to_fetch_executions' });
  }
});

/**
 * GET /api/playbooks/executions/:executionId
 * Get execution details
 */
playbooksRouter.get('/executions/:executionId', requireRole(['ops', 'fraud_ops', 'pay_admin', 'auditor']), async (req: any, res) => {
  const { executionId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM playbook_executions WHERE id = $1`,
      [executionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'execution_not_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Playbooks] Error fetching execution:', error);
    res.status(500).json({ error: 'failed_to_fetch_execution' });
  }
});

/**
 * PATCH /api/playbooks/:id
 * Update playbook
 */
playbooksRouter.patch('/:id', requireRole(['ops', 'fraud_ops', 'pay_admin']), async (req: any, res) => {
  const { id } = req.params;
  const { name, description, triggers, actions, active, auto_execute, require_approval } = req.body;

  try {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${paramIndex++}`);
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex++}`);
    }

    if (triggers !== undefined) {
      params.push(triggers);
      updates.push(`triggers = $${paramIndex++}`);
    }

    if (actions !== undefined) {
      params.push(actions);
      updates.push(`actions = $${paramIndex++}`);
    }

    if (active !== undefined) {
      params.push(active);
      updates.push(`active = $${paramIndex++}`);
    }

    if (auto_execute !== undefined) {
      params.push(auto_execute);
      updates.push(`auto_execute = $${paramIndex++}`);
    }

    if (require_approval !== undefined) {
      params.push(require_approval);
      updates.push(`require_approval = $${paramIndex++}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no_updates_provided' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE playbooks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'playbook_not_found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Playbooks] Error updating:', error);
    res.status(500).json({ error: 'failed_to_update_playbook' });
  }
});

export default playbooksRouter;
