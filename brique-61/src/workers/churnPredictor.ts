import { pool } from '../utils/db';
import * as churnService from '../services/churnService';

/**
 * Churn Predictor Worker
 * Runs periodically to predict churn risk for active subscriptions using SIRA
 */

const INTERVAL_MS = parseInt(process.env.CHURN_PREDICTION_INTERVAL_MS || '86400000', 10); // Default: 24 hours
const RISK_THRESHOLD = parseFloat(process.env.CHURN_RISK_THRESHOLD || '50'); // Minimum risk score to create prediction

interface Subscription {
  id: string;
  merchant_id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  quantity: number;
  metadata: any;
}

async function predictChurnForAllSubscriptions(): Promise<void> {
  console.log('[Churn Worker] Starting churn prediction...');

  try {
    // Get active subscriptions without recent predictions
    const { rows } = await pool.query<Subscription>(
      `SELECT s.*
       FROM subscriptions s
       LEFT JOIN churn_predictions cp ON cp.subscription_id = s.id
         AND cp.created_at > NOW() - INTERVAL '24 hours'
       WHERE s.status IN ('active', 'trialing', 'past_due')
         AND cp.id IS NULL
       ORDER BY s.created_at ASC
       LIMIT 100`
    );

    console.log(`[Churn Worker] Found ${rows.length} subscriptions to analyze`);

    let predictionsCreated = 0;

    for (const subscription of rows) {
      try {
        // Get churn prediction from SIRA (mock for now)
        const prediction = await churnService.predictChurnRisk(subscription);

        // Only create prediction if risk score exceeds threshold
        if (prediction.risk_score >= RISK_THRESHOLD) {
          await churnService.createChurnPrediction({
            subscription_id: subscription.id,
            merchant_id: subscription.merchant_id,
            risk_score: prediction.risk_score,
            predicted_reason: prediction.predicted_reason,
            recommended_action: prediction.recommended_action,
          });

          predictionsCreated++;
          console.log(
            `[Churn Worker] ✓ Created prediction for subscription ${subscription.id} ` +
            `(risk: ${prediction.risk_score}, reason: ${prediction.predicted_reason})`
          );
        }
      } catch (error: any) {
        console.error(
          `[Churn Worker] ✗ Error predicting churn for subscription ${subscription.id}:`,
          error.message
        );
      }
    }

    console.log(`[Churn Worker] Completed: ${predictionsCreated} predictions created`);
  } catch (error: any) {
    console.error('[Churn Worker] Fatal error:', error);
  }
}

async function run(): Promise<void> {
  console.log(`[Churn Worker] Starting with interval: ${INTERVAL_MS}ms`);
  console.log(`[Churn Worker] Risk threshold: ${RISK_THRESHOLD}`);

  // Run immediately on startup
  await predictChurnForAllSubscriptions();

  // Then run periodically
  setInterval(async () => {
    await predictChurnForAllSubscriptions();
  }, INTERVAL_MS);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Churn Worker] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Churn Worker] Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start the worker
run().catch((error) => {
  console.error('[Churn Worker] Failed to start:', error);
  process.exit(1);
});
