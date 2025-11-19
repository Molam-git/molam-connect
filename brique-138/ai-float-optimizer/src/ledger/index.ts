import { pool } from "../db";

type LedgerHoldParams = {
  origin: string;
  account: string;
  amount: number;
  currency: string;
  ref: string;
};

export async function createLedgerHold(params: LedgerHoldParams) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_holds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      origin TEXT,
      account TEXT,
      amount NUMERIC(18,2),
      currency TEXT,
      ref TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);

  const result = await pool.query(
    `INSERT INTO ledger_holds(origin, account, amount, currency, ref)
     VALUES($1,$2,$3,$4,$5)
     RETURNING id`,
    [params.origin, params.account, params.amount, params.currency, params.ref]
  );

  return { id: result.rows[0].id };
}

