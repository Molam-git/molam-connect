// ============================================================================
// Bank Routing Selection Algorithm (SIRA-enhanced)
// ============================================================================

import { Pool } from "pg";
import Decimal from "decimal.js";
import { getSiraScoresForBanks } from "./sira-client";
import { getBankHealth } from "./health";
import { getPredictiveBestBank } from "./predictiveFailover";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ROUTING_MODE = process.env.FAILOVER_MODE || "reactive";
const DEGRADED_THRESHOLD = 0.5;
const FAILOVER_THRESHOLD = 0.8;
const SUCCESS_RATE_THRESHOLD = 0.95;
const FAILOVER_SUCCESS_THRESHOLD = 0.75;

interface RoutingParams {
  payoutId?: string | null;
  originModule: string;
  amount: number;
  currency: string;
  country: string;
  idempotencyKey?: string | null;
}

/**
 * Select best bank for payout using cost model + health + SIRA hints
 */
export async function selectBankForPayout(params: RoutingParams) {
  const { payoutId, originModule, amount, currency, country, idempotencyKey } = params;

  // Idempotency check
  if (idempotencyKey) {
    const { rows } = await pool.query(
      `SELECT * FROM bank_routing_decisions WHERE idempotency_key=$1`,
      [idempotencyKey]
    );
    if (rows.length) return rows[0];
  }

  let predictiveCandidate: any | null = null;
  if (ROUTING_MODE !== "reactive") {
    try {
      predictiveCandidate = await getPredictiveBestBank(currency);
    } catch (error) {
      console.warn("[Routing] Predictive selection unavailable:", (error as Error).message);
    }
  }

  // Fetch candidate banks supporting currency
  const { rows: candidates } = await pool.query(
    `SELECT * FROM bank_profiles
     WHERE (currency_codes @> ARRAY[$1]::text[] OR currency_codes @> ARRAY['USD']::text[])
     AND enabled = true
     AND compliance_level = 'verified'`,
    [currency]
  );

  if (!candidates.length) {
    throw new Error("no_bank_candidate");
  }

  // Fetch health metrics for all candidates
  const healthMap = new Map();
  for (const c of candidates) {
    const health = await getBankHealth(c.id);
    healthMap.set(c.id, health);
  }

  // Get SIRA scoring hints
  const siraHints = await getSiraScoresForBanks(
    candidates.map(c => c.id),
    { amount, currency, country }
  );

  // Fetch ops adjustments
  const { rows: adjustments } = await pool.query(
    `SELECT * FROM bank_routing_adjustments
     WHERE (scope='global' OR scope=$1)
     AND (expires_at IS NULL OR expires_at > now())`,
    [`country:${country}`]
  );
  const adjustMap = new Map(
    adjustments.map((a: any) => [a.bank_profile_id, Number(a.weight)])
  );

  // Compute scores for each candidate
  const scored: any[] = [];
  for (const c of candidates) {
    const riskScore = Number(c.risk_score || 0);
    const health = healthMap.get(c.id) || { success_rate: 1, avg_latency_ms: 50, recent_failures: 0, degraded: false };
    const sira = siraHints[c.id] || { sira_score: 0.5, expected_fx: 0 };
    const successRate = health.success_rate ?? 1;
    const predictiveMatch = predictiveCandidate && predictiveCandidate.id === c.id;
    const isFailover = !predictiveMatch && (riskScore > FAILOVER_THRESHOLD || successRate < FAILOVER_SUCCESS_THRESHOLD);
    if (isFailover) {
      await forceOpenCircuit(c.id);
      await triggerRoutingAlert(
        "bank_failover",
        c.id,
        "critical",
        `Failover triggered for bank ${c.id}: risk=${riskScore.toFixed(2)}, success=${(successRate * 100).toFixed(1)}%`
      );
      continue;
    }

    const isDegraded = riskScore > DEGRADED_THRESHOLD || successRate < SUCCESS_RATE_THRESHOLD || health.degraded;

    // Bank fees
    const bankFeePercent = c.fees?.[currency]?.percent || c.fees?.default?.percent || 0.01;
    const bankFeeFixed = c.fees?.[currency]?.fixed || c.fees?.default?.fixed || 0;
    const bankFee = new Decimal(amount).times(bankFeePercent).plus(bankFeeFixed);

    // Expected FX cost from SIRA
    const expectedFx = new Decimal(sira.expected_fx || 0);

    // Retry cost (based on health)
    const retryCost = new Decimal(1 - successRate).times(0.01).times(amount);

    // Apply ops weight adjustment
    const weight = adjustMap.get(c.id) || 1.0;

    // Health penalty
    const healthPenalty = new Decimal(1).minus(successRate || 1).times(10);
    const riskPenalty = new Decimal(riskScore).times(5);
    const degradedPenalty = isDegraded ? new Decimal(2) : new Decimal(0);
    const predictiveBoost = predictiveMatch ? new Decimal(-1) : new Decimal(0);

    // Total estimated cost (lower is better)
    const estimatedTotal = bankFee
      .plus(expectedFx)
      .plus(retryCost)
      .times(weight)
      .plus(healthPenalty)
      .plus(riskPenalty)
      .plus(degradedPenalty)
      .plus(predictiveBoost);

    scored.push({
      bank: c,
      estimatedTotal: Number(estimatedTotal.toFixed(4)),
      bankFee: Number(bankFee.toFixed(4)),
      expectedFx: Number(expectedFx.toFixed(4)),
      retryCost: Number(retryCost.toFixed(4)),
      siraScore: sira.sira_score || 0.5,
      health: { ...health, degraded: isDegraded },
      riskScore,
      predictive: predictiveMatch,
      predictiveRisk: predictiveCandidate?.predicted_risk_score ?? null,
      predictiveSuccess: predictiveCandidate?.predicted_success_rate ?? null
    });
  }

  // Sort by estimated total cost
  scored.sort((a, b) => {
    if (a.predictive && !b.predictive) return -1;
    if (b.predictive && !a.predictive) return 1;
    if (a.estimatedTotal !== b.estimatedTotal) return a.estimatedTotal - b.estimatedTotal;
    if (a.health.success_rate !== b.health.success_rate) return b.health.success_rate - a.health.success_rate;
    return b.siraScore - a.siraScore;
  });

  // Filter out banks with open circuit breakers
  const filtered = [];
  for (const s of scored) {
    const { rows: [cb] } = await pool.query(
      `SELECT * FROM bank_circuit_breakers WHERE bank_profile_id=$1`,
      [s.bank.id]
    );
    if (cb && cb.state === 'open') {
      continue; // Skip banks with open circuit breakers
    }
    filtered.push(s);
  }

  // Fallback if all circuits open
  if (filtered.length === 0) {
    console.warn("[Routing] All circuits open, using degraded banks");
    filtered.push(...scored);
  }

  // Choose the best candidate
  const chosen = filtered[0];

  // Persist routing decision
  const candidateList = scored.map(s => ({
    bank_profile_id: s.bank.id,
    estimated_total: s.estimatedTotal,
    sira_score: s.siraScore,
    health: s.health,
    risk_score: s.riskScore,
    predictive: s.predictive,
    predictive_risk: s.predictiveRisk,
    predictive_success: s.predictiveSuccess
  }));

  const { rows: [decision] } = await pool.query(
    `INSERT INTO bank_routing_decisions(
      payout_id, origin_module, currency, amount, candidate_banks,
      chosen_bank_profile_id, reason, idempotency_key, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      payoutId || null,
      originModule,
      currency,
      amount,
      JSON.stringify(candidateList),
      chosen.bank.id,
      ROUTING_MODE === "predictive" ? "predictive" : ROUTING_MODE === "hybrid" && chosen.predictive ? "predictive_hybrid" : 'best_cost_health',
      idempotencyKey || null,
      JSON.stringify({
        siraHints,
        routing_mode: ROUTING_MODE,
        predictive_used: Boolean(chosen.predictive)
      })
    ]
  );

  return decision;
}

async function forceOpenCircuit(bankId: string) {
  await pool.query(
    `INSERT INTO bank_circuit_breakers (bank_profile_id, state, opened_at, updated_at, failure_count)
     VALUES ($1,'open',now(),now(),1)
     ON CONFLICT (bank_profile_id) DO UPDATE SET
       state='open',
       opened_at=COALESCE(bank_circuit_breakers.opened_at, now()),
       failure_count=bank_circuit_breakers.failure_count+1,
       updated_at=now()`,
    [bankId]
  );
}

async function triggerRoutingAlert(type: string, entity: string, severity: "warning" | "critical", message: string) {
  try {
    await pool.query(
      `INSERT INTO alerts (type, entity, severity, message, metadata, status)
       VALUES ($1,$2,$3,$4,$5,'open')`,
      [type, entity, severity, message, JSON.stringify({ source: "routing" })]
    );
  } catch (error) {
    console.warn("[Routing] Unable to record alert:", (error as Error).message);
  }
}
