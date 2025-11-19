// ============================================================================
// Brique 126 — Settlement Worker
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Process pending payouts and send to bank
 */
export async function processPayouts() {
  const { rows: batch } = await pool.query(
    `SELECT * FROM payouts WHERE status='pending' ORDER BY
     CASE method
       WHEN 'instant' THEN 1
       WHEN 'priority' THEN 2
       WHEN 'batch' THEN 3
     END, requested_at ASC LIMIT 50`
  );

  for (const payout of batch) {
    await processPayout(payout);
  }
}

async function processPayout(payout: any) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark as processing
    await client.query(
      `UPDATE payouts SET status='processing' WHERE id=$1`,
      [payout.id]
    );

    // Get destination treasury account
    const { rows: [dest] } = await client.query(
      `SELECT * FROM treasury_accounts WHERE id=$1`,
      [payout.destination_id]
    );

    // Get bank profile
    const { rows: [bank] } = await client.query(
      `SELECT * FROM bank_profiles WHERE id=$1`,
      [dest.bank_profile_id]
    );

    // Send to bank (via Bank Connector - Brique 121)
    const bankRef = await sendToBank(bank, payout.amount, payout.currency, dest);

    // Create settlement instruction
    await client.query(
      `INSERT INTO settlement_instructions(payout_id, bank_profile_id, amount, currency, rail, status, bank_ref)
       VALUES ($1,$2,$3,$4,$5,'sent',$6)`,
      [payout.id, bank.id, payout.amount, payout.currency, bank.rail || 'SWIFT', bankRef]
    );

    // Update payout status
    await client.query(
      `UPDATE payouts SET status='sent', processed_at=now() WHERE id=$1`,
      [payout.id]
    );

    // Record SLA
    const delay = new Date().getTime() - new Date(payout.requested_at).getTime();
    await client.query(
      `INSERT INTO settlement_sla(bank_profile_id, rail, expected_delay, actual_delay, payout_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [bank.id, bank.rail || 'SWIFT', '1 hour', `${delay} milliseconds`, payout.id]
    );

    await client.query("COMMIT");

    // Publish webhook
    publishEvent(payout.merchant_id, "payout.sent", {
      payout_id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      bank_ref: bankRef
    }).catch(console.error);

    console.log(`[Settlement] Payout ${payout.id} sent to bank ${bank.name}`);
  } catch (e: any) {
    await client.query("ROLLBACK");

    // Mark as failed
    await pool.query(
      `UPDATE payouts SET status='failed', failure_reason=$2 WHERE id=$1`,
      [payout.id, e.message]
    );

    // Refund merchant balance
    await pool.query(
      `UPDATE merchant_balances SET available_balance = available_balance + $1
       WHERE merchant_id=$2 AND currency=$3`,
      [payout.amount, payout.merchant_id, payout.currency]
    );

    publishEvent(payout.merchant_id, "payout.failed", {
      payout_id: payout.id,
      reason: e.message
    }).catch(console.error);

    console.error(`[Settlement] Payout ${payout.id} failed:`, e.message);
  } finally {
    client.release();
  }
}

/**
 * Send payout to bank via connector (stub - integrate with Brique 121)
 */
async function sendToBank(bank: any, amount: number, currency: string, destination: any): Promise<string> {
  // TODO: Integrate with Bank Connector (Brique 121)
  // Simulate bank API call
  const bankRef = `BANK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`[Bank API] Sending ${amount} ${currency} to ${destination.account_number} via ${bank.name}`);
  return bankRef;
}

async function publishEvent(merchantId: string, event: string, data: any) {
  console.log(`[Webhook] merchant=${merchantId} event=${event}`, data);
}

/**
 * Run worker loop
 */
export async function startSettlementWorker() {
  console.log("[Settlement Worker] Starting...");

  setInterval(async () => {
    try {
      await processPayouts();
    } catch (e: any) {
      console.error("[Settlement Worker] Error:", e.message);
    }
  }, 5000); // Every 5 seconds
}

// Start if run directly
if (require.main === module) {
  startSettlementWorker().catch(console.error);
}
