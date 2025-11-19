/**
 * Brique 112: Canary Deployment Service
 * Manages gradual rollout of ML models with traffic splitting
 */

const crypto = require('crypto');

let pool;

function setPool(pgPool) {
  pool = pgPool;
}

/**
 * Get canary configuration for a product
 */
async function getCanaryConfig(product) {
  try {
    const { rows } = await pool.query(
      `SELECT
        id,
        product,
        canary_model_id,
        production_model_id,
        canary_percent,
        start_at,
        end_at,
        rollback_threshold
       FROM sira_canary_config
       WHERE product = $1
         AND canary_percent > 0
         AND (end_at IS NULL OR end_at > now())`,
      [product]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    console.error('Get canary config error:', error);
    return null;
  }
}

/**
 * Get production model ID for a product
 */
async function getProductionModel(product) {
  try {
    const { rows } = await pool.query(
      `SELECT model_id FROM siramodel_registry
       WHERE product = $1 AND status = 'production'
       ORDER BY created_at DESC
       LIMIT 1`,
      [product]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].model_id;
  } catch (error) {
    console.error('Get production model error:', error);
    return null;
  }
}

/**
 * Deterministic model selection based on event ID
 * Uses consistent hashing to ensure same event always routes to same model
 */
function pickModel(eventId, product, canaryConfig) {
  if (!canaryConfig || canaryConfig.canary_percent === 0) {
    return canaryConfig?.production_model_id || null;
  }

  // Deterministic hash: 0-99
  const hash = crypto
    .createHash('md5')
    .update(eventId)
    .digest();

  const percent = hash[0] % 100;

  if (percent < canaryConfig.canary_percent) {
    return canaryConfig.canary_model_id;
  }

  return canaryConfig.production_model_id;
}

/**
 * Route inference request to appropriate model
 */
async function routeInference(eventId, product) {
  try {
    const config = await getCanaryConfig(product);

    if (!config) {
      // No active canary, use production
      const productionModelId = await getProductionModel(product);
      return {
        model_id: productionModelId,
        is_canary: false,
        canary_percent: 0
      };
    }

    const modelId = pickModel(eventId, product, config);
    const isCanary = modelId === config.canary_model_id;

    return {
      model_id: modelId,
      is_canary: isCanary,
      canary_percent: config.canary_percent
    };
  } catch (error) {
    console.error('Route inference error:', error);
    // Fallback to production
    const productionModelId = await getProductionModel(product);
    return {
      model_id: productionModelId,
      is_canary: false,
      canary_percent: 0,
      error: error.message
    };
  }
}

/**
 * Create or update canary configuration
 */
async function setCanaryConfig(product, config, userId = 'system') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      canary_model_id,
      production_model_id,
      canary_percent,
      start_at,
      end_at,
      rollback_threshold
    } = config;

    // Validate models exist
    if (canary_model_id) {
      const { rows: canaryCheck } = await client.query(
        `SELECT model_id FROM siramodel_registry WHERE model_id = $1`,
        [canary_model_id]
      );

      if (canaryCheck.length === 0) {
        throw new Error('Canary model not found');
      }
    }

    if (production_model_id) {
      const { rows: prodCheck } = await client.query(
        `SELECT model_id FROM siramodel_registry WHERE model_id = $1`,
        [production_model_id]
      );

      if (prodCheck.length === 0) {
        throw new Error('Production model not found');
      }
    }

    // Upsert canary config
    const { rows: [result] } = await client.query(
      `INSERT INTO sira_canary_config(
        product,
        canary_model_id,
        production_model_id,
        canary_percent,
        start_at,
        end_at,
        rollback_threshold,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (product)
      DO UPDATE SET
        canary_model_id = EXCLUDED.canary_model_id,
        production_model_id = EXCLUDED.production_model_id,
        canary_percent = EXCLUDED.canary_percent,
        start_at = EXCLUDED.start_at,
        end_at = EXCLUDED.end_at,
        rollback_threshold = EXCLUDED.rollback_threshold,
        updated_at = now()
      RETURNING *`,
      [
        product,
        canary_model_id,
        production_model_id,
        canary_percent,
        start_at || new Date(),
        end_at,
        rollback_threshold || {},
        userId
      ]
    );

    // Update model statuses if needed
    if (canary_model_id && canary_percent > 0) {
      await client.query(
        `UPDATE siramodel_registry
         SET status = 'canary', updated_at = now()
         WHERE model_id = $1`,
        [canary_model_id]
      );
    }

    if (production_model_id) {
      await client.query(
        `UPDATE siramodel_registry
         SET status = 'production', updated_at = now()
         WHERE model_id = $1`,
        [production_model_id]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO config_recommendation_audit(
        recommendation_id,
        actor,
        action_taken,
        details
      ) VALUES (NULL, $1, 'canary_config_update', $2)`,
      [userId, { product, config }]
    );

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Set canary config error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stop canary deployment (rollback to production)
 */
async function stopCanary(product, userId = 'system') {
  try {
    const { rows: [result] } = await pool.query(
      `UPDATE sira_canary_config
       SET canary_percent = 0, end_at = now(), updated_at = now()
       WHERE product = $1
       RETURNING *`,
      [product]
    );

    if (result && result.canary_model_id) {
      // Demote canary model
      await pool.query(
        `UPDATE siramodel_registry
         SET status = 'validated', updated_at = now()
         WHERE model_id = $1`,
        [result.canary_model_id]
      );
    }

    // Audit log
    await pool.query(
      `INSERT INTO config_recommendation_audit(
        recommendation_id,
        actor,
        action_taken,
        details
      ) VALUES (NULL, $1, 'canary_stop', $2)`,
      [userId, { product, reason: 'manual_stop' }]
    );

    return result;
  } catch (error) {
    console.error('Stop canary error:', error);
    throw error;
  }
}

/**
 * Check if canary should be rolled back based on metrics
 */
async function checkCanaryHealth(product) {
  try {
    const config = await getCanaryConfig(product);

    if (!config || !config.canary_model_id) {
      return { healthy: true, reason: 'no_active_canary' };
    }

    const threshold = config.rollback_threshold || {};

    // Check metrics for canary model
    const { rows: metrics } = await pool.query(
      `SELECT metric_name, metric_value
       FROM sira_model_metrics
       WHERE model_id = $1
         AND created_at > now() - interval '1 hour'
       ORDER BY created_at DESC
       LIMIT 10`,
      [config.canary_model_id]
    );

    // Check thresholds
    for (const metric of metrics) {
      if (threshold[metric.metric_name]) {
        if (metric.metric_value > threshold[metric.metric_name]) {
          return {
            healthy: false,
            reason: `${metric.metric_name} exceeded threshold`,
            value: metric.metric_value,
            threshold: threshold[metric.metric_name]
          };
        }
      }
    }

    return { healthy: true };
  } catch (error) {
    console.error('Check canary health error:', error);
    return { healthy: false, reason: 'check_failed', error: error.message };
  }
}

module.exports = {
  setPool,
  getCanaryConfig,
  getProductionModel,
  pickModel,
  routeInference,
  setCanaryConfig,
  stopCanary,
  checkCanaryHealth
};
