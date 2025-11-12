/**
 * Workers Entry Point
 * Starts all background workers
 */
import dotenv from "dotenv";
import { startActionWorker } from "./actionWorker.js";

dotenv.config();

console.log("🚀 Starting Brique 56 - Radar Workers...");

// Start all workers
startActionWorker();

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
