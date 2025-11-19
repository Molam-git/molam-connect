// ============================================================================
// Settlement Worker - Batch Processing
// ============================================================================

import { Pool } from "pg";
import { processInstruction } from "../services/settlement-engine";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5000; // 5 seconds

/**
 * Process pending settlement instructions
 */
export async function runSettlementWorker() {
  const { rows } = await pool.query(
    `SELECT id FROM settlement_instructions
     WHERE status IN ('pending','failed')
     AND retries < max_retries
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  console.log(`[Settlement Worker] Processing ${rows.length} instructions...`);

  let succeeded = 0;
  let failed = 0;

  for (const { id } of rows) {
    try {
      await processInstruction(id);
      succeeded++;
    } catch (e: any) {
      failed++;
      console.error(`[Settlement Worker] Failed to process ${id}:`, e.message);
    }
  }

  console.log(`[Settlement Worker] Completed: ${succeeded} succeeded, ${failed} failed`);

  return { succeeded, failed, total: rows.length };
}

/**
 * Process batch of instructions atomically
 */
export async function processBatch(batchId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock batch
    const { rows: [batch] } = await client.query(
      `SELECT * FROM settlement_batches WHERE id=$1 FOR UPDATE`,
      [batchId]
    );

    if (!batch) {
      throw new Error("batch_not_found");
    }

    // Get batch instructions
    const { rows: instructions } = await client.query(
      `SELECT id FROM settlement_instructions WHERE batch_id=$1 AND status='pending'`,
      [batchId]
    );

    await client.query("COMMIT");

    console.log(`[Batch Processor] Processing batch ${batch.batch_ref} with ${instructions.length} instructions`);

    let confirmed = 0;
    let failed = 0;

    // Process each instruction
    for (const { id } of instructions) {
      try {
        await processInstruction(id);
        confirmed++;
      } catch (e) {
        failed++;
      }
    }

    // Update batch status
    await pool.query(
      `UPDATE settlement_batches SET
        confirmed_count=$2,
        failed_count=$3,
        status=CASE WHEN $2+$3=$4 THEN 'completed' ELSE 'partial' END,
        completed_at=CASE WHEN $2+$3=$4 THEN now() ELSE NULL END
       WHERE id=$1`,
      [batchId, confirmed, failed, batch.total_instructions]
    );

    console.log(`[Batch Processor] Batch ${batch.batch_ref} completed: ${confirmed} confirmed, ${failed} failed`);

    return { confirmed, failed };
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Start settlement worker loop
 */
export async function startSettlementWorker() {
  console.log("[Settlement Worker] Starting...");

  // Run immediately
  await runSettlementWorker();

  // Run periodically
  setInterval(async () => {
    try {
      await runSettlementWorker();
    } catch (e: any) {
      console.error("[Settlement Worker] Error:", e.message);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Monitor stuck instructions
 */
export async function monitorStuckInstructions() {
  const STUCK_THRESHOLD_MINUTES = 10;

  const { rows: stuck } = await pool.query(
    `SELECT * FROM settlement_instructions
     WHERE status='sent'
     AND sent_at < now() - interval '${STUCK_THRESHOLD_MINUTES} minutes'
     AND confirmed_at IS NULL`
  );

  if (stuck.length > 0) {
    console.warn(`[Settlement Monitor] Found ${stuck.length} stuck instructions`);

    for (const instr of stuck) {
      // Mark for retry
      await pool.query(
        `UPDATE settlement_instructions SET status='pending' WHERE id=$1`,
        [instr.id]
      );
    }
  }
}

// Start if run directly
if (require.main === module) {
  startSettlementWorker().catch(console.error);
}
