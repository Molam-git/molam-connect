/**
 * Brique 111 - Merchant Config UI
 * Self-Healing Worker: Runs periodically to detect and fix plugin issues
 */

import { selfHealingService } from "../src/services/selfHealingService";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

/**
 * Main worker function
 */
async function runSelfHealing() {
  logger.info("🔍 Starting self-healing analysis...");

  try {
    await selfHealingService.processAllPlugins();
    logger.info("✅ Self-healing analysis completed");
  } catch (error: any) {
    logger.error({ error }, "❌ Self-healing failed");
    process.exit(1);
  }
}

// Run immediately
runSelfHealing();

// Then run every 15 minutes
setInterval(runSelfHealing, 15 * 60 * 1000);

logger.info("🔄 Self-healing worker started (runs every 15 minutes)");


