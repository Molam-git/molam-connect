/**
 * Brique 51 - Refunds & Reversals
 * Refund Job Worker - Background Processing
 */

import { pool } from "../utils/db.js";
import { connectors } from "../connectors/index.js";
import { finalizeLedgerRefund, releaseLedgerHold, reverseLedgerEntries } from "../ledger/service.js";
import { publishEvent } from "../webhooks/publisher.js";

/**
 * Process refund job
 */
export async function processRefundJob(refundId: string): Promise<void> {
  const { rows: [refund] } = await pool.query(`SELECT * FROM refunds WHERE id = $1`, [refundId]);

  if (!refund) {
    throw new Error("refund_not_found");
  }

  // Update status to processing
  await pool.query(`UPDATE refunds SET status = 'processing', updated_at = now() WHERE id = $1`, [refundId]);

  await pool.query(
    `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
     VALUES ($1, 'processing', $2, now())`,
    [refundId, {}]
  );

  try {
    // Pick connector based on origin / refund_method
    const connector = connectors.pick(refund.origin_module, refund.refund_method);

    // Attempt reversal if supported and type is reversal
    if (connector.supportsReversal && connector.reverse && refund.type === "reversal") {
      console.log(`[Worker] Attempting reversal for ${refundId}`);

      const res = await connector.reverse({
        paymentId: refund.payment_id,
        amount: Number(refund.amount),
        currency: refund.currency,
      });

      if (res.status === "reversed") {
        // Reverse ledger entries
        await reverseLedgerEntries(refund.payment_id, refund.id);

        // Update refund as succeeded
        await pool.query(
          `UPDATE refunds SET status = 'succeeded', external_ref = $1, updated_at = now() WHERE id = $2`,
          [res.ref, refundId]
        );

        await pool.query(
          `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
           VALUES ($1, 'reversed', $2, now())`,
          [refundId, res]
        );

        await publishEvent("merchant", refund.origin_module, "refund.succeeded", {
          refund_id: refundId,
          type: "reversal",
          ref: res.ref,
        });

        return;
      }

      // If reversal not supported or failed, fallthrough to refund
      console.log(`[Worker] Reversal not supported or failed, attempting refund`);
    }

    // Execute refund (actual funds movement)
    console.log(`[Worker] Executing refund for ${refundId}`);

    const res = await connector.refund({
      paymentId: refund.payment_id,
      amount: Number(refund.amount),
      currency: refund.currency,
      refundMethod: refund.refund_method,
    });

    // On success: finalize ledger, release holds
    if (res.status === "submitted" || res.status === "settled") {
      await finalizeLedgerRefund(refundId, res);
      await releaseLedgerHold({ paymentId: refund.payment_id, reason: "refund_finalized" });

      await pool.query(
        `UPDATE refunds SET status = 'succeeded', external_ref = $1, updated_at = now() WHERE id = $2`,
        [res.ref, refundId]
      );

      await pool.query(
        `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
         VALUES ($1, 'succeeded', $2, now())`,
        [refundId, res]
      );

      await publishEvent("merchant", refund.origin_module, "refund.succeeded", {
        refund_id: refundId,
        provider_ref: res.ref,
        amount: refund.amount,
        currency: refund.currency,
      });

      return;
    }

    // If pending, mark accordingly
    await pool.query(
      `UPDATE refunds SET status = 'processing', external_ref = $1, updated_at = now() WHERE id = $2`,
      [res.ref, refundId]
    );

    await pool.query(
      `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
       VALUES ($1, 'submitted', $2, now())`,
      [refundId, res]
    );

    await publishEvent("merchant", refund.origin_module, "refund.submitted", {
      refund_id: refundId,
      provider_ref: res.ref,
    });
  } catch (e: any) {
    console.error("[Worker] Refund processing failed:", e);

    await pool.query(`UPDATE refunds SET status = 'failed', updated_at = now() WHERE id = $1`, [refundId]);

    await pool.query(
      `INSERT INTO refund_events(refund_id, event_type, payload, created_at)
       VALUES ($1, 'failed', $2, now())`,
      [refundId, { error: String(e.message) }]
    );

    await publishEvent("internal", "ops", "refund.failed", {
      refund_id: refundId,
      error: e.message,
    });
  }
}
