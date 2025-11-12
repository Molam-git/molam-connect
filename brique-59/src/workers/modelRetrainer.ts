import { pool } from '../utils/db';
import * as selfUpdater from '../services/selfUpdater';
import fetch from 'node-fetch';

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SIRA_ML_API_URL = process.env.SIRA_ML_API_URL || 'http://localhost:9000';
const MIN_SAMPLES_FOR_RETRAIN = 100;
const ACCURACY_THRESHOLD = 0.65; // Retrain if accuracy drops below 65%

/**
 * Model Retrainer Worker - Monitors model performance and triggers retraining
 * Runs daily to check if models need retraining based on feedback loop
 */
async function checkAndRetrain(): Promise<void> {
  console.log('[ModelRetrainer] Starting model performance check...');

  try {
    // 1. Get active models
    const { rows: activeModels } = await pool.query(
      `SELECT * FROM sira_models WHERE status = 'active'`
    );

    console.log(`[ModelRetrainer] Found ${activeModels.length} active models`);

    for (const model of activeModels) {
      try {
        await evaluateModel(model);
      } catch (error: any) {
        console.error(`[ModelRetrainer] Failed to evaluate model ${model.id}:`, error.message);
      }
    }

    // 2. Check for approved patches ready for auto-deployment
    const { rows: testingPatches } = await pool.query(
      `SELECT * FROM sira_patches WHERE status = 'testing' AND tests_passed = true`
    );

    console.log(`[ModelRetrainer] Found ${testingPatches.length} patches ready for evaluation`);

    for (const patch of testingPatches) {
      try {
        const deployed = await selfUpdater.autoDeployIfWorthy(patch.id);
        if (deployed) {
          console.log(`[ModelRetrainer] Auto-deployed patch ${patch.id}`);
        }
      } catch (error: any) {
        console.error(`[ModelRetrainer] Failed to auto-deploy patch ${patch.id}:`, error.message);
      }
    }

    console.log('[ModelRetrainer] Model performance check completed');
  } catch (error: any) {
    console.error('[ModelRetrainer] Model performance check failed:', error);
  }
}

/**
 * Evaluate model performance and trigger retraining if needed
 */
async function evaluateModel(model: any): Promise<void> {
  console.log(`[ModelRetrainer] Evaluating model ${model.id} (${model.version})...`);

  // Get predictions with outcomes since last evaluation
  const { rows: predictions } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE prediction_correct = true) as correct,
       COUNT(*) as total,
       AVG(CASE WHEN prediction_correct = true THEN 1 ELSE 0 END) as accuracy
     FROM sira_predictions
     WHERE model_id = $1
     AND actual_outcome IS NOT NULL
     AND outcome_recorded_at > NOW() - INTERVAL '7 days'`,
    [model.id]
  );

  const stats = predictions[0];
  const correct = parseInt(stats.correct || '0', 10);
  const total = parseInt(stats.total || '0', 10);
  const accuracy = parseFloat(stats.accuracy || '0');

  console.log(`[ModelRetrainer] Model ${model.version}: ${correct}/${total} predictions correct (accuracy: ${(accuracy * 100).toFixed(1)}%)`);

  // Not enough samples yet
  if (total < MIN_SAMPLES_FOR_RETRAIN) {
    console.log(`[ModelRetrainer] Model ${model.version}: Not enough samples for retraining (${total}/${MIN_SAMPLES_FOR_RETRAIN})`);
    return;
  }

  // Check if accuracy is below threshold
  if (accuracy < ACCURACY_THRESHOLD) {
    console.log(`[ModelRetrainer] Model ${model.version}: Accuracy ${(accuracy * 100).toFixed(1)}% below threshold ${(ACCURACY_THRESHOLD * 100).toFixed(1)}%`);
    await triggerRetraining(model, accuracy);
  }

  // Check for feature drift
  await checkFeatureDrift(model);

  // Update model metadata
  await pool.query(
    `UPDATE sira_models
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{last_evaluation}',
       to_jsonb(NOW())
     )
     WHERE id = $1`,
    [model.id]
  );
}

/**
 * Trigger model retraining
 */
async function triggerRetraining(model: any, currentAccuracy: number): Promise<void> {
  console.log(`[ModelRetrainer] Triggering retraining for model ${model.version}...`);

  try {
    // Get training data from predictions with outcomes
    const { rows: trainingData } = await pool.query(
      `SELECT
         features_used,
         actual_outcome,
         win_probability
       FROM sira_predictions
       WHERE actual_outcome IS NOT NULL
       ORDER BY outcome_recorded_at DESC
       LIMIT 10000`
    );

    console.log(`[ModelRetrainer] Collected ${trainingData.length} training samples`);

    // Call ML API to retrain
    const response = await fetch(`${SIRA_ML_API_URL}/retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_type: model.model_type,
        current_version: model.version,
        training_data: trainingData,
        current_accuracy: currentAccuracy,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML API returned ${response.status}`);
    }

    const result: any = await response.json();

    // Create new model version
    await pool.query(
      `INSERT INTO sira_models (
        model_type, version, status, accuracy, training_samples,
        hyperparameters, feature_importance, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        model.model_type,
        result.new_version,
        'testing', // Start in testing mode
        result.accuracy,
        trainingData.length,
        JSON.stringify(result.hyperparameters || {}),
        JSON.stringify(result.feature_importance || {}),
        JSON.stringify({
          retrained_at: new Date().toISOString(),
          previous_version: model.version,
          previous_accuracy: currentAccuracy,
          trigger_reason: 'accuracy_below_threshold',
        }),
      ]
    );

    console.log(`[ModelRetrainer] Created new model version ${result.new_version} with accuracy ${result.accuracy.toFixed(4)}`);

    // Create audit log
    await pool.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'sira_model',
        model.id,
        'retrained',
        'model_retrainer',
        JSON.stringify({
          new_version: result.new_version,
          old_accuracy: currentAccuracy,
          new_accuracy: result.accuracy,
          training_samples: trainingData.length,
        }),
      ]
    );
  } catch (error: any) {
    console.error(`[ModelRetrainer] Retraining failed for model ${model.version}:`, error.message);

    // Log failure
    await pool.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        'sira_model',
        model.id,
        'retrain_failed',
        'model_retrainer',
        JSON.stringify({ error: error.message, accuracy: currentAccuracy }),
      ]
    );
  }
}

