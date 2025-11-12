import { pool } from '../utils/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MODEL_NAME = 'sira_churn_v1';
const CANARY_TRAFFIC_PERCENT = parseFloat(process.env.SIRA_CANARY_PERCENT || '5');
const CANARY_EVALUATION_HOURS = parseInt(process.env.SIRA_CANARY_HOURS || '24', 10);
const MIN_AUC_THRESHOLD = parseFloat(process.env.SIRA_MIN_AUC || '0.70');

interface ModelMetrics {
  auc: number;
  precision: number;
  recall: number;
  f1?: number;
}

/**
 * Trigger Python training pipeline
 */
async function runRetrain(): Promise<string | null> {
  console.log('[Retrain Orchestrator] Starting model retraining...');

  try {
    // Execute Python trainer
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const trainerScript = 'src/sira/trainer/train_churn.py';

    console.log(`[Retrain Orchestrator] Executing: ${pythonPath} ${trainerScript}`);

    const { stdout, stderr } = await execAsync(`${pythonPath} ${trainerScript}`, {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for logs
    });

    console.log('[Retrain Orchestrator] Training output:', stdout);

    if (stderr) {
      console.warn('[Retrain Orchestrator] Training warnings:', stderr);
    }

    // Get latest model version from registry (should be in staging)
    const { rows } = await pool.query(
      `SELECT version, s3_key, metrics
       FROM model_registry
       WHERE model_name = $1 AND status = 'staging'
       ORDER BY created_at DESC
       LIMIT 1`,
      [MODEL_NAME]
    );

    if (rows.length === 0) {
      throw new Error('No staging model found after training');
    }

    const version = rows[0].version;
    const metrics: ModelMetrics = rows[0].metrics;

    console.log(`[Retrain Orchestrator] ✓ Training complete: ${version}`);
    console.log(`[Retrain Orchestrator] Metrics:`, metrics);

    // Validate metrics before promotion
    if (metrics.auc < MIN_AUC_THRESHOLD) {
      console.error(`[Retrain Orchestrator] ✗ Model ${version} failed quality check (AUC: ${metrics.auc} < ${MIN_AUC_THRESHOLD})`);
      await markModelRetired(version, 'failed_quality_check');
      return null;
    }

    // Promote to canary
    await promoteToCanary(version);

    return version;
  } catch (error: any) {
    console.error('[Retrain Orchestrator] Training failed:', error);

    // Log failure
    await pool.query(
      `INSERT INTO sira_training_logs(model_name, source, notes)
       VALUES ($1, 'auto', $2)`,
      [MODEL_NAME, `Training failed: ${error.message}`]
    );

    return null;
  }
}

/**
 * Promote model to canary status
 */
