// ============================================================================
// FX Rate Aggregator Worker
// ============================================================================

import { refreshRates } from "../services/fx-service";

const REFRESH_INTERVAL_MS = 10000; // 10s

export async function startAggregator() {
  console.log("[FX Aggregator] Starting worker...");

  // Initial refresh
  await refreshRates();

  // Periodic refresh
  setInterval(async () => {
    try {
      await refreshRates();
      console.log(`[FX Aggregator] Rates refreshed at ${new Date().toISOString()}`);
    } catch (e: any) {
      console.error("[FX Aggregator] Refresh error:", e.message);
    }
  }, REFRESH_INTERVAL_MS);
}

// Start if run directly
if (require.main === module) {
  startAggregator().catch(console.error);
}
