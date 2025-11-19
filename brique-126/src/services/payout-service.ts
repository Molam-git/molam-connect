// ============================================================================
// Brique 126 — Payout Service
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface PayoutRequest {
  merchantId: string;
  amount: number;
  currency: string;
  method: "instant" | "batch" | "priority";
  destinationId: string;
  metadata?: Record<string, any>;
}

/**
 * Request a new payout
 */
export async function requestPayout(req: PayoutRequest) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate destination
    const { rows: [dest] } = await client.query(
      `SELECT * FROM treasury_accounts WHERE id=$1`,
      [req.destinationId]
    );
    if (!dest) throw new Error("destination_not_found");

    // Check available balance
    const { rows: [bal] } = await client.query(
      `SELECT available_balance FROM merchant_balances WHERE merchant_id=$1 AND currency=$2`,
      [req.merchantId, req.currency]
    );
    if (!bal || Number(bal.available_balance) < req.amount) {
      throw new Error("insufficient_funds");
    }

    // Debit merchant balance
    await client.query(
      `UPDATE merchant_balances SET available_balance = available_balance - $1
       WHERE merchant_id=$2 AND currency=$3`,
      [req.amount, req.merchantId, req.currency]
    );

    // Create payout record
    const reference = `PO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const { rows: [payout] } = await client.query(
      `INSERT INTO payouts(merchant_id, amount, currency, method, destination_id, reference, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.merchantId, req.amount, req.currency, req.method, req.destinationId, reference, JSON.stringify(req.metadata || {})]
    );

    // Record ledger entry (double-entry)
    const ledgerId = crypto.randomUUID();
    await client.query(
      `INSERT INTO ledger_entries(id, ref, entry_type, currency, amount, merchant_id, created_at)
       VALUES ($1,$2,'debit',$3,$4,$5,now())`,
      [crypto.randomUUID(), ledgerId, req.currency, req.amount, req.merchantId]
    );

    await client.query("COMMIT");

    // Publish webhook event (async)
    publishEvent(req.merchantId, "payout.created", {
      payout_id: payout.id,
      amount: req.amount,
      currency: req.currency,
      reference
    }).catch(console.error);

    return payout;
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Get payout by ID
 */
export async function getPayout(payoutId: string) {
  const { rows: [payout] } = await pool.query(
    `SELECT * FROM payouts WHERE id=$1`,
    [payoutId]
  );
  return payout;
}

/**
 * List merchant payouts
 */
export async function listPayouts(merchantId: string, limit = 100) {
  const { rows } = await pool.query(
    `SELECT * FROM payouts WHERE merchant_id=$1 ORDER BY requested_at DESC LIMIT $2`,
    [merchantId, limit]
  );
  return rows;
}

/**
 * Publish webhook event (stub - integrate with webhook engine)
 */
async function publishEvent(merchantId: string, event: string, data: any) {
  // TODO: Integrate with Brique webhook engine
  console.log(`[Webhook] merchant=${merchantId} event=${event}`, data);
}
