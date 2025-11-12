// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Metrics Aggregator - Daily Fraud Metrics Computation
// ============================================================================

import dotenv from "dotenv";
dotenv.config();

import { pool, closeDb } from "../utils/db";

const AGGREGATION_INTERVAL_MS = parseInt(process.env.METRICS_AGGREGATION_INTERVAL_MS || "3600000"); // 1 hour

async function aggregateMetrics() {
  console.log("Running metrics aggregation...");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Aggregate metrics for the last hour
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - AGGREGATION_INTERVAL_MS);

    // Count decisions by type
    const decisionsQuery = `
      SELECT
        decision,
        COUNT(*) as count,
        AVG(score) as avg_score,
        AVG(sira_score) as avg_sira_score,
        AVG(confidence) as avg_confidence
      FROM fraud_decisions
      WHERE decided_at >= $1 AND decided_at < $2
      GROUP BY decision
    `;

    const decisionsResult = await client.query(decisionsQuery, [oneHourAgo, now]);

    // Count reviews by status
    const reviewsQuery = `
      SELECT
        status,
        priority,
        COUNT(*) as count
      FROM fraud_reviews
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY status, priority
    `;

    const reviewsResult = await client.query(reviewsQuery, [oneHourAgo, now]);

    // Count blacklist hits
    const blacklistQuery = `
      SELECT COUNT(*) as hits
      FROM fraud_signals
      WHERE signal_type = 'blacklist_hit'
        AND created_at >= $1 AND created_at < $2
    `;

    const blacklistResult = await client.query(blacklistQuery, [oneHourAgo, now]);

    // Compute fraud rate
    const totalDecisions = decisionsResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const blockedDecisions = decisionsResult.rows.find(row => row.decision === "block");
    const fraudRate = totalDecisions > 0 ? (parseInt(blockedDecisions?.count || "0") / totalDecisions) * 100 : 0;

    // Store aggregated metrics
    const insertQuery = `
      INSERT INTO fraud_metrics (
        period_start, period_end, total_decisions, fraud_rate,
        decisions_breakdown, reviews_breakdown, blacklist_hits
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await client.query(insertQuery, [
      oneHourAgo,
      now,
      totalDecisions,
      fraudRate,
      JSON.stringify(decisionsResult.rows),
      JSON.stringify(reviewsResult.rows),
      parseInt(blacklistResult.rows[0].hits),
    ]);

    await client.query("COMMIT");

    console.log(`Metrics aggregated: ${totalDecisions} decisions, ${fraudRate.toFixed(2)}% fraud rate`);
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Metrics aggregation error:", error);
  } finally {
    client.release();
  }
}

async function main() {
  console.log("Starting Metrics Aggregator...");
  console.log(`Aggregation interval: ${AGGREGATION_INTERVAL_MS}ms`);

  // Run initial aggregation
  await aggregateMetrics();

  // Schedule periodic aggregation
  setInterval(async () => {
    try {
      await aggregateMetrics();
    } catch (error) {
      console.error("Scheduled aggregation failed:", error);
    }
  }, AGGREGATION_INTERVAL_MS);
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down metrics aggregator...");
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down metrics aggregator...");
  await closeDb();
  process.exit(0);
});

// Start aggregator
main().catch((error) => {
  console.error("Fatal error in metrics aggregator:", error);
  process.exit(1);
});