async function promoteToCanary(version: string): Promise<void> {
  console.log(`[Retrain Orchestrator] Promoting ${version} to canary (${CANARY_TRAFFIC_PERCENT}% traffic)...`);

  await pool.query(
    `UPDATE model_registry
     SET status = 'canary', description = $2
     WHERE model_name = $1 AND version = $3`,
    [
      MODEL_NAME,
      `Canary deployment: ${CANARY_TRAFFIC_PERCENT}% traffic for ${CANARY_EVALUATION_HOURS}h`,
      version,
    ]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs(entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    ['model', version, 'promoted_to_canary', 'system', JSON.stringify({ version, traffic: CANARY_TRAFFIC_PERCENT })]
  );

  console.log(`[Retrain Orchestrator] ✓ Model ${version} is now in canary`);

  // Schedule canary evaluation
  setTimeout(() => {
    evaluateCanary(version).catch((err) => console.error('[Retrain Orchestrator] Canary evaluation failed:', err));
  }, CANARY_EVALUATION_HOURS * 3600 * 1000);
}

/**
 * Evaluate canary model performance and decide promotion/rollback
 */
async function evaluateCanary(version: string): Promise<void> {
  console.log(`[Retrain Orchestrator] Evaluating canary: ${version}`);

  try {
    // Get canary metrics
    const { rows: canaryRows } = await pool.query(
      `SELECT metrics FROM model_registry
       WHERE model_name = $1 AND version = $2 AND status = 'canary'`,
      [MODEL_NAME, version]
    );

    if (canaryRows.length === 0) {
      console.log(`[Retrain Orchestrator] Canary ${version} no longer exists or was manually changed`);
      return;
    }

    const canaryMetrics: ModelMetrics = canaryRows[0].metrics;

    // Get current production metrics
    const { rows: prodRows } = await pool.query(
      `SELECT version, metrics FROM model_registry
       WHERE model_name = $1 AND status = 'production'
       ORDER BY created_at DESC LIMIT 1`,
      [MODEL_NAME]
    );

    if (prodRows.length === 0) {
      // No production model yet - auto-promote canary
      console.log(`[Retrain Orchestrator] No production model exists, auto-promoting canary ${version}`);
      await promoteToProduction(version);
      return;
    }

    const prodVersion = prodRows[0].version;
    const prodMetrics: ModelMetrics = prodRows[0].metrics;

    // Compare metrics
    const aucDelta = canaryMetrics.auc - prodMetrics.auc;
    const MAX_AUC_DROP = parseFloat(process.env.SIRA_MAX_AUC_DROP || '0.05');

    console.log(`[Retrain Orchestrator] Canary AUC: ${canaryMetrics.auc}, Production AUC: ${prodMetrics.auc}, Delta: ${aucDelta}`);

    if (aucDelta >= -MAX_AUC_DROP) {
      // Canary is good - promote to production
      console.log(`[Retrain Orchestrator] ✓ Canary ${version} passed evaluation, promoting to production`);
      await promoteToProduction(version);

      // Retire old production
      await markModelRetired(prodVersion, 'replaced_by_new_version');
    } else {
      // Canary failed - rollback
      console.error(
        `[Retrain Orchestrator] ✗ Canary ${version} failed (AUC drop: ${aucDelta.toFixed(4)}), rolling back`
      );
      await markModelRetired(version, 'failed_canary_evaluation');

      // Alert ops team
      console.error(`[Retrain Orchestrator] 🚨 ALERT: Canary rollback triggered for ${version}`);
    }
  } catch (error: any) {
    console.error(`[Retrain Orchestrator] Error evaluating canary:`, error);
  }
}

/**
 * Promote model to production
 */
async function promoteToProduction(version: string): Promise<void> {
  await pool.query(
    `UPDATE model_registry
     SET status = 'production', description = 'Active production model'
     WHERE model_name = $1 AND version = $2`,
    [MODEL_NAME, version]
  );

  // Audit log
  await pool.query(
    `INSERT INTO molam_audit_logs(entity_type, entity_id, action, actor_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    ['model', version, 'promoted_to_production', 'system', JSON.stringify({ version })]
  );

  console.log(`[Retrain Orchestrator] ✓ Model ${version} is now in PRODUCTION`);
}

/**
 * Mark model as retired
 */
async function markModelRetired(version: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE model_registry
     SET status = 'retired', description = $3
     WHERE model_name = $1 AND version = $2`,
    [MODEL_NAME, version, `Retired: ${reason}`]
  );

  console.log(`[Retrain Orchestrator] Model ${version} retired: ${reason}`);
}

/**
 * Scheduled retraining worker
 */
async function startScheduledRetraining(): Promise<void> {
  const RETRAIN_INTERVAL_MS = parseInt(process.env.SIRA_RETRAIN_INTERVAL_MS || '86400000', 10); // Default: 24h

  console.log('[Retrain Orchestrator] Starting scheduled retraining...');
  console.log(`[Retrain Orchestrator] Interval: ${RETRAIN_INTERVAL_MS}ms (${RETRAIN_INTERVAL_MS / 3600000}h)`);

  // Run immediately on startup (optional)
  const RUN_ON_STARTUP = process.env.SIRA_RETRAIN_ON_STARTUP === 'true';
  if (RUN_ON_STARTUP) {
    await runRetrain();
  }

  // Schedule periodic retraining
  setInterval(async () => {
    console.log('[Retrain Orchestrator] Triggering scheduled retrain...');
    await runRetrain();
  }, RETRAIN_INTERVAL_MS);
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('[Retrain Orchestrator] Shutting down...');
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start worker
if (require.main === module) {
  startScheduledRetraining().catch((error) => {
    console.error('[Retrain Orchestrator] Fatal error:', error);
    process.exit(1);
  });
}

export { runRetrain, promoteToCanary, evaluateCanary };