/**
 * Check for feature drift (features changing distribution over time)
 */
async function checkFeatureDrift(model: any): Promise<void> {
  // Get feature importance from recent predictions
  const { rows: recentFeatures } = await pool.query(
    `SELECT features_used
     FROM sira_predictions
     WHERE model_id = $1
     AND created_at > NOW() - INTERVAL '7 days'
     LIMIT 1000`,
    [model.id]
  );

  if (recentFeatures.length < 100) {
    return; // Not enough data
  }

  // Calculate feature statistics
  const featureStats: Record<string, { mean: number; stddev: number; count: number }> = {};

  for (const row of recentFeatures) {
    const features = row.features_used;
    for (const [key, value] of Object.entries(features)) {
      if (typeof value === 'number') {
        if (!featureStats[key]) {
          featureStats[key] = { mean: 0, stddev: 0, count: 0 };
        }
        featureStats[key].mean += value;
        featureStats[key].count += 1;
      }
    }
  }

  // Calculate means
  for (const [key, stats] of Object.entries(featureStats)) {
    stats.mean = stats.mean / stats.count;
  }

  // Store feature statistics
  await pool.query(
    `INSERT INTO sira_feature_importance (
      model_id, feature_name, importance_score, mean_value, stddev_value, sample_count
    )
    SELECT $1, key, 0, $2::jsonb->key, 0, $3::jsonb->key
    FROM jsonb_object_keys($2) AS key
    ON CONFLICT (model_id, feature_name)
    DO UPDATE SET
      mean_value = EXCLUDED.mean_value,
      sample_count = EXCLUDED.sample_count,
      updated_at = NOW()`,
    [model.id, JSON.stringify(featureStats), JSON.stringify(featureStats)]
  );

  console.log(`[ModelRetrainer] Updated feature statistics for model ${model.version} (${Object.keys(featureStats).length} features)`);
}

/**
 * Main worker loop
 */
async function start(): Promise<void> {
  console.log('[ModelRetrainer] Starting model retrainer worker...');

  // Run immediately on startup
  await checkAndRetrain();

  // Then run every 24 hours
  setInterval(async () => {
    await checkAndRetrain();
  }, POLL_INTERVAL_MS);
}

// Start worker
start().catch((error) => {
  console.error('[ModelRetrainer] Fatal error:', error);
  process.exit(1);
});
