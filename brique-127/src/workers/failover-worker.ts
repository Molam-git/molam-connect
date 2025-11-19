// ============================================================================
// Failover Worker - Automatic Rerouting for Stuck Payouts
// ============================================================================

import { Pool } from "pg";
import { selectBankForPayout } from "../services/routing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TIMEOUT_MINUTES = 30;

/**
 * Find stuck payouts and attempt failover
 */
export async function runFailoverSweep() {
  const { rows: stuck } = await pool.query(
    `SELECT p.* FROM payouts p
     LEFT JOIN payout_confirmations pc ON pc.payout_id = p.id
     WHERE p.status = 'sent'
     AND p.processed_at <= now() - interval '${TIMEOUT_MINUTES} minutes'
     AND pc.id IS NULL
     LIMIT 50`
  );

  console.log(`[Failover] Found ${stuck.length} stuck payouts`);

  for (const payout of stuck) {
    await attemptFailover(payout);
  }
}

async function attemptFailover(payout: any) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get last routing decision
    const { rows: [lastDecision] } = await client.query(
      `SELECT * FROM bank_routing_decisions
       WHERE payout_id=$1
       ORDER BY created_at DESC LIMIT 1`,
      [payout.id]
    );

    if (!lastDecision) {
      console.warn(`[Failover] No routing decision for payout ${payout.id}`);
      await client.query("ROLLBACK");
      return;
    }

    const lastBankId = lastDecision.chosen_bank_profile_id;

    // Check if circuit breaker is open for last bank
    const { rows: [cb] } = await client.query(
      `SELECT * FROM bank_circuit_breakers WHERE bank_profile_id=$1`,
      [lastBankId]
    );

    if (!cb || cb.state !== 'open') {
      console.log(`[Failover] Circuit not open for bank ${lastBankId}, skipping ${payout.id}`);
      await client.query("ROLLBACK");
      return;
    }

    // Select new bank route
    const newDecision = await selectBankForPayout({
      payoutId: payout.id,
      originModule: payout.origin_module || 'payouts',
      amount: Number(payout.amount),
      currency: payout.currency,
      country: payout.country || 'US',
      idempotencyKey: `failover:${payout.id}:${Date.now()}`
    });

    // Create new settlement instruction
    await client.query(
      `INSERT INTO settlement_instructions(
        payout_id, bank_profile_id, amount, currency, rail, status
      ) VALUES ($1,$2,$3,$4,'local','pending')`,
      [payout.id, newDecision.chosen_bank_profile_id, payout.amount, payout.currency]
    );

    // Mark payout as rerouted
    await client.query(
      `UPDATE payouts SET status='rerouted', updated_at=now() WHERE id=$1`,
      [payout.id]
    );

    await client.query("COMMIT");

    console.log(`[Failover] Payout ${payout.id} rerouted from ${lastBankId} to ${newDecision.chosen_bank_profile_id}`);

    // Publish event
    publishEvent("payout", payout.id, "payout.rerouted", {
      old_bank: lastBankId,
      new_bank: newDecision.chosen_bank_profile_id
    });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(`[Failover] Error processing payout ${payout.id}:`, e.message);
  } finally {
    client.release();
  }
}

async function publishEvent(entity: string, id: string, event: string, data: any) {
  console.log(`[Webhook] ${entity}:${id} event=${event}`, data);
}

/**
 * Start failover worker loop
 */
export async function startFailoverWorker() {
  console.log("[Failover Worker] Starting...");

  setInterval(async () => {
    try {
      await runFailoverSweep();
    } catch (e: any) {
      console.error("[Failover Worker] Error:", e.message);
    }
  }, 60000); // Every minute
}

// Start if run directly
if (require.main === module) {
  startFailoverWorker().catch(console.error);
}
