// =====================================================================
// Overage Amount Computation
// =====================================================================
// Compute billable amounts based on pricing models and units exceeded
// Date: 2025-11-12
// =====================================================================

import { Pool } from 'pg';
import { OveragePricingService, TieredPricingTier } from './pricing';

// =====================================================================
// Types
// =====================================================================

export interface ComputeAmountParams {
  tenantId: string;
  apiKeyId: string;
  planId: string;
  country: string;
  metric: string;
  unitsExceeded: number;
  timestamp: Date;
}

export interface ComputedAmount {
  amount: number;
  currency: string;
  units: number;
  billingModel: 'per_unit' | 'fixed' | 'tiered';
  unitPrice: number;
  tierBreakdown?: TierBreakdown[];
  pricingRuleId: string | null;
}

export interface TierBreakdown {
  tier: number;
  fromUnits: number;
  toUnits: number | null;
  unitPrice: number;
  unitsInTier: number;
  amountInTier: number;
}

// =====================================================================
// Compute Amount Service
// =====================================================================

export class ComputeAmountService {
  private pricingService: OveragePricingService;

  constructor(private pool: Pool) {
    this.pricingService = new OveragePricingService(pool);
  }

  /**
   * Compute overage amount based on pricing model
   */
  async computeAmount(params: ComputeAmountParams): Promise<ComputedAmount> {
    const { planId, country, metric, unitsExceeded } = params;

    // Get pricing rule
    const pricing = await this.pricingService.getPricing({
      planId,
      country,
      metric,
    });

    if (!pricing) {
      throw new Error(
        `No pricing rule found for metric=${metric}, plan=${planId}, country=${country}`
      );
    }

    // Get pricing rule ID
    const pricingRuleId = await this.getPricingRuleId(pricing);

    // Compute based on billing model
    switch (pricing.billing_model) {
      case 'per_unit':
        return this.computePerUnit(pricing, unitsExceeded, pricingRuleId);

      case 'fixed':
        return this.computeFixed(pricing, unitsExceeded, pricingRuleId);

      case 'tiered':
        return this.computeTiered(pricing, unitsExceeded, pricingRuleId, params);

      default:
        throw new Error(`Unknown billing model: ${pricing.billing_model}`);
    }
  }

  /**
   * Per-unit billing: amount = units * unit_price
   */
  private computePerUnit(
    pricing: any,
    unitsExceeded: number,
    pricingRuleId: string | null
  ): ComputedAmount {
    const amount = unitsExceeded * pricing.unit_price;

    return {
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
      currency: pricing.currency,
      units: unitsExceeded,
      billingModel: 'per_unit',
      unitPrice: pricing.unit_price,
      pricingRuleId,
    };
  }

  /**
   * Fixed billing: amount = fixed_amount (regardless of units)
   */
  private computeFixed(
    pricing: any,
    unitsExceeded: number,
    pricingRuleId: string | null
  ): ComputedAmount {
    return {
      amount: pricing.unit_price, // For fixed, unit_price is the fixed amount
      currency: pricing.currency,
      units: unitsExceeded,
      billingModel: 'fixed',
      unitPrice: pricing.unit_price,
      pricingRuleId,
    };
  }

  /**
   * Tiered billing: amount varies by tier
   *
   * Example:
   * - Tier 1: 0-1000 units @ $0.01/unit
   * - Tier 2: 1001-5000 units @ $0.008/unit
   * - Tier 3: 5001+ units @ $0.005/unit
   *
   * If unitsExceeded = 6000:
   * - First 1000 units: 1000 * $0.01 = $10
   * - Next 4000 units: 4000 * $0.008 = $32
   * - Remaining 1000 units: 1000 * $0.005 = $5
   * - Total: $47
   */
  private async computeTiered(
    pricing: any,
    unitsExceeded: number,
    pricingRuleId: string | null,
    params: ComputeAmountParams
  ): ComputedAmount {
    const tiers = await this.pricingService.getTieredPricing({
      planId: params.planId,
      country: params.country,
      metric: params.metric,
    });

    if (tiers.length === 0) {
      throw new Error(`No tiers found for tiered pricing rule: ${pricing.metric}`);
    }

    let remainingUnits = unitsExceeded;
    let totalAmount = 0;
    const tierBreakdown: TierBreakdown[] = [];

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const fromUnits = tier.from_units;
      const toUnits = tier.to_units;

      // Calculate units in this tier
      let unitsInTier = 0;

      if (toUnits === null) {
        // Last tier - all remaining units
        unitsInTier = remainingUnits;
      } else {
        // Calculate max units in this tier
        const maxUnitsInTier = toUnits - fromUnits;
        unitsInTier = Math.min(remainingUnits, maxUnitsInTier);
      }

      if (unitsInTier <= 0) {
        break;
      }

      // Calculate amount for this tier
      const amountInTier = unitsInTier * tier.unit_price;
      totalAmount += amountInTier;
      remainingUnits -= unitsInTier;

      tierBreakdown.push({
        tier: i + 1,
        fromUnits,
        toUnits,
        unitPrice: tier.unit_price,
        unitsInTier,
        amountInTier: Math.round(amountInTier * 100) / 100,
      });

      if (remainingUnits <= 0) {
        break;
      }
    }

