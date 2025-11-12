/**
 * Action Worker - Execute fraud prevention actions
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../utils/webhooks.js";
import fetch from "node-fetch";

const BATCH_SIZE = parseInt(process.env.ACTION_BATCH_SIZE || "20");
const TREASURY_URL = process.env.TREASURY_URL || "http://localhost:8034";
const DISPUTES_URL = process.env.DISPUTES_URL || "http://localhost:8055";
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_URL || "http://localhost:8047";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";
const SYSTEM_USER_ID = "system";

/**
 * Process pending actions
 */
export async function processActions(): Promise<void> {
  try {
    // Fetch pending actions (with row lock)
    const { rows: actions } = await pool.query(
      `SELECT * FROM radar_actions
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    if (actions.length === 0) {
      return; // No work to do
    }

    console.log(`Processing ${actions.length} actions...`);

    for (const action of actions) {
      try {
        // Mark as executing
        await pool.query(
          `UPDATE radar_actions SET status = 'executing', updated_at = now() WHERE id = $1`,
          [action.id]
        );

        let result: any = {};

        // Execute action based on type
        switch (action.action_type) {
          case "challenge":
            result = await executeChallenge(action);
            break;
          case "hold_payout":
            result = await executeHoldPayout(action);
            break;
          case "block":
            result = await executeBlock(action);
            break;
          case "notify":
            result = await executeNotify(action);
            break;
          case "auto_refute":
            result = await executeAutoRefute(action);
            break;
          case "auto_accept":
            result = await executeAutoAccept(action);
            break;
          default:
            console.warn(`Unknown action type: ${action.action_type}`);
            result = { status: "skipped", reason: "unknown_action_type" };
        }

        // Mark as done
        await pool.query(
          `UPDATE radar_actions
           SET status = 'done', result = $1, executed_by = $2, updated_at = now()
           WHERE id = $3`,
          [result, SYSTEM_USER_ID, action.id]
        );

        console.log(`Action ${action.id} (${action.action_type}) completed`);

        // Publish completion event
        await publishEvent("internal", "radar", "radar.action.completed", {
          action_id: action.id,
          action_type: action.action_type,
          result,
        });
      } catch (error: any) {
        console.error(`Failed to execute action ${action.id}:`, error);

        // Mark as failed
        await pool.query(
          `UPDATE radar_actions
           SET status = 'failed', result = $1, updated_at = now()
           WHERE id = $2`,
          [{ error: error.message }, action.id]
        );

        // Publish failure event
        await publishEvent("internal", "radar", "radar.action.failed", {
          action_id: action.id,
          action_type: action.action_type,
          error: error.message,
        });
      }
    }
  } catch (error) {
    console.error("Action worker error:", error);
  }
}

/**
 * Execute challenge action (OTP, 3DS, etc.)
 */
async function executeChallenge(action: any): Promise<any> {
  const method = action.params?.method || "otp"; // otp, 3ds, captcha

  if (method === "otp") {
    // Send OTP via notifications service
    const response = await fetch(`${NOTIFICATIONS_URL}/api/otp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        payment_id: action.payment_id,
        method: "sms", // or email
        message: "Verify your payment with this code",
      }),
      signal: AbortSignal.timeout(5000),
    });

    const data = (await response.json()) as any;
    return { otp_ref: data.ref, status: "sent" };
  } else if (method === "3ds") {
    // Trigger 3DS flow (would integrate with payment processor)
    return { status: "3ds_initiated", redirect_url: `https://3ds.example.com/verify?ref=${action.payment_id}` };
  }

  return { status: "challenge_sent", method };
}

/**
 * Execute hold payout action
 */
async function executeHoldPayout(action: any): Promise<any> {
  const response = await fetch(`${TREASURY_URL}/api/payouts/hold`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      payment_id: action.payment_id,
      merchant_id: action.params?.merchant_id,
      reason: action.params?.reason || "fraud_prevention",
      hold_duration_hours: action.params?.hold_duration_hours || 24,
    }),
    signal: AbortSignal.timeout(5000),
  });

  const data = (await response.json()) as any;
  return { hold_id: data.id, status: "held" };
}

/**
 * Execute block action
 */
async function executeBlock(action: any): Promise<any> {
  // Mark payment as blocked in signals
  await pool.query(
    `UPDATE payment_signals
     SET labels = jsonb_set(COALESCE(labels, '{}'), '{blocked}', 'true'::jsonb)
     WHERE payment_id = $1`,
    [action.payment_id]
  );

  // Optionally block merchant temporarily
  if (action.params?.block_merchant) {
    // Call treasury to freeze merchant account
    await fetch(`${TREASURY_URL}/api/merchants/${action.params.merchant_id}/freeze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        reason: "fraud_prevention",
        duration_hours: action.params?.freeze_duration_hours || 48,
      }),
    });
  }

  return { status: "blocked", payment_id: action.payment_id };
}

/**
 * Execute notify action
 */
async function executeNotify(action: any): Promise<any> {
  // Send notification to ops/merchant
  await publishEvent(
    action.params?.target === "merchant" ? "merchant" : "internal",
    action.params?.target_id || "ops",
    "radar.alert",
    {
      payment_id: action.payment_id,
      alert_type: action.params?.alert_type || "suspicious_activity",
      message: action.params?.message || "Suspicious activity detected",
      severity: action.params?.severity || "medium",
    }
  );

  return { status: "notified" };
}

/**
 * Execute auto-refute (create dispute response automatically)
 */
async function executeAutoRefute(action: any): Promise<any> {
  // Call disputes API to auto-respond to dispute
  const response = await fetch(`${DISPUTES_URL}/api/disputes/${action.params?.dispute_id}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      evidence_template_id: action.params?.template_id,
      message: "Automated refute based on fraud analysis",
      auto_generated: true,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = (await response.json()) as any;
  return { status: "refuted", dispute_response_id: data.id };
}

/**
 * Execute auto-accept (accept dispute/refund automatically)
 */
async function executeAutoAccept(action: any): Promise<any> {
  // Call disputes API to accept dispute
  const response = await fetch(`${DISPUTES_URL}/api/disputes/${action.params?.dispute_id}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      outcome: "merchant_lost",
      details: { reason: "auto_accepted_low_risk", auto_generated: true },
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = (await response.json()) as any;
  return { status: "accepted", resolution: data };
}

/**
 * Start worker loop
 */
export function startActionWorker(): void {
  const interval = parseInt(process.env.WORKER_INTERVAL_MS || "10000");
  console.log(`Starting action worker (interval: ${interval}ms)...`);

  setInterval(async () => {
    await processActions();
  }, interval);

  // Run immediately on start
  processActions();
}
