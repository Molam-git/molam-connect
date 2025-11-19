// ============================================================================
// Settlement Engine - Atomic Processing
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Process a single settlement instruction atomically
 */
export async function processInstruction(instrId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock instruction for update
    const { rows: [instr] } = await client.query(
      `SELECT * FROM settlement_instructions WHERE id=$1 FOR UPDATE`,
      [instrId]
    );

    if (!instr) {
      throw new Error("instruction_not_found");
    }

    // Skip if already processed
    if (instr.status === 'confirmed' || instr.status === 'rerouted') {
      await client.query("ROLLBACK");
      return instr;
    }

    // Check retry limit
    if (instr.retries >= instr.max_retries) {
      await client.query(
        `UPDATE settlement_instructions SET status='failed', failure_reason='max_retries_exceeded' WHERE id=$1`,
        [instrId]
      );
      await client.query("COMMIT");
      throw new Error("max_retries_exceeded");
    }

    // Mark as sent
    await client.query(
      `UPDATE settlement_instructions SET status='sent', sent_at=now(), retries=retries+1 WHERE id=$1`,
      [instrId]
    );

    // Log action
    await client.query(
      `INSERT INTO settlement_logs(instruction_id, action, payload) VALUES ($1,'sending',$2)`,
      [instrId, JSON.stringify({ attempt: instr.retries + 1 })]
    );

    await client.query("COMMIT");

    // Send to bank (outside transaction)
    try {
      const response = await sendToBank(instr);

      // Update based on response
      await client.query("BEGIN");

      if (response.success) {
        await client.query(
          `UPDATE settlement_instructions SET status='confirmed', confirmed_at=now(), bank_ref=$2 WHERE id=$1`,
          [instrId, response.bank_ref]
        );

        // Log confirmation
        await client.query(
          `INSERT INTO settlement_logs(instruction_id, action, payload) VALUES ($1,'confirmed',$2)`,
          [instrId, JSON.stringify(response)]
        );

        // Update ledger (double-entry)
        await updateLedger(client, instr, 'confirmed');

        // Publish event
        publishEvent("settlement", instrId, "settlement.confirmed", { instr, response });

        console.log(`[Settlement] Instruction ${instrId} confirmed - ${response.bank_ref}`);
      } else {
        throw new Error(response.error || 'bank_error');
      }

      await client.query("COMMIT");
      return await pool.query(`SELECT * FROM settlement_instructions WHERE id=$1`, [instrId]).then(r => r.rows[0]);
    } catch (e: any) {
      await client.query("ROLLBACK");
      await client.query("BEGIN");

      // Mark as failed
      await client.query(
        `UPDATE settlement_instructions SET status='failed', failure_reason=$2 WHERE id=$1`,
        [instrId, e.message]
      );

      // Log failure
      await client.query(
        `INSERT INTO settlement_logs(instruction_id, action, payload) VALUES ($1,'failed',$2)`,
        [instrId, JSON.stringify({ error: e.message, attempt: instr.retries + 1 })]
      );

      await client.query("COMMIT");

      // Publish failure event
      publishEvent("settlement", instrId, "settlement.failed", { instr, error: e.message });

      console.error(`[Settlement] Instruction ${instrId} failed:`, e.message);
      throw e;
    }
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Send instruction to bank via connector
 */
async function sendToBank(instr: any): Promise<any> {
  // TODO: Integrate with Bank Connector (Brique 121)
  // Simulate bank API call
  const success = Math.random() > 0.1; // 90% success rate

  if (success) {
    return {
      success: true,
      bank_ref: `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      settled_at: new Date().toISOString()
    };
  } else {
    return {
      success: false,
      error: "bank_unavailable"
    };
  }
}

/**
 * Update ledger with double-entry
 */
async function updateLedger(client: any, instr: any, status: string) {
  if (status !== 'confirmed') return;

  const ledgerId = crypto.randomUUID();

  // Debit: bank_settlement_pending
  await client.query(
    `INSERT INTO ledger_entries(id, ref, entry_type, currency, amount, created_at)
     VALUES ($1,$2,'debit',$3,$4,now())`,
    [crypto.randomUUID(), ledgerId, instr.currency, instr.amount]
  );

  // Credit: bank_cash
  await client.query(
    `INSERT INTO ledger_entries(id, ref, entry_type, currency, amount, created_at)
     VALUES ($1,$2,'credit',$3,$4,now())`,
    [crypto.randomUUID(), ledgerId, instr.currency, instr.amount]
  );
}

/**
 * Publish event (async)
 */
function publishEvent(entity: string, id: string, event: string, data: any) {
  console.log(`[Webhook] ${entity}:${id} event=${event}`, data);
}

/**
 * Create settlement instruction with idempotency
 */
export async function createInstruction(params: {
  payoutId?: string;
  bankProfileId: string;
  amount: number;
  currency: string;
  rail: string;
  idempotencyKey?: string;
  batchId?: string;
}) {
  const { payoutId, bankProfileId, amount, currency, rail, idempotencyKey, batchId } = params;

  // Idempotency check
  if (idempotencyKey) {
    const { rows } = await pool.query(
      `SELECT * FROM settlement_instructions WHERE idempotency_key=$1`,
      [idempotencyKey]
    );
    if (rows.length) return rows[0];
  }

  const { rows: [instr] } = await pool.query(
    `INSERT INTO settlement_instructions(
      payout_id, bank_profile_id, amount, currency, rail, idempotency_key, batch_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [payoutId || null, bankProfileId, amount, currency, rail, idempotencyKey || null, batchId || null]
  );

  return instr;
}
