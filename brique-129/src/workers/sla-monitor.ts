// ============================================================================
// SLA Monitor Worker - Periodic Evaluation
// ============================================================================

import { evaluateSLAs } from "../services/sla-evaluator";

const EVALUATION_INTERVAL_MS = 60000; // 1 minute

/**
 * Run SLA evaluation loop
 */
export async function startSLAMonitor() {
  console.log("[SLA Monitor] Starting...");

  // Run immediately
  await runEvaluation();

  // Run periodically
  setInterval(async () => {
    await runEvaluation();
  }, EVALUATION_INTERVAL_MS);
}

async function runEvaluation() {
  try {
    const start = Date.now();
    const alertsCreated = await evaluateSLAs();
    const duration = Date.now() - start;

    console.log(`[SLA Monitor] Evaluation completed in ${duration}ms - ${alertsCreated} alerts created`);
  } catch (e: any) {
    console.error("[SLA Monitor] Evaluation failed:", e.message);
  }
}

// Start if run directly
if (require.main === module) {
  startSLAMonitor().catch(console.error);
}
