/**
 * Brique 49 - Tax Compute Worker
 * Background worker for batch tax computation
 *
 * Triggered periodically or by event bus with batch IDs
 */

import dotenv from "dotenv";
import { pool } from "../utils/db.js";
import { computeTaxForCharges } from "../services/taxCompute.js";

dotenv.config();

const WORKER_ID = process.env.WORKER_ID || "tax-worker-1";
const BATCH_SIZE = Number(process.env.TAX_COMPUTE_BATCH_SIZE) || 200;
const INTERVAL_MS = Number(process.env.TAX_COMPUTE_INTERVAL_MS) || 5000;

/**
 * Process a batch of unbilled charges
 */
async function tick() {
  try {
    // Find unbilled charges
    const { rows } = await pool.query(
      `SELECT id FROM billing_charges
       WHERE status = 'unbilled'
       ORDER BY occurred_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (!rows.length) {
      console.log(`[${WORKER_ID}] No unbilled charges found`);
      return;
    }

    const ids = rows.map((r) => r.id);

    // Mark as processing (simple lock mechanism)
    await pool.query(
      `UPDATE billing_charges SET status = 'processing' WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    console.log(`[${WORKER_ID}] Processing ${ids.length} charges...`);

    // Compute taxes
    const result = await computeTaxForCharges(ids, WORKER_ID);

    console.log(`[${WORKER_ID}] Tax compute completed: ${result.processed} processed, ${result.errors.length} errors`);

    if (result.errors.length > 0) {
      console.error(`[${WORKER_ID}] Errors:`, result.errors);
    }

    // Revert status to unbilled (invoice aggregator will mark as billed when included in invoice)
    await pool.query(
      `UPDATE billing_charges SET status = 'unbilled' WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  } catch (err) {
    console.error(`[${WORKER_ID}] Tick error:`, err);
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log(`🧾 Brique 49 - Tax Compute Worker`);
  console.log(`📊 Worker ID: ${WORKER_ID}`);
  console.log(`🔄 Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Interval: ${INTERVAL_MS}ms`);

  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error(`[${WORKER_ID}] Main loop error:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { tick };
