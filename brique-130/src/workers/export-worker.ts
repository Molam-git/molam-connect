// ============================================================================
// Export Worker - Process Pending Jobs
// ============================================================================

import { Pool } from "pg";
import { generateExport } from "../services/export-generator";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Process pending export jobs
 */
export async function processExportJobs() {
  const { rows: jobs } = await pool.query(
    `SELECT id FROM treasury_export_jobs
     WHERE status='pending'
     ORDER BY created_at ASC
     LIMIT 10`
  );

  console.log(`[Export Worker] Processing ${jobs.length} jobs...`);

  for (const { id } of jobs) {
    try {
      await generateExport(id);
    } catch (e: any) {
      console.error(`[Export Worker] Job ${id} failed:`, e.message);
    }
  }
}

/**
 * Start export worker
 */
export async function startExportWorker() {
  console.log("[Export Worker] Starting...");

  // Run immediately
  await processExportJobs();

  // Run every 60 seconds
  setInterval(async () => {
    try {
      await processExportJobs();
    } catch (e: any) {
      console.error("[Export Worker] Error:", e.message);
    }
  }, 60000);
}

// Start if run directly
if (require.main === module) {
  startExportWorker().catch(console.error);
}
