/**
 * Refund worker - processes pending refunds automatically
 */
import { pool } from "../utils/db.js";
import { processRefund } from "../services/refundService.js";

export async function startRefundWorker(): Promise<void> {
  console.log("Refund processing worker started");

  setInterval(async () => {
    await processPendingRefunds();
  }, 30000); // Run every 30 seconds
}

async function processPendingRefunds(): Promise<void> {
  try {
    // Get refunds that are ready to be processed
    const { rows } = await pool.query(
      `SELECT * FROM refunds
       WHERE status = 'processing'
       LIMIT 10`
    );

    for (const refund of rows) {
      try {
        console.log(`Processing refund ${refund.id}`);
        await processRefund(refund.id);
      } catch (err) {
        console.error(`Failed to process refund ${refund.id}:`, err);
        // Error is already logged in processRefund, continue with next
      }
    }

    if (rows.length > 0) {
      console.log(`Processed ${rows.length} refunds`);
    }
  } catch (err) {
    console.error("Failed to process pending refunds:", err);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startRefundWorker().catch(console.error);
}
