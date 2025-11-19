// ============================================================================
// Fee Calculation Engine - Idempotent, Reproducible, Multi-currency
// ============================================================================

import { Pool } from "pg";
import Decimal from "decimal.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type TxContext = {
  transaction_id: string;
  module: "wallet" | "connect";
  event_type: string; // 'p2p','merchant_payment','fx',...
  amount: string; // decimal string
  currency: string;
  country?: string;
  sender_id?: string;
  receiver_id?: string;
  agent_id?: string | null;
  idempotency_key?: string;
};

export type FeeBreakdown = {
  rule_id: string;
  name: string;
  fee: string;
  currency: string;
  percent: string;
  fixed: string;
  agent_share: string;
  molam_share: string;
};

export type FeeCalculation = {
  transaction_id: string;
  amount: string;
  currency: string;
  total_fee: string;
  breakdown: FeeBreakdown[];
};

/**
 * Canonical rounding for currency (HALF_EVEN to 2 decimals)
 */
function roundCurrency(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/**
 * Calculate fees for a transaction context
 * Idempotent: same inputs always produce same outputs
 */
export async function calculateFees(ctx: TxContext): Promise<FeeCalculation> {
  // 1) Load applicable rules (ordered by priority desc)
  const { rows: rules } = await pool.query(
    `SELECT * FROM fee_rules
     WHERE active = true
       AND module = $1
       AND event_type = $2
       AND (country IS NULL OR country = $3)
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until >= now())
     ORDER BY priority DESC, created_at DESC`,
    [ctx.module, ctx.event_type, ctx.country || null]
  );

  // 2) Check overrides (merchant/agent/user specific pricing)
  const overridesQ = await pool.query(
    `SELECT * FROM fee_overrides
     WHERE target_type IN ('merchant','user')
       AND target_id IN ($1, $2)
       AND active = true
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until >= now())`,
    [ctx.receiver_id || '00000000-0000-0000-0000-000000000000',
     ctx.sender_id || '00000000-0000-0000-0000-000000000000']
  );
  const overrides = overridesQ.rows;

  const amount = new Decimal(ctx.amount);
  let totalFee = new Decimal(0);
  const breakdown: FeeBreakdown[] = [];

  // 3) Apply rules (most rules will be one, but supports stacking)
  for (const r of rules) {
    // Allow override per rule
    const override = overrides.find((o) => o.rule_id === r.id);
    const percent = new Decimal(override?.override_percent ?? r.percent);
    const fixed = new Decimal(override?.override_fixed ?? r.fixed_amount);

    // Calculate fee: percent * amount + fixed
    let fee = amount.mul(percent).plus(fixed);

    // Apply min/max caps
    if (r.min_amount) {
      fee = Decimal.max(fee, new Decimal(r.min_amount));
    }
    if (r.max_amount) {
      fee = Decimal.min(fee, new Decimal(r.max_amount));
    }

    // Round to currency precision
    fee = roundCurrency(fee);

    // Skip zero fees
    if (fee.isZero()) continue;

    totalFee = totalFee.plus(fee);

    // Split agent / molam share
    const agentSharePercent = new Decimal(r.agent_share_percent || 0);
    const agentShare = roundCurrency(agentSharePercent.mul(fee));
    const molamShare = fee.minus(agentShare);

    breakdown.push({
      rule_id: r.id,
      name: r.name,
      fee: fee.toFixed(2),
      currency: ctx.currency,
      percent: percent.toFixed(6),
      fixed: fixed.toFixed(2),
      agent_share: agentShare.toFixed(2),
      molam_share: molamShare.toFixed(2),
    });
  }

  return {
    transaction_id: ctx.transaction_id,
    amount: amount.toFixed(2),
    currency: ctx.currency,
    total_fee: roundCurrency(totalFee).toFixed(2),
    breakdown,
  };
}

/**
 * Simulate fees for pricing pages
 */
export async function simulateFees(params: {
  module: string;
  event_type: string;
  amount: string;
  currency: string;
  country?: string;
}): Promise<{ total_fee: string; breakdown: any[] }> {
  const ctx: TxContext = {
    transaction_id: "simulation",
    module: params.module as any,
    event_type: params.event_type,
    amount: params.amount,
    currency: params.currency,
    country: params.country,
  };

  const calc = await calculateFees(ctx);
  return {
    total_fee: calc.total_fee,
    breakdown: calc.breakdown,
  };
}
