// ============================================================================
// Marketplace Split Engine - Revenue Sharing Calculation
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface SplitResult {
  sellerAmount: number;
  marketplaceFee: number;
  molamFee: number;
}

/**
 * Compute revenue split based on marketplace rules
 * Default: 90% seller, 10% marketplace, 0.9% Molam fee
 */
export async function computeSplit(
  marketplaceId: string,
  amount: number,
  currency: string
): Promise<SplitResult> {
  // Get active split rule
  const { rows: [rule] } = await pool.query(
    `SELECT rule_json FROM marketplace_split_rules
     WHERE marketplace_id=$1 AND active=true
     ORDER BY created_at DESC LIMIT 1`,
    [marketplaceId]
  );

  if (!rule) {
    // Default 90/10 split
    return {
      sellerAmount: Math.round(amount * 0.90 * 100) / 100,
      marketplaceFee: Math.round(amount * 0.10 * 100) / 100,
      molamFee: Math.round(amount * 0.009 * 100) / 100
    };
  }

  const ruleConfig = rule.rule_json;

  // Percent-based split
  if (ruleConfig.type === "percent") {
    const sellerPct = ruleConfig.parts.find((p: any) => p.to === "seller")?.pct || 100;
    const marketplacePct = ruleConfig.parts.find((p: any) => p.to === "marketplace")?.pct || 0;

    return {
      sellerAmount: Math.round(amount * (sellerPct / 100) * 100) / 100,
      marketplaceFee: Math.round(amount * (marketplacePct / 100) * 100) / 100,
      molamFee: Math.round(amount * 0.009 * 100) / 100
    };
  }

  // Hybrid split (fixed + percent)
  if (ruleConfig.type === "hybrid") {
    const marketplaceFixed = ruleConfig.parts.find((p: any) => p.to === "marketplace")?.fixed || 0;
    const sellerPct = ruleConfig.parts.find((p: any) => p.to === "seller")?.pct || 100;

    const remainingAfterFixed = amount - marketplaceFixed;
    const sellerAmount = Math.round(remainingAfterFixed * (sellerPct / 100) * 100) / 100;

    return {
      sellerAmount,
      marketplaceFee: marketplaceFixed + (remainingAfterFixed - sellerAmount),
      molamFee: Math.round(amount * 0.009 * 100) / 100
    };
  }

  throw new Error("unsupported_split_rule");
}
