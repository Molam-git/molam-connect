// ============================================================================
// Marketplace Batch Creation Service
// ============================================================================

import { Pool } from "pg";
import { computeSplit } from "./split-engine";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface BatchParams {
  marketplaceId: string;
  initiatedBy: string;
  currency: string;
  scheduleType?: "immediate" | "daily" | "weekly";
  externalRequestId?: string;
}

/**
 * Create marketplace payout batch with revenue splitting
 * Idempotent via externalRequestId
 */
export async function createMarketplacePayoutBatch(params: BatchParams) {
  const {
    marketplaceId,
    initiatedBy,
    currency,
    scheduleType = "immediate",
    externalRequestId
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency check
    if (externalRequestId) {
      const { rows: [exists] } = await client.query(
        `SELECT * FROM marketplace_payout_batches WHERE batch_reference=$1`,
        [externalRequestId]
      );
      if (exists) return exists;
    }

    // Fetch eligible seller balances
    const { rows: sellers } = await client.query(
      `SELECT seller_id, available_to_payout as due
       FROM marketplace_seller_balances
       WHERE marketplace_id=$1 AND currency=$2 AND available_to_payout > 0`,
      [marketplaceId, currency]
    );

    if (sellers.length === 0) {
      throw new Error("no_due_payouts");
    }

    // Create batch
    const batchRef = externalRequestId || `MB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { rows: [batch] } = await client.query(
      `INSERT INTO marketplace_payout_batches(marketplace_id, initiated_by, batch_reference, currency, status, schedule_type, scheduled_at)
       VALUES ($1,$2,$3,$4,'draft',$5,now()) RETURNING *`,
      [marketplaceId, initiatedBy, batchRef, currency, scheduleType]
    );

    let totalGross = 0;

    // Process each seller
    for (const seller of sellers) {
      const sellerDue = Number(seller.due);
      if (sellerDue <= 0) continue;

      // Check minimum threshold
      const { rows: [sellerInfo] } = await client.query(
        `SELECT min_payout_threshold FROM sellers WHERE id=$1`,
        [seller.seller_id]
      );
      if (sellerInfo && sellerDue < Number(sellerInfo.min_payout_threshold)) {
        continue; // Carry forward
      }

      // Compute split
      const split = await computeSplit(marketplaceId, sellerDue, currency);
      const netAmount = Number(split.sellerAmount);

      totalGross += sellerDue;

      // Create payout line
      await client.query(
        `INSERT INTO marketplace_payout_lines(
          batch_id, seller_id, gross_amount, seller_amount,
          marketplace_fee, molam_fee, net_amount, currency, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [
          batch.id,
          seller.seller_id,
          sellerDue,
          split.sellerAmount,
          split.marketplaceFee,
          split.molamFee,
          netAmount,
          currency
        ]
      );

      // Deduct from seller balance
      await client.query(
        `UPDATE marketplace_seller_balances
         SET available_to_payout = available_to_payout - $1, updated_at = now()
         WHERE marketplace_id=$2 AND seller_id=$3 AND currency=$4`,
        [sellerDue, marketplaceId, seller.seller_id, currency]
      );
    }

    // Update batch total
    await client.query(
      `UPDATE marketplace_payout_batches SET total_amount=$2, updated_at=now() WHERE id=$1`,
      [batch.id, totalGross]
    );

    // Create audit snapshot
    const { rows: snapshot } = await client.query(
      `SELECT * FROM marketplace_payout_lines WHERE batch_id=$1`,
      [batch.id]
    );
    await client.query(
      `INSERT INTO marketplace_payout_audit(batch_id, snapshot) VALUES ($1,$2)`,
      [batch.id, JSON.stringify(snapshot)]
    );

    // Queue if immediate
    if (scheduleType === "immediate") {
      await client.query(
        `UPDATE marketplace_payout_batches SET status='queued' WHERE id=$1`,
        [batch.id]
      );
    }

    await client.query("COMMIT");

    // Publish webhook event
    publishEvent(marketplaceId, "payout_batch.queued", {
      batch_id: batch.id,
      total_amount: totalGross,
      lines: snapshot.length
    }).catch(console.error);

    return batch;
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function publishEvent(marketplaceId: string, event: string, data: any) {
  console.log(`[Webhook] marketplace=${marketplaceId} event=${event}`, data);
}
