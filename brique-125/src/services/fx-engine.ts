// ============================================================================
// Brique 125 — FX Engine Service
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getBestQuote(from: string, to: string, amount: number) {
  const { rows } = await pool.query(
    `SELECT * FROM fx_quotes WHERE from_currency=$1 AND to_currency=$2 AND valid_until > now() ORDER BY cost ASC LIMIT 5`,
    [from, to]
  );
  if (rows.length === 0) throw new Error("No FX quotes available");
  // SIRA recommendation (simplified)
  let best = rows[0];
  let bestScore = Number(rows[0].cost) + (Number(rows[0].spread) || 0);
  for (const q of rows) {
    const score = Number(q.cost) + (Number(q.spread) || 0);
    if (score < bestScore) { best = q; bestScore = score; }
  }
  return { ...best, recommended_by: "SIRA" };
}

export async function executeFX(quoteId: string, amount: number, userId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [quote] } = await client.query(`SELECT * FROM fx_quotes WHERE id=$1 FOR UPDATE`, [quoteId]);
    if (!quote) throw new Error("Quote not found");
    const amtTo = amount * Number(quote.rate) - Number(quote.cost || 0);
    const ledgerTxn = await recordFXLedger(client, quote.from_currency, quote.to_currency, amount, amtTo, quote.provider);
    const { rows: [exec] } = await client.query(
      `INSERT INTO fx_executions(quote_id,amount_from,amount_to,executed_by,status,provider,ledger_txn_id)
       VALUES($1,$2,$3,$4,'executed',$5,$6) RETURNING *`,
      [quoteId, amount, amtTo, userId, quote.provider, ledgerTxn]
    );
    await client.query("COMMIT");
    return exec;
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function recordFXLedger(client: any, fromCur: string, toCur: string, amtFrom: number, amtTo: number, provider: string) {
  const ledgerId = crypto.randomUUID();
  await client.query(`INSERT INTO ledger_entries(id,ref,entry_type,currency,amount,provider,created_at)
                      VALUES($1,$2,'debit',$3,$4,$5,now())`,
    [crypto.randomUUID(), ledgerId, fromCur, amtFrom, provider]);
  await client.query(`INSERT INTO ledger_entries(id,ref,entry_type,currency,amount,provider,created_at)
                      VALUES($1,$2,'credit',$3,$4,$5,now())`,
    [crypto.randomUUID(), ledgerId, toCur, amtTo, provider]);
  return ledgerId;
}
