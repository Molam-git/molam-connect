/**
 * Brique 50 - Fiscal Reporting
 * Submission Worker - Automated report submission
 */

import dotenv from "dotenv";
import { pool } from "../utils/db.js";
import { submitReport } from "../services/submissionService.js";

dotenv.config();

const WORKER_ID = process.env.WORKER_ID || "submission-worker-1";
const BATCH_SIZE = Number(process.env.SUBMISSION_BATCH_SIZE) || 50;
const INTERVAL_MS = Number(process.env.SUBMISSION_INTERVAL_MS) || 60000; // 1 minute

/**
 * Process a batch of ready reports
 */
async function tick() {
  try {
    // Find ready reports with active channels
    const { rows } = await pool.query(
      `SELECT DISTINCT fr.id as report_id, c.id as channel_id, c.authority, c.priority
       FROM fiscal_reports fr
       JOIN fiscal_submission_channels c ON c.country = fr.country
       WHERE fr.status = 'ready'
       AND c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM fiscal_submissions fs
         WHERE fs.report_id = fr.id AND fs.channel_id = c.id
         AND fs.status IN ('submitted', 'accepted')
       )
       ORDER BY c.priority ASC, fr.created_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (!rows.length) {
      console.log(`[${WORKER_ID}] No ready reports found for submission`);
      return;
    }

    console.log(`[${WORKER_ID}] Processing ${rows.length} reports...`);

    for (const row of rows) {
      try {
        console.log(`[${WORKER_ID}] Submitting report ${row.report_id} to ${row.authority} (channel: ${row.channel_id})`);

        const result = await submitReport({
          reportId: row.report_id,
          channelId: row.channel_id,
          idempotencyKey: `worker-${WORKER_ID}-${row.report_id}-${row.channel_id}`,
          requestedBy: WORKER_ID,
        });

        console.log(`[${WORKER_ID}] Submission completed: ${result.status}`);

        // Update report status based on result
        if (result.status === "accepted" || result.status === "submitted") {
          await pool.query(`UPDATE fiscal_reports SET status = $1 WHERE id = $2`, [result.status, row.report_id]);
        }
      } catch (err: any) {
        console.error(`[${WORKER_ID}] Submission error for report ${row.report_id}:`, err.message);

        // Create remediation if not exists
        const { rows: remediation } = await pool.query(
          `SELECT id FROM fiscal_remediations WHERE report_id = $1 AND issue_code = 'submission_error'`,
          [row.report_id]
        );

        if (remediation.length === 0) {
          await pool.query(
            `INSERT INTO fiscal_remediations(report_id, issue_code, severity, details, status)
             VALUES ($1, $2, $3, $4, 'open')`,
            [row.report_id, "submission_error", "high", { error: err.message, worker: WORKER_ID }]
          );
        }
      }
    }

    console.log(`[${WORKER_ID}] Batch processing completed`);
  } catch (err) {
    console.error(`[${WORKER_ID}] Tick error:`, err);
  }
}

/**
 * Main worker loop
 */
async function main() {
  console.log(`📊 Brique 50 - Fiscal Submission Worker`);
  console.log(`🆔 Worker ID: ${WORKER_ID}`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Interval: ${INTERVAL_MS}ms`);
  console.log(`---`);

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
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { tick };
