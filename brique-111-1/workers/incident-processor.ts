/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Incident Processor Worker Entry Point
 */

import { startIncidentProcessor } from "../src/workers/incident-processor";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

// Start worker
startIncidentProcessor().catch((error) => {
  logger.error({ error }, "Failed to start incident processor");
  process.exit(1);
});

logger.info("🔄 Incident processor worker started");



