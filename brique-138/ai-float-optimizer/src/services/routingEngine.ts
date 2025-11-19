import { pool } from "../db";
import { createAlert } from "./alerts";

const FAILOVER_RISK_THRESHOLD = 0.8;
const DEGRADED_RISK_THRESHOLD = 0.5;

async function fetchCandidateBanks(currency: string, maxRisk?: number) {
  const params: any[] = [currency];
  let riskClause = "";

  if (typeof maxRisk === "number") {
    params.push(maxRisk);
    riskClause = "AND risk_score < $" + params.length;
  }

  const { rows } = await pool.query(
    `
    SELECT id, risk_score, sla_target, metadata
    FROM bank_profiles
    WHERE status = 'active'
      AND (supported_currencies IS NULL OR $1 = ANY(supported_currencies))
      ${riskClause}
    ORDER BY risk_score ASC, sla_target ASC NULLS LAST
    LIMIT 3
  `,
    params
  );

  return rows;
}

export async function selectBestBank(currency: string) {
  let candidates = await fetchCandidateBanks(currency, FAILOVER_RISK_THRESHOLD);

  if (!candidates.length) {
    candidates = await fetchCandidateBanks(currency);
  }

  if (!candidates.length) {
    throw new Error(`No active bank available for currency ${currency}`);
  }

  const chosen = candidates[0];

  if (chosen.risk_score >= FAILOVER_RISK_THRESHOLD) {
    await createAlert(
      "bank_failover",
      chosen.id,
      "critical",
      `Failover activated for bank ${chosen.id}`,
      { risk_score: chosen.risk_score, currency }
    );
  } else if (chosen.risk_score >= DEGRADED_RISK_THRESHOLD) {
    await createAlert(
      "bank_health",
      chosen.id,
      "high",
      `Bank ${chosen.id} operating in degraded mode`,
      { risk_score: chosen.risk_score, currency }
    );
  }

  return chosen;
}

