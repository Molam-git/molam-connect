/**
 * Brique 112: SIRA Model Registry API
 * Manage ML models lifecycle: register, validate, promote, archive
 */

const express = require('express');

function createModelRegistryRouter(pool) {
  const router = express.Router();

  /**
   * List all models
   * GET /api/sira/models
   */
  router.get('/', async (req, res) => {
    try {
      const {
        product,
        status,
        limit = 100,
        offset = 0
      } = req.query;

      let query = `
        SELECT
          model_id,
          name,
          version,
          product,
          storage_s3_key,
          metadata,
          metrics,
          status,
          created_by,
          created_at,
          updated_at
        FROM siramodel_registry
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (product) {
        query += ` AND product = $${paramIndex++}`;
        params.push(product);
      }

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);

      res.json(rows);
    } catch (error) {
      console.error('List models error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get model by ID
   * GET /api/sira/models/:modelId
   */
  router.get('/:modelId', async (req, res) => {
    try {
      const { modelId } = req.params;

      const { rows } = await pool.query(
        `SELECT * FROM siramodel_registry WHERE model_id = $1`,
        [modelId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'model_not_found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Get model error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Register a new model
   * POST /api/sira/models
   */
  router.post('/', async (req, res) => {
    try {
      const {
        name,
        version,
        product,
        storage_s3_key,
        metadata,
        metrics
      } = req.body;

      const userId = req.user?.id || 'system';

      // Validate required fields
      if (!name || !version || !product || !storage_s3_key) {
        return res.status(400).json({
          error: 'missing_required_fields',
          required: ['name', 'version', 'product', 'storage_s3_key']
        });
      }

      const { rows: [model] } = await pool.query(
        `INSERT INTO siramodel_registry(
          name,
          version,
          product,
          storage_s3_key,
          metadata,
          metrics,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [name, version, product, storage_s3_key, metadata || {}, metrics || {}, userId]
      );

      // Log in audit
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES (NULL, $1, 'model_register', $2)`,
        [userId, { model_id: model.model_id, name, version, product }]
      );

      res.status(201).json(model);
    } catch (error) {
      console.error('Register model error:', error);

      if (error.constraint === 'siramodel_registry_name_version_key') {
        return res.status(409).json({
          error: 'duplicate_model',
          message: 'Model with this name and version already exists'
        });
      }

      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Promote model to new status
   * POST /api/sira/models/:modelId/promote
   * Body: { target: 'validated'|'canary'|'production'|'archived' }
   */
  router.post('/:modelId/promote', async (req, res) => {
    try {
      const { modelId } = req.params;
      const { target } = req.body;
      const userId = req.user?.id || 'system';

      // Validate target status
      const validTargets = ['validated', 'canary', 'production', 'archived'];
      if (!validTargets.includes(target)) {
        return res.status(400).json({
          error: 'invalid_target',
          message: `Target must be one of: ${validTargets.join(', ')}`
        });
      }

      // Get current model
      const { rows: [currentModel] } = await pool.query(
        `SELECT * FROM siramodel_registry WHERE model_id = $1`,
        [modelId]
      );

      if (!currentModel) {
        return res.status(404).json({ error: 'model_not_found' });
      }

      // Validate role permissions
      const userRoles = req.user?.roles || [];
      if (target === 'production' && !userRoles.includes('ml_ops') && !userRoles.includes('pay_admin')) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Only ml_ops or pay_admin can promote to production'
        });
      }

      // If promoting to production, demote current production model
      if (target === 'production') {
        await pool.query(
          `UPDATE siramodel_registry
           SET status = 'archived', updated_at = now()
           WHERE product = $1 AND status = 'production' AND model_id != $2`,
          [currentModel.product, modelId]
        );
      }

      // Update model status
      const { rows: [updated] } = await pool.query(
        `UPDATE siramodel_registry
         SET status = $2, updated_at = now()
         WHERE model_id = $1
         RETURNING *`,
        [modelId, target]
      );

      // Log promotion
      await pool.query(
        `INSERT INTO config_recommendation_audit(
          recommendation_id,
          actor,
          action_taken,
          details
        ) VALUES (NULL, $1, 'model_promote', $2)`,
        [userId, {
          model_id: modelId,
          from_status: currentModel.status,
          to_status: target,
          product: currentModel.product
        }]
      );

      res.json({ ok: true, model: updated });
    } catch (error) {
      console.error('Promote model error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get active models (production + canary)
   * GET /api/sira/models/active/list
   */
  router.get('/active/list', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM v_active_models`);
      res.json(rows);
    } catch (error) {
      console.error('Get active models error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Get model metrics history
   * GET /api/sira/models/:modelId/metrics
   */
  router.get('/:modelId/metrics', async (req, res) => {
    try {
      const { modelId } = req.params;
      const { limit = 100 } = req.query;

      const { rows } = await pool.query(
        `SELECT
          metric_name,
          metric_value,
          window_start,
          window_end,
          created_at
         FROM sira_model_metrics
         WHERE model_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [modelId, limit]
      );

      res.json(rows);
    } catch (error) {
      console.error('Get model metrics error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  /**
   * Record model metric
   * POST /api/sira/models/:modelId/metrics
   */
  router.post('/:modelId/metrics', async (req, res) => {
    try {
      const { modelId } = req.params;
      const { metric_name, metric_value, window_start, window_end } = req.body;

      if (!metric_name || metric_value === undefined) {
        return res.status(400).json({
          error: 'missing_required_fields',
          required: ['metric_name', 'metric_value']
        });
      }

      const { rows: [metric] } = await pool.query(
        `INSERT INTO sira_model_metrics(
          model_id,
          metric_name,
          metric_value,
          window_start,
          window_end
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          modelId,
          metric_name,
          metric_value,
          window_start || new Date(Date.now() - 3600000), // 1h ago
          window_end || new Date()
        ]
      );

      res.status(201).json(metric);
    } catch (error) {
      console.error('Record metric error:', error);
      res.status(500).json({ error: 'internal_error', message: error.message });
    }
  });

  return router;
}

module.exports = createModelRegistryRouter;
