/**
 * SIRA Recommendation Worker
 * Brique 72 - Account Capabilities & Limits
 *
 * Periodically evaluates limits for all active users and applies SIRA recommendations
 * Schedule: Daily at 3 AM (low-traffic period)
 */

import cron from 'node-cron';
import { pool } from '../db';
import { batchEvaluateLimits } from '../services/siraLimits';

// ========================================
// Worker Configuration
// ========================================

const WORKER_CONFIG = {
  // Run daily at 3 AM
  schedule: '0 3 * * *',

  // Batch size for processing users
  batchSize: 100,

  // Only evaluate users active in last N days
  activeDaysThreshold: 30,

  // Enable/disable worker
  enabled: process.env.ENABLE_SIRA_RECOMMENDATIONS === 'true',
};

// ========================================
// Worker Logic
// ========================================

/**
 * Fetch users eligible for limit evaluation
 */
async function fetchEligibleUsers(): Promise<string[]> {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE u.status = 'active'
         AND u.kyc_level IN ('P1', 'P2', 'P3')
         AND u.last_activity_at >= NOW() - INTERVAL '${WORKER_CONFIG.activeDaysThreshold} days'
       ORDER BY u.last_activity_at DESC`,
    );

    return result.rows.map((row) => row.id);
  } catch (error) {
    console.error('Error fetching eligible users', error);
    return [];
  }
}

/**
 * Process a batch of users
 */
async function processBatch(userIds: string[]): Promise<{
  evaluated: number;
  autoApplied: number;
  requiresReview: number;
  errors: number;
}> {
  console.log(`Processing batch of ${userIds.length} users...`);

  const results = await batchEvaluateLimits(userIds);

  let autoApplied = 0;
  let requiresReview = 0;
  let errors = 0;

  for (const [userId, recommendation] of results.entries()) {
    if (recommendation.action === 'auto_apply') {
      autoApplied++;
    } else if (recommendation.action === 'require_review') {
      requiresReview++;
    } else {
      // 'suggest_to_ops' - no action for now
    }
  }

  errors = userIds.length - results.size;

  return {
    evaluated: results.size,
    autoApplied,
    requiresReview,
    errors,
  };
}

/**
 * Main worker execution
 */
async function executeSiraWorker(): Promise<void> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('Starting SIRA Limit Recommendation Worker');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Fetch eligible users
    const userIds = await fetchEligibleUsers();
    console.log(`Found ${userIds.length} eligible users`);

    if (userIds.length === 0) {
      console.log('No users to process');
      return;
    }

    // Process in batches
    const batches: string[][] = [];
    for (let i = 0; i < userIds.length; i += WORKER_CONFIG.batchSize) {
      batches.push(userIds.slice(i, i + WORKER_CONFIG.batchSize));
    }

    console.log(`Processing ${batches.length} batches of up to ${WORKER_CONFIG.batchSize} users each`);

    let totalEvaluated = 0;
    let totalAutoApplied = 0;
    let totalRequiresReview = 0;
    let totalErrors = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\nBatch ${i + 1}/${batches.length}:`);

      const results = await processBatch(batch);

      totalEvaluated += results.evaluated;
      totalAutoApplied += results.autoApplied;
      totalRequiresReview += results.requiresReview;
      totalErrors += results.errors;

      console.log(`  Evaluated: ${results.evaluated}`);
      console.log(`  Auto-applied: ${results.autoApplied}`);
      console.log(`  Requires review: ${results.requiresReview}`);
      console.log(`  Errors: ${results.errors}`);

      // Brief pause between batches to avoid overwhelming DB
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n========================================');
    console.log('SIRA Worker Completed');
    console.log('========================================');
    console.log(`Total users evaluated: ${totalEvaluated}`);
    console.log(`Auto-applied recommendations: ${totalAutoApplied}`);
    console.log(`Requires manual review: ${totalRequiresReview}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Duration: ${duration}s`);
    console.log('========================================\n');

    // Log to database
    await logWorkerExecution({
      evaluatedCount: totalEvaluated,
      autoAppliedCount: totalAutoApplied,
      reviewCount: totalRequiresReview,
      errorCount: totalErrors,
      durationSeconds: parseFloat(duration),
    });
  } catch (error) {
    console.error('SIRA worker execution failed', error);

    // Log failure
    await logWorkerExecution({
      evaluatedCount: 0,
      autoAppliedCount: 0,
      reviewCount: 0,
      errorCount: 1,
      durationSeconds: (Date.now() - startTime) / 1000,
      error: (error as Error).message,
    });
  }
}

/**
 * Log worker execution to database
 */
async function logWorkerExecution(stats: {
  evaluatedCount: number;
  autoAppliedCount: number;
  reviewCount: number;
  errorCount: number;
  durationSeconds: number;
  error?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO limit_audit (action, entity_type, payload)
       VALUES ('sira_worker_execution', 'worker', $1)`,
      [JSON.stringify({
        ...stats,
        timestamp: new Date().toISOString(),
      })]
    );
  } catch (error) {
    console.error('Failed to log worker execution', error);
  }
}

// ========================================
// Worker Scheduler
// ========================================

/**
 * Start the SIRA worker
 */
export function startSiraWorker(): void {
  if (!WORKER_CONFIG.enabled) {
    console.log('SIRA Recommendation Worker is DISABLED (set ENABLE_SIRA_RECOMMENDATIONS=true to enable)');
    return;
  }

  console.log(`Starting SIRA Recommendation Worker (schedule: ${WORKER_CONFIG.schedule})`);

  cron.schedule(WORKER_CONFIG.schedule, async () => {
    console.log('SIRA worker triggered by cron schedule');
    await executeSiraWorker();
  });

  console.log('✓ SIRA Recommendation Worker scheduled');
}

/**
 * Run worker immediately (for testing or manual execution)
 */
export async function runSiraWorkerNow(): Promise<void> {
  console.log('Running SIRA worker immediately (manual trigger)');
  await executeSiraWorker();
}

// ========================================
// Standalone Execution
// ========================================

// If run directly (not imported), execute immediately
if (require.main === module) {
  console.log('Running SIRA worker in standalone mode');

  runSiraWorkerNow()
    .then(() => {
      console.log('Worker completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Worker failed', error);
      process.exit(1);
    });
}
