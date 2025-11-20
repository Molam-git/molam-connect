/**
 * Brique 116septies: AI Anomaly-Based Failover - API Routes
 * Gestion des failovers automatiques et manuels
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';

const router = express.Router();

/**
 * GET /api/failover/anomalies
 * Liste des anomalies détectées
 */
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { processed, limit = 50 } = req.query;

    let query = 'SELECT * FROM anomaly_events';
    const params: any[] = [];

    if (processed !== undefined) {
      params.push(processed === 'true');
      query += ` WHERE processed = $${params.length}`;
    }

    query += ` ORDER BY detected_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await db.query(query, params);

    res.json({
      success: true,
      anomalies: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/failover/anomalies/pending
 * Anomalies en attente de traitement
 */
router.get('/anomalies/pending', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;

    const { rows } = await db.query('SELECT * FROM anomaly_events_pending LIMIT 100');

    res.json({
      success: true,
      pending: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching pending anomalies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/failover/anomalies/:id/approve
 * Approuver un failover manuel
 */
router.post('/anomalies/:id/approve', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string || 'ops_user';

    // Récupérer l'anomalie
    const { rows: anomalies } = await db.query(
      'SELECT * FROM anomaly_events WHERE id = $1',
      [id]
    );

    if (anomalies.length === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    const anomaly = anomalies[0];
    const decision = anomaly.sira_decision || {};

    if (!decision.candidate) {
      return res.status(400).json({ error: 'No candidate connector available' });
    }

    // Créer action de failover
    const actionRef = `manual-${Date.now()}-${anomaly.connector_name}`;

    const { rows: actions } = await db.query(
      `INSERT INTO failover_actions (
        action_ref, connector_from, connector_to, region, currency,
        requested_by, rationale, sira_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        actionRef,
        anomaly.connector_name,
        decision.candidate,
        anomaly.region,
        anomaly.currency,
        userId,
        JSON.stringify({ ...decision, approved_by: userId }),
        anomaly.anomaly_score,
      ]
    );

    // Marquer anomalie comme traitée
    await db.query('UPDATE anomaly_events SET processed = true WHERE id = $1', [id]);

    res.json({
      success: true,
      action: actions[0],
    });
  } catch (error) {
    console.error('Error approving failover:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/failover/actions
 * Liste des actions de failover
 */
router.get('/actions', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { status, limit = 100 } = req.query;

    let query = 'SELECT * FROM failover_actions';
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }

    query += ` ORDER BY requested_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await db.query(query, params);

    res.json({
      success: true,
      actions: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching failover actions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/failover/actions/:id
 * Détails d'une action de failover avec historique
 */
router.get('/actions/:id', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    const { rows: actions } = await db.query(
      'SELECT * FROM failover_actions WHERE id = $1',
      [id]
    );

    if (actions.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const { rows: history } = await db.query(
      'SELECT * FROM failover_history WHERE action_id = $1 ORDER BY created_at ASC',
      [id]
    );

    res.json({
      success: true,
      action: actions[0],
      history,
    });
  } catch (error) {
    console.error('Error fetching failover action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/failover/actions/:id/execute
 * Exécuter une action de failover
 */
router.post('/actions/:id/execute', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { id } = req.params;

    // Récupérer l'action
    const { rows: actions } = await db.query(
      'SELECT * FROM failover_actions WHERE id = $1',
      [id]
    );

    if (actions.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = actions[0];

    if (action.status !== 'pending') {
      return res.status(400).json({ error: `Action already ${action.status}` });
    }

    // Marquer comme en cours
    await db.query(
      `UPDATE failover_actions SET status = 'executing', updated_at = now()
       WHERE id = $1`,
      [id]
    );

    // Log début
    await db.query(
      `INSERT INTO failover_history (action_id, step, details)
       VALUES ($1, $2, $3)`,
      [id, 'start', JSON.stringify({ initiated_at: new Date() })]
    );

    // Simuler exécution (dans un vrai système: appeler service de routing)
    try {
      // Ici: appeler le service de routing pour basculer
      // await updateRoutingConfig(action.region, action.currency, action.connector_to);

      await db.query(
        `UPDATE failover_actions
         SET status = 'executed', executed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id]
      );

      await db.query(
        `INSERT INTO failover_history (action_id, step, details)
         VALUES ($1, $2, $3)`,
        [
          id,
          'executed',
          JSON.stringify({
            from: action.connector_from,
            to: action.connector_to,
            executed_at: new Date(),
          }),
        ]
      );

      res.json({
        success: true,
        message: 'Failover executed successfully',
        action_id: id,
      });
    } catch (execError: any) {
      await db.query(
        `UPDATE failover_actions
         SET status = 'failed', error_message = $2, updated_at = now()
         WHERE id = $1`,
        [id, execError.message]
      );

      await db.query(
        `INSERT INTO failover_history (action_id, step, details)
         VALUES ($1, $2, $3)`,
        [id, 'failed', JSON.stringify({ error: execError.message })]
      );

      throw execError;
    }
  } catch (error) {
    console.error('Error executing failover:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/failover/connectors/health
 * État de santé des connecteurs
 */
router.get('/connectors/health', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { region, currency } = req.query;

    let query = 'SELECT * FROM connector_health';
    const params: any[] = [];

    const conditions: string[] = [];

    if (region) {
      params.push(region);
      conditions.push(`region = $${params.length}`);
    }

    if (currency) {
      params.push(currency);
      conditions.push(`currency = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY updated_at DESC';

    const { rows } = await db.query(query, params);

    res.json({
      success: true,
      connectors: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching connector health:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/failover/connectors/:name/health
 * Mettre à jour l'état de santé d'un connecteur
 */
router.post('/connectors/:name/health', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { name } = req.params;
    const { region, currency, success_rate, avg_latency_ms, error_count, status } = req.body;

    const { rows } = await db.query(
      `INSERT INTO connector_health (
        connector_name, region, currency, last_ping,
        success_rate, avg_latency_ms, error_count, status
      )
      VALUES ($1, $2, $3, now(), $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        success_rate = EXCLUDED.success_rate,
        avg_latency_ms = EXCLUDED.avg_latency_ms,
        error_count = EXCLUDED.error_count,
        status = EXCLUDED.status,
        last_ping = now(),
        updated_at = now()
      RETURNING *`,
      [name, region, currency, success_rate, avg_latency_ms, error_count || 0, status || 'ok']
    );

    res.json({
      success: true,
      connector: rows[0],
    });
  } catch (error) {
    console.error('Error updating connector health:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
