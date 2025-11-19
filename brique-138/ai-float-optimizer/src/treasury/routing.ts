import { pool } from "../db";

export type Route = {
  bank_profile_id: string;
  treasury_account_id: string | null;
  from: string;
  to: string;
  bank_fee: number;
  percent_fee: number;
  estimated_delay_sec: number;
  bank_risk_score: number;
};

export async function listCandidateRoutes(currency: string, _amount: number): Promise<Route[]> {
  const { rows } = await pool.query(
    `SELECT id, settlement_account_id, supported_currencies, flat_fee, percent_fee, avg_delay_sec, risk_score
     FROM bank_profiles
     WHERE status = 'active'
       AND (supported_currencies IS NULL OR $1 = ANY(supported_currencies))`,
    [currency]
  );

  if (!rows.length) {
    return [
      {
        bank_profile_id: "fallback",
        treasury_account_id: null,
        from: "settlement_fallback",
        to: "operational_fallback",
        bank_fee: 1,
        percent_fee: 0.003,
        estimated_delay_sec: 3600,
        bank_risk_score: 0.1
      }
    ];
  }

  return rows.map((row) => ({
    bank_profile_id: row.id,
    treasury_account_id: row.settlement_account_id,
    from: `settlement_${row.id}`,
    to: `operational_${row.id}`,
    bank_fee: Number(row.flat_fee || 0),
    percent_fee: Number(row.percent_fee || 0),
    estimated_delay_sec: row.avg_delay_sec || 3600,
    bank_risk_score: Number(row.risk_score || 0.1)
  }));
}

export async function pickRouting(currency: string, amount: number) {
  const routes = await listCandidateRoutes(currency, amount);
  if (!routes.length) {
    throw new Error(`No routes available for currency ${currency}`);
  }

  let best = routes[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const route of routes) {
    const feeCost = route.bank_fee + route.percent_fee * amount;
    const riskPenalty = route.bank_risk_score * 100;
    const delayPenalty = Math.log(1 + route.estimated_delay_sec / 3600) * 2;
    const score = feeCost + riskPenalty + delayPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = route;
    }
  }

  return { routing: best, score: bestScore };
}

