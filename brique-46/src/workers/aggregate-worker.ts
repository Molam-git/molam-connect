/**
 * Brique 46 - Aggregate Worker
 * Background job for invoice generation
 *
 * Runs on schedule (monthly/weekly) or on-demand
 */

import dotenv from "dotenv";
import { pool } from "../utils/db.js";
import { buildInvoicesForPeriod } from "../billing/aggregate.js";

dotenv.config();

const SCHEDULE = process.env.AGGREGATE_CRON_SCHEDULE || "0 0 1 * *"; // 1st of month at midnight

async function main() {
  console.log("🧾 Brique 46 - Aggregate Worker");
  console.log(`📅 Schedule: ${SCHEDULE}`);
  console.log("🔄 Running invoice aggregation...");

  try {
    // Monthly aggregation (default)
    await buildInvoicesForPeriod("monthly");

    console.log("✅ Invoice aggregation completed");
  } catch (err) {
    console.error("❌ Invoice aggregation failed:", err);
    process.exit(1);
  }

  // Close pool
  await pool.end();
  process.exit(0);
}

main();
