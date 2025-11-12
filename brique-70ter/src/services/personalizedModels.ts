/**
 * Personalized Models Service
 *
 * Manages per-merchant model personalization and configuration
 */

import { pool } from '../db';
import { trainLocalModel, aggregateFederatedModels } from './aiTrainer';
import { collectAllExternalData } from './externalDataCollector';

export interface MerchantConfig {
  merchantId: string;
  modelVersion: string;
  personalizationLevel: 'low' | 'medium' | 'high' | 'custom';
  trainingFrequency: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  autoDeploy: boolean;
  minConfidence: number;
  featuresEnabled: Record<string, boolean>;
  dataSources: {
    internal: boolean;
    external: boolean;
    federated: boolean;
  };
  privacyLevel: 'private' | 'federated' | 'public';
}

/**
 * Get or create merchant config
 */
export async function getMerchantConfig(merchantId: string): Promise<MerchantConfig> {
  let { rows } = await pool.query(`
    SELECT * FROM marketing_ai_merchant_configs WHERE merchant_id = $1
  `, [merchantId]);

  if (rows.length === 0) {
    // Create default config
    const { rows: newConfig } = await pool.query(`
      INSERT INTO marketing_ai_merchant_configs (
        merchant_id,
        model_version,
        personalization_level,
        training_frequency,
        auto_deploy,
        min_confidence
      ) VALUES ($1, 'v1.0-local', 'medium', 'weekly', false, 0.80)
      RETURNING *
    `, [merchantId]);
    rows = newConfig;
  }

  return {
    merchantId: rows[0].merchant_id,
    modelVersion: rows[0].model_version,
    personalizationLevel: rows[0].personalization_level,
    trainingFrequency: rows[0].training_frequency,
    autoDeploy: rows[0].auto_deploy,
    minConfidence: Number(rows[0].min_confidence),
    featuresEnabled: rows[0].features_enabled || {},
    dataSources: rows[0].data_sources || { internal: true, external: false, federated: false },
    privacyLevel: rows[0].privacy_level,
  };
}

/**
 * Update merchant config
 */
export async function updateMerchantConfig(
  merchantId: string,
  updates: Partial<MerchantConfig>
): Promise<MerchantConfig> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && key !== 'merchantId') {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  });

  if (fields.length === 0) {
    return getMerchantConfig(merchantId);
  }

  values.push(merchantId);

  await pool.query(`
    UPDATE marketing_ai_merchant_configs
    SET ${fields.join(', ')}, updated_at = now()
    WHERE merchant_id = $${paramIndex}
  `, values);

  return getMerchantConfig(merchantId);
}

/**
 * Train personalized model for merchant
 */
export async function trainPersonalizedModel(merchantId: string): Promise<any> {
  const config = await getMerchantConfig(merchantId);

  let sourceType: 'internal' | 'external' | 'hybrid' = 'internal';

  // Collect external data if enabled
  if (config.dataSources.external) {
    // Fetch merchant details for industry/country
    const { rows: merchants } = await pool.query(`
      SELECT industry, country FROM merchants WHERE id = $1
    `, [merchantId]);

    if (merchants.length > 0) {
      await collectAllExternalData(merchants[0].industry || 'e-commerce', merchants[0].country || 'US');
      sourceType = 'hybrid';
    }
  }

  // Train local model
  const trainingRun = await trainLocalModel(merchantId, config.modelVersion, sourceType);

  // Auto-deploy if enabled and confidence meets threshold
  if (config.autoDeploy && trainingRun.metrics.confidence >= config.minConfidence) {
    await pool.query(`
      UPDATE marketing_ai_training_runs
      SET deployed = true, deployed_at = now()
      WHERE id = $1
    `, [trainingRun.id]);

    console.log(`[Personalized Models] Auto-deployed model for merchant ${merchantId}: confidence=${trainingRun.metrics.confidence}`);
  }

  return trainingRun;
}

/**
 * Schedule next training for merchant
 */
export async function scheduleNextTraining(merchantId: string): Promise<Date> {
  const config = await getMerchantConfig(merchantId);

  const intervals = {
    daily: '1 day',
    weekly: '7 days',
    monthly: '30 days',
    on_demand: null,
  };

  const interval = intervals[config.trainingFrequency];

  if (!interval) {
    // On-demand only, no automatic scheduling
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Far future
  }

  await pool.query(`
    UPDATE marketing_ai_merchant_configs
    SET next_training_at = now() + interval '${interval}'
    WHERE merchant_id = $1
  `, [merchantId]);

  const nextTraining = new Date(Date.now() + (
    config.trainingFrequency === 'daily' ? 1 :
    config.trainingFrequency === 'weekly' ? 7 :
    30
  ) * 24 * 60 * 60 * 1000);

  return nextTraining;
}
