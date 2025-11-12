import { pool } from './db';

/**
 * Get foreign exchange rate for a specific date
 */
export async function getFxRate(
  asOf: Date,
  base: string,
  quote: string
): Promise<number> {
  // Same currency - no conversion needed
  if (base === quote) return 1;

  const asOfDate = asOf.toISOString().slice(0, 10);

  // Try direct lookup
  const { rows } = await pool.query(
    `SELECT rate FROM fx_rates
     WHERE as_of_date = $1
       AND base_currency = $2
       AND quote_currency = $3
     LIMIT 1`,
    [asOfDate, base, quote]
  );

  if (rows.length) {
    return Number(rows[0].rate);
  }

  // Try inverse lookup
  const { rows: invRows } = await pool.query(
    `SELECT rate FROM fx_rates
     WHERE as_of_date = $1
       AND base_currency = $2
       AND quote_currency = $3
     LIMIT 1`,
    [asOfDate, quote, base]
  );

  if (invRows.length) {
    return 1 / Number(invRows[0].rate);
  }

  throw new Error(`FX rate missing for ${base} → ${quote} at ${asOfDate}`);
}

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  asOf: Date = new Date()
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;

  const rate = await getFxRate(asOf, fromCurrency, toCurrency);
  return amount * rate;
}

/**
 * Update FX rate (for admin/worker use)
 */
export async function updateFxRate(
  asOfDate: string,
  baseCurrency: string,
  quoteCurrency: string,
  rate: number,
  source: string = 'manual'
): Promise<void> {
  await pool.query(
    `INSERT INTO fx_rates(as_of_date, base_currency, quote_currency, rate, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (as_of_date, base_currency, quote_currency)
     DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source`,
    [asOfDate, baseCurrency, quoteCurrency, rate, source]
  );
}