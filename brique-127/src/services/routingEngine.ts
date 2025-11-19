// ============================================================================
// Simplified Routing Engine hook for Bank Health Monitor consumers
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface RoutingCandidate {
  id: string;
  risk_score: number;
  sla_target: number | null;
  success_rate: number | null;
}

export async function selectBestBank(currency: string) {
  const { rows } = await pool.query(
    `SELECT bp.id,
            COALESCE(bp.risk_score, 0) AS risk_score,
            bp.sla_target,
            bh.success_rate
       FROM bank_profiles bp
       LEFT JOIN bank_health_metrics bh ON bh.bank_profile_id = bp.id
      WHERE bp.status='active'
        AND (bp.supported_currencies IS NULL OR $1 = ANY (bp.supported_currencies))
      ORDER BY bp.risk_score ASC, bp.sla_target ASC NULLS LAST
      LIMIT 5`,
    [currency]
  );

  if (!rows.length) {
    throw new Error("No active bank available for currency " + currency);
  }

  const winner = rows.find(isHealthyCandidate) || rows[0];
  return winner as RoutingCandidate;
}

function isHealthyCandidate(candidate: RoutingCandidate) {
  const riskScore = Number(candidate.risk_score || 0);
  const successRate = candidate.success_rate ?? 1;
  const healthyRisk = riskScore <= 0.8;
  const healthySuccess = successRate >= 0.8;
  return healthyRisk && healthySuccess;
}

