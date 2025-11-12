/**
 * Brique 42 - Connect Payments
 * Event outbox system for real-time notifications
 */

import { pool } from "../db";

/**
 * Emit an event to the outbox
 * Events will be dispatched by the webhook delivery worker
 */
export async function emitEvent(
  connect_account_id: string | null,
  type: string,
  data: any
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO connect_events_outbox (connect_account_id, type, data)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [connect_account_id, type, data]
  );

  console.log(`[Events] Emitted: ${type}`, {
    account: connect_account_id,
    event_id: rows[0].id,
  });

  return rows[0].id as string;
}

/**
 * Get recent events for debugging/monitoring
 */
export async function getRecentEvents(limit: number = 100): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM connect_events_outbox
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows;
}

/**
 * Mark event as delivered
 */
export async function markEventDelivered(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE connect_events_outbox
     SET delivered_at = now()
     WHERE id = $1 AND delivered_at IS NULL`,
    [eventId]
  );
}

/**
 * Event types catalog
 */
export const EventTypes = {
  // Payment Intents
  INTENT_CREATED: "payment.intent.created",
  INTENT_CONFIRMED: "payment.intent.confirmed",
  INTENT_CANCELED: "payment.intent.canceled",
  INTENT_SUCCEEDED: "payment.intent.succeeded",
  INTENT_FAILED: "payment.intent.failed",

  // Charges
  CHARGE_AUTHORIZED: "payment.charge.authorized",
  CHARGE_CAPTURED: "payment.charge.captured",
  CHARGE_FAILED: "payment.charge.failed",
  CHARGE_CANCELED: "payment.charge.canceled",

  // Refunds
  REFUND_CREATED: "payment.refund.created",
  REFUND_SUCCEEDED: "payment.refund.succeeded",
  REFUND_FAILED: "payment.refund.failed",

  // Payouts
  PAYOUT_CREATED: "payout.created",
  PAYOUT_SENT: "payout.sent",
  PAYOUT_SETTLED: "payout.settled",
  PAYOUT_FAILED: "payout.failed",

  // Risk & Fraud
  FRAUD_ALERT: "fraud.alert",
  RISK_HIGH: "risk.high",
} as const;
