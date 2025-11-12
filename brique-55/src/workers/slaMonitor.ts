/**
 * SLA Monitor Worker
 * Monitors response deadlines and sends alerts
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";

/**
 * Check for disputes approaching deadline
 */
export async function checkSLADeadlines(): Promise<void> {
  try {
    // Find disputes with deadlines within 24 hours
    const { rows: approaching } = await pool.query(
      `SELECT * FROM disputes
       WHERE status IN ('open', 'responding')
         AND response_due_at IS NOT NULL
         AND response_due_at > now()
         AND response_due_at <= now() + interval '24 hours'
       ORDER BY response_due_at ASC`
    );

    for (const dispute of approaching) {
      const hoursRemaining = Math.floor(
        (new Date(dispute.response_due_at).getTime() - Date.now()) / (1000 * 60 * 60)
      );

      console.warn(
        `⚠️  Dispute ${dispute.id} deadline approaching: ${hoursRemaining}h remaining`
      );

      // Send alert to merchant
      await publishEvent("merchant", dispute.merchant_id, "dispute.deadline.approaching", {
        dispute_id: dispute.id,
        hours_remaining: hoursRemaining,
        response_due_at: dispute.response_due_at,
      });

      // Send alert to ops if assigned
      if (dispute.assigned_to) {
        await publishEvent("internal", "ops", "dispute.sla.alert", {
          dispute_id: dispute.id,
          assigned_to: dispute.assigned_to,
          hours_remaining: hoursRemaining,
        });
      }
    }

    // Find overdue disputes
    const { rows: overdue } = await pool.query(
      `SELECT * FROM disputes
       WHERE status IN ('open', 'responding')
         AND response_due_at IS NOT NULL
         AND response_due_at < now()`
    );

    for (const dispute of overdue) {
      console.error(`❌ Dispute ${dispute.id} is OVERDUE!`);

      // Update priority to critical
      await pool.query(
        "UPDATE disputes SET priority = 1, updated_at = now() WHERE id = $1",
        [dispute.id]
      );

      // Send critical alert
      await publishEvent("merchant", dispute.merchant_id, "dispute.deadline.missed", {
        dispute_id: dispute.id,
        response_due_at: dispute.response_due_at,
      });

      await publishEvent("internal", "ops", "dispute.sla.breached", {
        dispute_id: dispute.id,
        assigned_to: dispute.assigned_to,
      });
    }
  } catch (error) {
    console.error("SLA monitor error:", error);
  }
}

/**
 * Start worker loop
 */
export function startSLAMonitor(): void {
  const interval = 60000; // Check every minute
  console.log(`Starting SLA monitor (interval: ${interval}ms)...`);

  setInterval(async () => {
    await checkSLADeadlines();
  }, interval);

  // Run immediately on start
  checkSLADeadlines();
}
