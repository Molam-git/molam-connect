/**
 * Workers Entry Point
 * Starts all background workers
 */
import dotenv from "dotenv";
import { startCallbackProcessor } from "./callbackProcessor.js";
import { startSLAMonitor } from "./slaMonitor.js";

dotenv.config();

console.log("🚀 Starting Brique 55 - Disputes Workers...");

// Start all workers
startCallbackProcessor();
startSLAMonitor();

console.log("✅ All workers started successfully");

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  process.exit(0);
});
