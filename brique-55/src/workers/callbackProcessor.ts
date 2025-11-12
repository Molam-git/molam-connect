/**
 * Callback Processor Worker
 * Processes raw network callbacks and creates/updates disputes
 */
import { pool } from "../utils/db.js";
import { ingestNetworkDispute } from "../services/disputeService.js";

const BATCH_SIZE = parseInt(process.env.CALLBACK_BATCH_SIZE || "10");

/**
 * Process unprocessed callbacks
 */
export async function processCallbacks(): Promise<void> {
  try {
    // Fetch unprocessed callbacks
    const { rows: callbacks } = await pool.query(
      `SELECT * FROM dispute_callbacks_raw
       WHERE NOT processed
       ORDER BY received_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (callbacks.length === 0) {
      return; // No work to do
    }

    console.log(`Processing ${callbacks.length} callbacks...`);

    for (const callback of callbacks) {
      try {
        const { id, network, payload, external_id } = callback;

        // Extract external dispute ID
        const externalDisputeId =
          external_id || payload.dispute_id || payload.id || `${network}_${Date.now()}`;

        // Ingest dispute
        await ingestNetworkDispute(externalDisputeId, network, payload);

        // Mark as processed
        await pool.query(
          `UPDATE dispute_callbacks_raw
           SET processed = true, processed_at = now()
           WHERE id = $1`,
          [id]
        );

        console.log(`Processed callback ${id} -> dispute ${externalDisputeId}`);
      } catch (error: any) {
        console.error(`Failed to process callback ${callback.id}:`, error);

        // Mark as failed with error message
        await pool.query(
          `UPDATE dispute_callbacks_raw
           SET error_message = $1
           WHERE id = $2`,
          [error.message, callback.id]
        );
      }
    }
  } catch (error) {
    console.error("Callback processor error:", error);
  }
}

/**
 * Start worker loop
 */
export function startCallbackProcessor(): void {
  const interval = parseInt(process.env.WORKER_INTERVAL_MS || "30000");
  console.log(`Starting callback processor (interval: ${interval}ms)...`);

  setInterval(async () => {
    await processCallbacks();
  }, interval);

  // Run immediately on start
  processCallbacks();
}
