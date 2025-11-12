/**
 * Brique 42 - Connect Payments
 * Payout Eligibility Worker
 *
 * Calculates payout eligibility for captured charges
 * Enforces minimum 3-day hold + additional days based on risk
 * Run as cron job or scheduled task (every hour)
 */

import dotenv from "dotenv";
import { pool } from "../src/db";
import { calculateRiskHoldDays } from "../src/services/sira";

dotenv.config();

async function run() {
  console.log(`[Payout Eligibility] Starting at ${new Date().toISOString()}`);

  try {
    // Get captured charges without eligibility record
    const { rows } = await pool.query(
      `SELECT c.id, c.connect_account_id, c.created_at, c.risk_label, r.mode, r.min_hold_days
       FROM connect_charges c
       JOIN connect_settlement_rules r ON r.connect_account_id = c.connect_account_id AND r.active = true
       WHERE c.status = 'captured'
       AND NOT EXISTS (SELECT 1 FROM connect_payout_eligibility e WHERE e.charge_id = c.id)
       LIMIT 1000`
    );

    console.log(`[Payout Eligibility] Found ${rows.length} charges to process`);

    let processed = 0;

    for (const row of rows) {
      try {
        // Enforce minimum 3 days (hard floor)
        const baseDays = Math.max(3, row.min_hold_days);

        // Add extra days based on risk
        const extraDays = calculateRiskHoldDays(row.risk_label);

        const totalHoldDays = baseDays + extraDays;

        // Calculate eligible date
        const eligibleAt = new Date(
          new Date(row.created_at).getTime() + totalHoldDays * 24 * 3600 * 1000
        );

        const reason = extraDays > 0
          ? `hold_${baseDays}_days_plus_${extraDays}_risk`
          : `hold_${baseDays}_days`;

        // Insert eligibility record
        await pool.query(
          `INSERT INTO connect_payout_eligibility (charge_id, connect_account_id, eligible_at, reason)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (charge_id) DO NOTHING`,
          [row.id, row.connect_account_id, eligibleAt, reason]
        );

        processed++;

        console.log(
          `[Payout Eligibility] Charge ${row.id}: eligible on ${eligibleAt.toISOString()} (${totalHoldDays} days, ${row.risk_label} risk)`
        );
      } catch (e: any) {
        console.error(
          `[Payout Eligibility] Error processing charge ${row.id}:`,
          e.message
        );
      }
    }

    console.log(`[Payout Eligibility] Completed: ${processed} charges processed`);

    // Close database connection
    await pool.end();
    process.exit(0);
  } catch (e: any) {
    console.error("[Payout Eligibility] Fatal error:", e);
    await pool.end();
    process.exit(1);
  }
}

// Run the worker
run().catch((e) => {
  console.error("[Payout Eligibility] Unhandled error:", e);
  process.exit(1);
});