    // Calculate weighted average unit price
    const avgUnitPrice = unitsExceeded > 0 ? totalAmount / unitsExceeded : 0;

    return {
      amount: Math.round(totalAmount * 100) / 100,
      currency: pricing.currency,
      units: unitsExceeded,
      billingModel: 'tiered',
      unitPrice: Math.round(avgUnitPrice * 100000) / 100000, // Round to 5 decimals
      tierBreakdown,
      pricingRuleId,
    };
  }

  /**
   * Get pricing rule ID from database
   */
  private async getPricingRuleId(pricing: any): Promise<string | null> {
    const result = await this.pool.query(
      `
      SELECT id::text
      FROM overage_pricing
      WHERE metric = $1
        AND (plan_id = $2 OR (plan_id IS NULL AND $2 IS NULL))
        AND (country = $3 OR (country IS NULL AND $3 IS NULL))
        AND is_active = true
      ORDER BY
        CASE
          WHEN plan_id IS NOT NULL AND country IS NOT NULL THEN 0
          WHEN plan_id IS NOT NULL THEN 1
          WHEN country IS NOT NULL THEN 2
          ELSE 3
        END
      LIMIT 1
      `,
      [pricing.metric, pricing.plan_id || null, pricing.country || null]
    );

    return result.rows[0]?.id || null;
  }

  /**
   * Batch compute amounts for multiple overages
   * (useful for aggregation and billing)
   */
  async batchCompute(
    overages: ComputeAmountParams[]
  ): Promise<Map<string, ComputedAmount>> {
    const results = new Map<string, ComputedAmount>();

    for (const overage of overages) {
      const key = `${overage.tenantId}:${overage.apiKeyId}:${overage.metric}:${overage.timestamp.toISOString()}`;
      try {
        const computed = await this.computeAmount(overage);
        results.set(key, computed);
      } catch (error) {
        console.error(`Failed to compute amount for ${key}:`, error);
        // Continue processing other overages
      }
    }

    return results;
  }

  /**
   * Preview amount computation (without saving to DB)
   * Useful for Ops to test pricing rules
   */
  async previewAmount(params: {
    planId: string;
    country: string;
    metric: string;
    unitsExceeded: number;
  }): Promise<ComputedAmount> {
    return this.computeAmount({
      tenantId: '00000000-0000-0000-0000-000000000000', // Placeholder
      apiKeyId: 'preview',
      planId: params.planId,
      country: params.country,
      metric: params.metric,
      unitsExceeded: params.unitsExceeded,
      timestamp: new Date(),
    });
  }
}

// =====================================================================
// Helper Functions
// =====================================================================

/**
 * Format amount for display
 */
export function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });

  return formatter.format(amount);
}

/**
 * Format tier breakdown for display
 */
export function formatTierBreakdown(breakdown: TierBreakdown[]): string {
  return breakdown
    .map((tier) => {
      const toUnits = tier.toUnits === null ? '∞' : tier.toUnits.toLocaleString();
      return `Tier ${tier.tier}: ${tier.fromUnits.toLocaleString()}-${toUnits} @ $${tier.unitPrice} = $${tier.amountInTier} (${tier.unitsInTier.toLocaleString()} units)`;
    })
    .join('\n');
}
