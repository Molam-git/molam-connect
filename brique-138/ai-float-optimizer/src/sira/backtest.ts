import { listCandidateRoutes } from "../treasury/routing";
import { pool } from "../db";

async function estimateFXCost(currency: string, amount: number, route: { bank_profile_id: string }) {
  const fxSpread = route.bank_profile_id === "bank_fintech_fx" ? 0.0075 : 0.0035;
  return currency === "USD" ? amount * 0.0025 : amount * fxSpread;
}

export async function backtestRecommendation(target_account_id: string, currency: string, amount: number) {
  const candidates = await listCandidateRoutes(currency, amount);
  const results = [];

  for (const candidate of candidates) {
    const fee = candidate.bank_fee + candidate.percent_fee * amount;
    const fxCost = await estimateFXCost(currency, amount, candidate);
    const delayPenalty = Math.log(1 + candidate.estimated_delay_sec / 3600) * 2;
    const riskPenalty = candidate.bank_risk_score * 100;
    const totalEstimatedCost = fee + fxCost + delayPenalty + riskPenalty;

    results.push({
      route: candidate,
      fee,
      fxCost,
      delayPenalty,
      riskPenalty,
      totalEstimatedCost
    });
  }

  results.sort((a, b) => a.totalEstimatedCost - b.totalEstimatedCost);
  const best = results[0];

  return {
    best: { route: best.route, totalEstimatedCost: best.totalEstimatedCost },
    alternatives: results.map((r) => ({
      route: r.route,
      totalEstimatedCost: r.totalEstimatedCost,
      fee: r.fee,
      fxCost: r.fxCost
    }))
  };
}

export async function attachBacktestToRecommendation(recoId: string, backtest: unknown) {
  await pool.query(
    `UPDATE float_recommendations
       SET reason = jsonb_set(reason::jsonb, '{backtest}', $2::jsonb, true),
           updated_at = now()
     WHERE id = $1`,
    [recoId, JSON.stringify(backtest)]
  );
}

