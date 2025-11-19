// ============================================================================
// Marketplace Batch Processing Worker
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Process queued marketplace payout batches
 */
export async function processMarketplaceBatches() {
  const { rows: batches } = await pool.query(
    `SELECT * FROM marketplace_payout_batches
     WHERE status='queued'
     ORDER BY scheduled_at NULLS FIRST
     LIMIT 5`
  );

  for (const batch of batches) {
    await processBatch(batch);
  }
}

async function processBatch(batch: any) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark as processing
    await client.query(
      `UPDATE marketplace_payout_batches SET status='processing', updated_at=now() WHERE id=$1`,
      [batch.id]
    );

    // Get pending lines
    const { rows: lines } = await client.query(
      `SELECT * FROM marketplace_payout_lines WHERE batch_id=$1 AND status='pending'`,
      [batch.id]
    );

    for (const line of lines) {
      await processLine(client, batch, line);
    }

    // Check if batch complete
    const { rows: [pending] } = await client.query(
      `SELECT count(*)::int as c FROM marketplace_payout_lines
       WHERE batch_id=$1 AND status IN ('pending','sent')`,
      [batch.id]
    );

    if (Number(pending.c) === 0) {
      await client.query(
        `UPDATE marketplace_payout_batches SET status='completed', updated_at=now() WHERE id=$1`,
        [batch.id]
      );
      publishEvent(batch.marketplace_id, "payout_batch.completed", { batch_id: batch.id });
    }

    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error(`[Batch Processor] Batch ${batch.id} failed:`, e.message);

    await pool.query(
      `UPDATE marketplace_payout_batches SET status='failed', updated_at=now() WHERE id=$1`,
      [batch.id]
    );
  } finally {
    client.release();
  }
}

async function processLine(client: any, batch: any, line: any) {
  // Check seller KYC
  const { rows: [seller] } = await client.query(
    `SELECT * FROM sellers WHERE id=$1`,
    [line.seller_id]
  );

  if (!seller || seller.kyc_level !== "verified") {
    await client.query(
      `UPDATE marketplace_payout_lines
       SET status='skipped', metadata = jsonb_set(metadata, '{reason}', '"kyc_pending"')
       WHERE id=$1`,
      [line.id]
    );
    console.log(`[Batch Processor] Line ${line.id} skipped - KYC pending`);
    return;
  }

  // Get seller treasury account
  const { rows: [treasuryAccount] } = await client.query(
    `SELECT * FROM treasury_accounts WHERE id=$1`,
    [seller.treasury_account_id]
  );

  if (!treasuryAccount) {
    await client.query(
      `UPDATE marketplace_payout_lines
       SET status='failed', metadata = jsonb_set(metadata, '{reason}', '"no_treasury_account"')
       WHERE id=$1`,
      [line.id]
    );
    console.log(`[Batch Processor] Line ${line.id} failed - No treasury account`);
    return;
  }

  // Get bank profile
  const { rows: [bank] } = await client.query(
    `SELECT * FROM bank_profiles WHERE id=$1`,
    [treasuryAccount.bank_profile_id]
  );

  if (!bank) {
    await client.query(
      `UPDATE marketplace_payout_lines
       SET status='failed', metadata = jsonb_set(metadata, '{reason}', '"no_bank_profile"')
       WHERE id=$1`,
      [line.id]
    );
    return;
  }

  // Create settlement instruction
  const instrAmount = Number(line.net_amount);
  const { rows: [instr] } = await client.query(
    `INSERT INTO settlement_instructions(payout_id, bank_profile_id, amount, currency, rail, status)
     VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
    [line.id, bank.id, instrAmount, line.currency, bank.rail || "local"]
  );

  // Link instruction to line
  await client.query(
    `UPDATE marketplace_payout_lines
     SET settlement_instruction_id=$2, status='sent', updated_at=now()
     WHERE id=$1`,
    [line.id, instr.id]
  );

  // Create ledger entries (double-entry)
  await createLedgerEntries(client, line, instrAmount);

  console.log(`[Batch Processor] Line ${line.id} sent - ${instrAmount} ${line.currency}`);

  publishEvent(batch.marketplace_id, "payout_line.sent", {
    line_id: line.id,
    seller_id: line.seller_id,
    amount: instrAmount
  });
}

async function createLedgerEntries(client: any, line: any, amount: number) {
  const ledgerId = crypto.randomUUID();

  // Debit marketplace liability
  await client.query(
    `INSERT INTO ledger_entries(id, ref, entry_type, currency, amount, created_at)
     VALUES ($1,$2,'debit',$3,$4,now())`,
    [crypto.randomUUID(), ledgerId, line.currency, amount]
  );

  // Credit bank settlement pending
  await client.query(
    `INSERT INTO ledger_entries(id, ref, entry_type, currency, amount, created_at)
     VALUES ($1,$2,'credit',$3,$4,now())`,
    [crypto.randomUUID(), ledgerId, line.currency, amount]
  );
}

async function publishEvent(marketplaceId: string, event: string, data: any) {
  console.log(`[Webhook] marketplace=${marketplaceId} event=${event}`, data);
}

/**
 * Start worker loop
 */
export async function startBatchProcessor() {
  console.log("[Marketplace Batch Processor] Starting...");

  setInterval(async () => {
    try {
      await processMarketplaceBatches();
    } catch (e: any) {
      console.error("[Batch Processor] Error:", e.message);
    }
  }, 10000); // Every 10 seconds
}

// Start if run directly
if (require.main === module) {
  startBatchProcessor().catch(console.error);
}
