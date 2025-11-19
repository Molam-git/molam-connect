/**
 * Brique 113: Deterministic Canary Router
 * Routes inference requests to production or canary model based on hash(event_id)
 */

import crypto from 'crypto';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { canaryTrafficRatio } from '../utils/metrics';

export interface CanaryConfig {
  product: string;
  production_model_id: string | null;
  canary_model_id: string | null;
  canary_percent: number;
  started_at: Date | null;
  updated_at: Date;
}

export interface ModelChoice {
  model_id: string;
  role: 'production' | 'canary';
}

/**
 * Compute deterministic percentage from event_id (0-99)
 * Same event_id always returns same percentage
 */
export function deterministicPercent(eventId: string): number {
  const hash = crypto.createHash('sha256').update(eventId).digest();
  const num = hash.readUInt32BE(0);
  return num % 100;
}

/**
 * Get canary configuration for a product
 */
export async function getCanaryConfig(product: string): Promise<CanaryConfig | null> {
  try {
    const { rows } = await pool.query<CanaryConfig>(
      'SELECT * FROM sira_canary_config WHERE product = $1',
      [product]
    );

    if (rows.length === 0) {
      return null;
    }

    const config = rows[0];

    // Update Prometheus metric
    canaryTrafficRatio.set(
      { product: config.product },
      (config.canary_percent || 0) / 100
    );

    return config;
  } catch (err) {
    logger.error('Failed to get canary config', { product, error: (err as Error).message });
    throw err;
  }
}

/**
 * Pick model for event based on canary routing
 */
export async function pickModelForEvent(
  eventId: string,
  product: string
): Promise<ModelChoice> {
  const config = await getCanaryConfig(product);

  // No canary config - fallback to latest production model from registry
  if (!config) {
    logger.debug('No canary config found, using production fallback', { product });

    const { rows } = await pool.query(
      `SELECT model_id FROM siramodel_registry
       WHERE product = $1 AND status = 'production'
       ORDER BY created_at DESC
       LIMIT 1`,
      [product]
    );

    if (rows.length === 0) {
      throw new Error(`No production model found for product: ${product}`);
    }

    return {
      model_id: rows[0].model_id,
      role: 'production',
    };
  }

  // Canary is active (percent > 0) and canary model exists
  const canaryPercent = config.canary_percent || 0;

  if (canaryPercent > 0 && config.canary_model_id) {
    const eventPercent = deterministicPercent(eventId);

    if (eventPercent < canaryPercent) {
      logger.debug('Routing to canary model', {
        event_id: eventId,
        product,
        event_percent: eventPercent,
        canary_percent: canaryPercent,
        canary_model_id: config.canary_model_id,
      });

      return {
        model_id: config.canary_model_id,
        role: 'canary',
      };
    }
  }

  // Route to production
  if (!config.production_model_id) {
    throw new Error(`No production model configured for product: ${product}`);
  }

  logger.debug('Routing to production model', {
    event_id: eventId,
    product,
    production_model_id: config.production_model_id,
  });

  return {
    model_id: config.production_model_id,
    role: 'production',
  };
}

/**
 * Update canary configuration
 */
export async function setCanaryConfig(
  product: string,
  canaryModelId: string,
  productionModelId: string,
  canaryPercent: number
): Promise<CanaryConfig> {
  if (canaryPercent < 0 || canaryPercent > 100) {
    throw new Error('canary_percent must be between 0 and 100');
  }

  try {
    const { rows } = await pool.query<CanaryConfig>(
      `INSERT INTO sira_canary_config (product, canary_model_id, production_model_id, canary_percent, started_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (product)
       DO UPDATE SET
         canary_model_id = EXCLUDED.canary_model_id,
         production_model_id = EXCLUDED.production_model_id,
         canary_percent = EXCLUDED.canary_percent,
         updated_at = now()
       RETURNING *`,
      [product, canaryModelId, productionModelId, canaryPercent]
    );

    logger.info('Canary config updated', {
      product,
      canary_model_id: canaryModelId,
      canary_percent: canaryPercent,
    });

    // Update metric
    canaryTrafficRatio.set({ product }, canaryPercent / 100);

    return rows[0];
  } catch (err) {
    logger.error('Failed to set canary config', { product, error: (err as Error).message });
    throw err;
  }
}

/**
 * Stop canary deployment (set percent to 0)
 */
export async function stopCanary(product: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE sira_canary_config
       SET canary_percent = 0, canary_model_id = NULL, updated_at = now()
       WHERE product = $1`,
      [product]
    );

    logger.info('Canary stopped', { product });

    // Update metric
    canaryTrafficRatio.set({ product }, 0);
  } catch (err) {
    logger.error('Failed to stop canary', { product, error: (err as Error).message });
    throw err;
  }
}
