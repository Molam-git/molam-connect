// ============================================================================
// Expiry Worker - TTL Enforcement
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";
import axios from "axios";

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || "";

export async function expireOldRequests(): Promise<void> {
  logger.info("Running expiry worker...");

  try {
    // Find expired requests
    const { rows: expiredRequests } = await pool.query(
      `SELECT id, ops_log_id, created_by, payload
       FROM approval_requests
       WHERE status IN ('pending', 'partially_approved')
       AND expires_at <= now()`
    );

    logger.info(`Found ${expiredRequests.length} expired requests`);

    for (const request of expiredRequests) {
      try {
        // Update status to expired
        await pool.query(
          `UPDATE approval_requests SET status = 'expired' WHERE id = $1`,
          [request.id]
        );

        // Audit log
        await pool.query(
          `INSERT INTO approval_audit(request_id, action, details)
           VALUES($1, 'expire', $2)`,
          [request.id, JSON.stringify({ expired_at: new Date().toISOString() })]
        );

        // Update linked ops log to rejected/expired
        await pool.query(
          `UPDATE ops_actions_log SET status = 'rejected' WHERE id = $1`,
          [request.ops_log_id]
        );

        logger.info("Approval request expired", {
          request_id: request.id,
          ops_log_id: request.ops_log_id,
        });

        // Notify ops managers via event bus
        if (EVENT_BUS_URL) {
          try {
            await axios.post(
              `${EVENT_BUS_URL}/events`,
              {
                type: "approval.request.expired",
                data: {
                  request_id: request.id,
                  ops_log_id: request.ops_log_id,
                  created_by: request.created_by,
                },
              },
              { timeout: 2000 }
            );
          } catch (err) {
            logger.warn("Event publish failed (non-blocking)", {
              error: (err as Error).message,
            });
          }
        }
      } catch (error: any) {
        logger.error("Failed to expire request", {
          request_id: request.id,
          error: error.message,
        });
      }
    }

    logger.info(`Expiry worker completed, expired ${expiredRequests.length} requests`);
  } catch (error: any) {
    logger.error("Expiry worker failed", { error: error.message });
  }
}

// Run if executed directly
if (require.main === module) {
  expireOldRequests()
    .then(() => {
      logger.info("Expiry worker finished successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Expiry worker crashed", { error: error.message });
      process.exit(1);
    });
}
