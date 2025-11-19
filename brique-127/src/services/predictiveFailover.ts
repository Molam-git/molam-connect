// ============================================================================
// Predictive Failover (Brique 138bis)
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getPredictiveBestBank(currency: string) {
  const { rows } = await pool.query(
    `SELECT bp.id,
            bhp.predicted_risk_score,
            bhp.predicted_success_rate,
            bhp.valid_until
       FROM bank_profiles bp
       JOIN bank_health_predictions bhp ON bp.id = bhp.bank_id
      WHERE bp.status = 'active'
        AND (bp.supported_currencies IS NULL OR $1 = ANY (bp.supported_currencies))
        AND bhp.valid_until > now()
      ORDER BY bhp.predicted_risk_score ASC, bhp.predicted_success_rate DESC
      LIMIT 1`,
    [currency]
  );

  if (!rows.length) {
    throw new Error("predictive_bank_not_found");
  }

  return rows[0];
}

export async function listPredictiveWindows(bankId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM bank_health_predictions
      WHERE bank_id = $1
        AND valid_until > now()
      ORDER BY predicted_at DESC`,
    [bankId]
  );

  return rows;
}

