// ============================================================================
// Approval Worker - Auto-approve, timeout, escalation
// ============================================================================

import { pool } from "../db";
import { logger } from "../logger";
import axios from "axios";

const EVENT_BUS_URL = process.env.EVENT_BUS_URL || "http://event-bus:3000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";
const WORKER_INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || "60000", 10);

/**
 * Process auto-approved actions
 */
async function processAutoApprovals(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM approvals_action
       WHERE status = 'auto_approved' AND notified = FALSE
       LIMIT 100`
    );

    for (const approval of rows) {
      try {
        // Publish approval.completed event
        await axios.post(
          `${EVENT_BUS_URL}/api/events/publish`,
          {
            event_type: "approval.completed",
            payload: {
              approval_id: approval.id,
              action_type: approval.action_type,
              origin_module: approval.origin_module,
              origin_entity_id: approval.origin_entity_id,
              status: "auto_approved",
              sira_score: approval.sira_score,
              decided_at: approval.created_at,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          }
        );

        // Mark as notified
        await pool.query(
          `UPDATE approvals_action SET notified = TRUE WHERE id = $1`,
          [approval.id]
        );

        logger.info("Auto-approval event published", {
          approval_id: approval.id,
          action_type: approval.action_type,
        });
      } catch (error: any) {
        logger.error("Failed to publish auto-approval event", {
          approval_id: approval.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Failed to process auto-approvals", { error: error.message });
  }
}

/**
 * Process approved actions (quorum reached)
 */
async function processApprovedActions(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM approvals_action
       WHERE status = 'approved' AND notified = FALSE
       LIMIT 100`
    );

    for (const approval of rows) {
      try {
        // Publish approval.completed event
        await axios.post(
          `${EVENT_BUS_URL}/api/events/publish`,
          {
            event_type: "approval.completed",
            payload: {
              approval_id: approval.id,
              action_type: approval.action_type,
              origin_module: approval.origin_module,
              origin_entity_id: approval.origin_entity_id,
              status: "approved",
              sira_score: approval.sira_score,
              approved_count: approval.approved_count,
              required_approvals: approval.required_approvals,
              decided_at: approval.decided_at,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          }
        );

        // Mark as notified
        await pool.query(
          `UPDATE approvals_action SET notified = TRUE WHERE id = $1`,
          [approval.id]
        );

        logger.info("Approval completed event published", {
          approval_id: approval.id,
          action_type: approval.action_type,
          approved_count: approval.approved_count,
        });
      } catch (error: any) {
        logger.error("Failed to publish approval event", {
          approval_id: approval.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Failed to process approved actions", { error: error.message });
  }
}

/**
 * Process rejected actions
 */
async function processRejectedActions(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM approvals_action
       WHERE status = 'rejected' AND notified = FALSE
       LIMIT 100`
    );

    for (const approval of rows) {
      try {
        // Publish approval.rejected event
        await axios.post(
          `${EVENT_BUS_URL}/api/events/publish`,
          {
            event_type: "approval.rejected",
            payload: {
              approval_id: approval.id,
              action_type: approval.action_type,
              origin_module: approval.origin_module,
              origin_entity_id: approval.origin_entity_id,
              status: "rejected",
              sira_score: approval.sira_score,
              decided_at: approval.decided_at,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          }
        );

        // Mark as notified
        await pool.query(
          `UPDATE approvals_action SET notified = TRUE WHERE id = $1`,
          [approval.id]
        );

        logger.info("Rejection event published", {
          approval_id: approval.id,
          action_type: approval.action_type,
        });
      } catch (error: any) {
        logger.error("Failed to publish rejection event", {
          approval_id: approval.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Failed to process rejected actions", { error: error.message });
  }
}

/**
 * Process expired approvals
 */
async function processExpiredApprovals(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM approvals_action
       WHERE status = 'pending' AND expires_at < now()
       LIMIT 100`
    );

    for (const approval of rows) {
      try {
        // Mark as expired
        await pool.query(
          `UPDATE approvals_action SET status = 'expired', decided_at = now() WHERE id = $1`,
          [approval.id]
        );

        // Publish approval.expired event
        await axios.post(
          `${EVENT_BUS_URL}/api/events/publish`,
          {
            event_type: "approval.expired",
            payload: {
              approval_id: approval.id,
              action_type: approval.action_type,
              origin_module: approval.origin_module,
              origin_entity_id: approval.origin_entity_id,
              status: "expired",
              sira_score: approval.sira_score,
              approved_count: approval.approved_count,
              required_approvals: approval.required_approvals,
              expired_at: new Date().toISOString(),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${SERVICE_TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          }
        );

        logger.info("Approval expired", {
          approval_id: approval.id,
          action_type: approval.action_type,
          approved_count: approval.approved_count,
          required_approvals: approval.required_approvals,
        });
      } catch (error: any) {
        logger.error("Failed to process expired approval", {
          approval_id: approval.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error("Failed to process expired approvals", { error: error.message });
  }
}

/**
 * Worker main loop
 */
export async function runWorker(): Promise<void> {
  logger.info("Approval worker starting", { interval_ms: WORKER_INTERVAL_MS });

  setInterval(async () => {
    try {
      await processAutoApprovals();
      await processApprovedActions();
      await processRejectedActions();
      await processExpiredApprovals();
    } catch (error: any) {
      logger.error("Worker iteration failed", { error: error.message });
    }
  }, WORKER_INTERVAL_MS);

  // Run immediately on start
  await processAutoApprovals();
  await processApprovedActions();
  await processRejectedActions();
  await processExpiredApprovals();
}

// Run if executed directly
if (require.main === module) {
  runWorker().catch((error) => {
    logger.error("Worker crashed", { error: error.message });
    process.exit(1);
  });
}
