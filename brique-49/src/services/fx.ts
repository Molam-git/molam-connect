/**
 * Brique 49 - Taxes & Compliance
 * FX Rate Lookup Service
 */

import { pool } from "../utils/db.js";

/**
 * Get FX rate for currency conversion
 * Uses fx_rates table with daily rates
 */
export async function getFxRate(from: string, to: string, asOf: Date): Promise<number> {
  if (from === to) return 1.0;

  const dateStr = asOf.toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `SELECT rate FROM fx_rates
     WHERE as_of_date = $1 AND base_currency = $2 AND quote_currency = $3
     LIMIT 1`,
    [dateStr, from, to]
  );

  if (!rows[0]) {
    console.warn(`Missing FX rate: ${from}/${to} on ${dateStr}, using fallback`);
    return Number(process.env.FX_FALLBACK_RATE) || 1.0;
  }

  return Number(rows[0].rate);
}
