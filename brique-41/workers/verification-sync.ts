/**
 * Brique 41 - Molam Connect
 * Verification Sync Worker
 *
 * Periodically syncs verification status with Wallet (B33)
 * Run as cron job or scheduled task
 */

import dotenv from "dotenv";
import { pool } from "../src/db";
import { refreshVerification } from "../src/services/verification";

dotenv.config();

async function run() {
  console.log(`[Verification Sync] Starting at ${new Date().toISOString()}`);

  try {
    // Get accounts that need verification refresh
    // Focus on accounts that are unverified or pending
    const { rows } = await pool.query(
      `SELECT id, wallet_id, verification_status, updated_at
       FROM connect_accounts
       WHERE verification_status IN ('unverified', 'pending')
       AND updated_at < NOW() - INTERVAL '1 hour'
       LIMIT 500`
    );

    console.log(`[Verification Sync] Found ${rows.length} accounts to sync`);

    let successCount = 0;
    let failCount = 0;

    for (const account of rows) {
      try {
        const result = await refreshVerification(account.id);
        console.log(
          `[Verification Sync] Account ${account.id}: ${account.verification_status} -> ${result.status}`
        );
        successCount++;
      } catch (e: any) {
        console.error(
          `[Verification Sync] Failed to refresh account ${account.id}:`,
          e.message
        );
        failCount++;
      }
    }

    console.log(`[Verification Sync] Completed: ${successCount} success, ${failCount} failed`);

    // Close database connection
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("[Verification Sync] Fatal error:", e);
    await pool.end();
    process.exit(1);
  }
}

// Run the worker
run().catch((e) => {
  console.error("[Verification Sync] Unhandled error:", e);
  process.exit(1);
});
