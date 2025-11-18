// =====================================================================
// Overage Pricing Utilities
// =====================================================================
// Fetch pricing with fallback hierarchy (plan+country > plan > country > global)
// Date: 2025-11-12
// =====================================================================

import { Pool } from 'pg';

// =====================================================================
// Types
// =====================================================================

export interface OveragePricing {
  metric: string;
  unit_price: number;
  currency: string;
  billing_model: 'per_unit' | 'fixed' | 'tiered';
  plan_id: string | null;
  country: string | null;
}

export interface TieredPricingTier {
  from_units: number;
  to_units: number | null;
  unit_price: number;
}

export interface GetPricingParams {
  planId: string;
  country: string;
  metric: string;
}

// =====================================================================
// Pricing Service
// =====================================================================

export class OveragePricingService {
  constructor(private pool: Pool) {}

  /**
   * Get overage pricing with fallback hierarchy
   *
   * Fallback order:
   * 1. plan_id + country + metric (most specific)
   * 2. plan_id + metric (plan default)
   * 3. country + metric (country default)
   * 4. metric only (global default)
   */
  async getPricing(params: GetPricingParams): Promise<OveragePricing | null> {
    const { planId, country, metric } = params;

    const result = await this.pool.query<OveragePricing>(
      `
      SELECT
        metric,
        COALESCE(fixed_amount, per_unit_amount) as unit_price,
        currency,
        billing_model,
        plan_id,
        country
      FROM overage_pricing
      WHERE metric = $1
        AND is_active = true
        AND (plan_id = $2 OR plan_id IS NULL)
        AND (country = $3 OR country IS NULL)
      ORDER BY
        CASE
          WHEN plan_id IS NOT NULL AND country IS NOT NULL THEN 0
          WHEN plan_id IS NOT NULL THEN 1
          WHEN country IS NOT NULL THEN 2
          ELSE 3
        END
      LIMIT 1
      `,
      [metric, planId, country]
    );

    return result.rows[0] || null;
  }

  /**
   * Get tiered pricing tiers for a metric
   */
  async getTieredPricing(params: GetPricingParams): Promise<TieredPricingTier[]> {
    const { planId, country, metric } = params;

    // First get the pricing rule
    const pricing = await this.getPricing(params);
    if (!pricing || pricing.billing_model !== 'tiered') {
      return [];
    }

    // Fetch tiers
    const result = await this.pool.query<TieredPricingTier>(
      `
      SELECT
        from_units,
        to_units,
        unit_price
      FROM overage_pricing_tiers
      WHERE pricing_id = (
        SELECT id FROM overage_pricing
        WHERE metric = $1
          AND is_active = true
          AND (plan_id = $2 OR plan_id IS NULL)
          AND (country = $3 OR country IS NULL)
        ORDER BY
          CASE
            WHEN plan_id IS NOT NULL AND country IS NOT NULL THEN 0
            WHEN plan_id IS NOT NULL THEN 1
            WHEN country IS NOT NULL THEN 2
            ELSE 3
          END
        LIMIT 1
      )
      ORDER BY from_units ASC
      `,
      [metric, planId, country]
    );

    return result.rows;
  }

  /**
   * Get all active pricing rules (for Ops dashboard)
   */
  async getAllPricing(filters?: {
    planId?: string;
    country?: string;
    metric?: string;
  }): Promise<OveragePricing[]> {
    let query = `
      SELECT
        metric,
        COALESCE(fixed_amount, per_unit_amount) as unit_price,
        currency,
        billing_model,
        plan_id,
        country
      FROM overage_pricing
      WHERE is_active = true
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.planId) {
      query += ` AND plan_id = $${paramIndex++}`;
      params.push(filters.planId);
    }

    if (filters?.country) {
      query += ` AND country = $${paramIndex++}`;
      params.push(filters.country);
    }

    if (filters?.metric) {
      query += ` AND metric = $${paramIndex++}`;
      params.push(filters.metric);
    }

    query += ` ORDER BY plan_id NULLS LAST, country NULLS LAST, metric`;

    const result = await this.pool.query<OveragePricing>(query, params);
    return result.rows;
  }

  /**
   * Create or update pricing rule (Ops only)
   */
  async upsertPricing(pricing: {
    metric: string;
    billingModel: 'per_unit' | 'fixed' | 'tiered';
    currency: string;
    unitPrice?: number;
    fixedAmount?: number;
    planId?: string;
    country?: string;
    tiers?: TieredPricingTier[];
    createdBy: string;
  }): Promise<OveragePricing> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Deactivate existing pricing rule if it exists
      await client.query(
        `
        UPDATE overage_pricing
        SET is_active = false
        WHERE metric = $1
          AND (plan_id = $2 OR (plan_id IS NULL AND $2 IS NULL))
          AND (country = $3 OR (country IS NULL AND $3 IS NULL))
        `,
        [pricing.metric, pricing.planId || null, pricing.country || null]
      );

      // Insert new pricing rule
      const result = await client.query<OveragePricing>(
        `
        INSERT INTO overage_pricing (
          metric,
          billing_model,
          currency,
          per_unit_amount,
          fixed_amount,
          plan_id,
          country,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          metric,
          COALESCE(fixed_amount, per_unit_amount) as unit_price,
          currency,
          billing_model,
          plan_id,
          country
        `,
        [
          pricing.metric,
          pricing.billingModel,
          pricing.currency,
          pricing.unitPrice || null,
          pricing.fixedAmount || null,
          pricing.planId || null,
          pricing.country || null,
          pricing.createdBy,
        ]
      );

      const pricingId = result.rows[0];

      // If tiered, insert tiers
      if (pricing.billingModel === 'tiered' && pricing.tiers && pricing.tiers.length > 0) {
        // Get the actual pricing ID
        const idResult = await client.query(
          `SELECT id FROM overage_pricing WHERE metric = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`,
          [pricing.metric]
        );

        for (const tier of pricing.tiers) {
          await client.query(
            `
            INSERT INTO overage_pricing_tiers (
              pricing_id,
              from_units,
              to_units,
              unit_price
            ) VALUES ($1, $2, $3, $4)
            `,
            [idResult.rows[0].id, tier.from_units, tier.to_units, tier.unit_price]
          );
        }
      }

      await client.query('COMMIT');
      return pricingId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete pricing rule (soft delete - mark as inactive)
   */
  async deletePricing(params: {
    metric: string;
    planId?: string;
    country?: string;
  }): Promise<void> {
    await this.pool.query(
      `
      UPDATE overage_pricing
      SET is_active = false
      WHERE metric = $1
        AND (plan_id = $2 OR (plan_id IS NULL AND $2 IS NULL))
        AND (country = $3 OR (country IS NULL AND $3 IS NULL))
      `,
      [params.metric, params.planId || null, params.country || null]
    );
  }
}
