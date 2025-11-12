/**
 * AI Marketing Engine - SIRA-powered recommendation generation
 *
 * This service analyzes merchant data and generates intelligent marketing recommendations:
 * - Abandoned cart recovery campaigns
 * - Customer reactivation offers
 * - Subscription upsell strategies
 * - Seasonal promotions
 * - Loyalty rewards
 */

import { pool } from '../db';

export interface MerchantMetrics {
  merchantId: string;
  timeframe: '7d' | '30d' | '90d';

  // Order metrics
  totalOrders: number;
  completedOrders: number;
  abandonedCarts: number;
  abandonmentRate: number;
  avgOrderValue: number;

  // Customer metrics
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  churnRate: number;
  avgCustomerLifetimeValue: number;

  // Revenue metrics
  totalRevenue: number;
  revenueGrowthRate: number;

  // Product metrics
  topProducts: Array<{ id: string; name: string; sales: number }>;

  // Geographic
  topCountries: Array<{ code: string; revenue: number }>;

  // Subscription metrics (if applicable)
  activeSubscriptions: number;
  subscriptionChurnRate: number;
  avgSubscriptionValue: number;
}

export interface AIRecommendation {
  type: 'promo_code' | 'coupon' | 'subscription_plan' | 'campaign';
  discountType?: 'percentage' | 'fixed' | 'free_shipping';
  discountValue?: number;
  target: 'abandoned_carts' | 'inactive_customers' | 'loyal_customers' | 'new_customers' | 'all_customers';
  message: string;
  reasoning: string;
  expectedImpact: {
    conversionUplift: number; // percentage
    revenueImpact: number; // estimated revenue
    customerRetention?: number;
  };
  durationDays: number;
  conditions?: Record<string, any>;
}

export interface GeneratedRecommendation {
  id: string;
  merchantId: string;
  recommendation: AIRecommendation;
  confidence: number;
  dataPoints: Partial<MerchantMetrics>;
  generatedAt: Date;
}

/**
 * Fetch comprehensive merchant metrics for AI analysis
 */
export async function fetchMerchantMetrics(
  merchantId: string,
  timeframe: '7d' | '30d' | '90d' = '30d'
): Promise<MerchantMetrics> {
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;

  // Fetch order metrics
  const orderQuery = await pool.query(`
    SELECT
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
      COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned_carts,
      AVG(total_amount) FILTER (WHERE status = 'completed') as avg_order_value,
      SUM(total_amount) FILTER (WHERE status = 'completed') as total_revenue
    FROM orders
    WHERE merchant_id = $1
      AND created_at > now() - interval '${days} days'
  `, [merchantId]);

  const orderStats = orderQuery.rows[0];
  const totalOrders = Number(orderStats.total_orders) || 0;
  const completedOrders = Number(orderStats.completed_orders) || 0;
  const abandonedCarts = Number(orderStats.abandoned_carts) || 0;
  const abandonmentRate = totalOrders > 0 ? (abandonedCarts / totalOrders) : 0;

  // Fetch customer metrics
  const customerQuery = await pool.query(`
    SELECT
      COUNT(DISTINCT customer_id) as total_customers,
      COUNT(DISTINCT customer_id) FILTER (WHERE last_order_date > now() - interval '30 days') as active_customers
    FROM (
      SELECT
        customer_id,
        MAX(created_at) as last_order_date
      FROM orders
      WHERE merchant_id = $1
      GROUP BY customer_id
    ) customer_orders
  `, [merchantId]);

  const customerStats = customerQuery.rows[0];
  const totalCustomers = Number(customerStats.total_customers) || 0;
  const activeCustomers = Number(customerStats.active_customers) || 0;
  const inactiveCustomers = totalCustomers - activeCustomers;

  // Calculate churn rate (simplified)
  const churnRate = totalCustomers > 0 ? (inactiveCustomers / totalCustomers) : 0;

  // Fetch top products
  const topProductsQuery = await pool.query(`
    SELECT
      product_id as id,
      product_name as name,
      COUNT(*) as sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.merchant_id = $1
      AND o.status = 'completed'
      AND o.created_at > now() - interval '${days} days'
    GROUP BY product_id, product_name
    ORDER BY sales DESC
    LIMIT 5
  `, [merchantId]);

  // Fetch top countries
  const topCountriesQuery = await pool.query(`
    SELECT
      country_code as code,
      SUM(total_amount) as revenue
    FROM orders
    WHERE merchant_id = $1
      AND status = 'completed'
      AND created_at > now() - interval '${days} days'
    GROUP BY country_code
    ORDER BY revenue DESC
    LIMIT 5
  `, [merchantId]);

  // Fetch subscription metrics (if table exists)
  let subscriptionMetrics = {
    activeSubscriptions: 0,
    subscriptionChurnRate: 0,
    avgSubscriptionValue: 0,
  };

  try {
    const subQuery = await pool.query(`
      SELECT
        COUNT(*) as active_subscriptions,
        AVG(amount) as avg_subscription_value
      FROM subscriptions
      WHERE merchant_id = $1
        AND status = 'active'
    `, [merchantId]);

    if (subQuery.rows.length > 0) {
      subscriptionMetrics = {
        activeSubscriptions: Number(subQuery.rows[0].active_subscriptions) || 0,
        subscriptionChurnRate: 0, // Simplified
        avgSubscriptionValue: Number(subQuery.rows[0].avg_subscription_value) || 0,
      };
    }
  } catch (err) {
    // Subscription table might not exist yet
  }

  return {
    merchantId,
    timeframe,
    totalOrders,
    completedOrders,
    abandonedCarts,
    abandonmentRate,
    avgOrderValue: Number(orderStats.avg_order_value) || 0,
    totalCustomers,
    activeCustomers,
    inactiveCustomers,
    churnRate,
    avgCustomerLifetimeValue: (Number(orderStats.total_revenue) || 0) / Math.max(totalCustomers, 1),
    totalRevenue: Number(orderStats.total_revenue) || 0,
    revenueGrowthRate: 0, // Would require historical comparison
    topProducts: topProductsQuery.rows.map(row => ({
      id: row.id,
      name: row.name,
      sales: Number(row.sales),
    })),
    topCountries: topCountriesQuery.rows.map(row => ({
      code: row.code,
      revenue: Number(row.revenue),
    })),
    ...subscriptionMetrics,
  };
}

/**
 * Generate AI recommendations based on merchant metrics
 */
export async function generateRecommendations(
  merchantId: string
): Promise<GeneratedRecommendation[]> {
  const metrics = await fetchMerchantMetrics(merchantId, '30d');
  const recommendations: AIRecommendation[] = [];

  // Rule 1: High abandonment rate → Abandoned cart recovery
  if (metrics.abandonmentRate > 0.25) {
    const discountValue = metrics.abandonmentRate > 0.4 ? 20 : 15;
    recommendations.push({
      type: 'promo_code',
      discountType: 'percentage',
      discountValue,
      target: 'abandoned_carts',
      message: `Récupération de paniers abandonnés avec ${discountValue}% de réduction`,
      reasoning: `Taux d'abandon élevé détecté: ${(metrics.abandonmentRate * 100).toFixed(1)}%. ` +
        `${metrics.abandonedCarts} paniers abandonnés représentent une opportunité de ${(metrics.abandonedCarts * metrics.avgOrderValue * 0.7).toFixed(0)}€ de revenus potentiels.`,
      expectedImpact: {
        conversionUplift: 30 + (discountValue - 15) * 2,
        revenueImpact: metrics.abandonedCarts * metrics.avgOrderValue * 0.30,
      },
      durationDays: 14,
      conditions: {
        minCartAge: '1 hour',
        maxCartAge: '7 days',
        minCartValue: metrics.avgOrderValue * 0.5,
      },
    });
  }

  // Rule 2: High customer inactivity → Reactivation campaign
  if (metrics.inactiveCustomers > metrics.activeCustomers * 0.3) {
    recommendations.push({
      type: 'coupon',
      discountType: 'percentage',
      discountValue: 25,
      target: 'inactive_customers',
      message: 'Campagne de réactivation client avec coupon récurrent -25%',
      reasoning: `${metrics.inactiveCustomers} clients inactifs (${(metrics.churnRate * 100).toFixed(1)}% de churn). ` +
        `Valeur moyenne client: ${metrics.avgCustomerLifetimeValue.toFixed(0)}€. ` +
        `Réactiver 20% génèrerait ${(metrics.inactiveCustomers * 0.2 * metrics.avgCustomerLifetimeValue * 0.5).toFixed(0)}€.`,
      expectedImpact: {
        conversionUplift: 20,
        revenueImpact: metrics.inactiveCustomers * 0.2 * metrics.avgOrderValue,
        customerRetention: 18,
      },
      durationDays: 30,
      conditions: {
        lastOrderDays: 30,
        maxOrders: 999,
      },
    });
  }

  // Rule 3: Low subscription adoption → Subscription upsell
  if (metrics.totalCustomers > 10 && metrics.activeSubscriptions < metrics.activeCustomers * 0.1) {
    recommendations.push({
      type: 'subscription_plan',
      discountType: 'percentage',
      discountValue: 15,
      target: 'loyal_customers',
      message: 'Offre d\'abonnement annuel avec -15% pour clients fidèles',
      reasoning: `Seulement ${metrics.activeSubscriptions} abonnements actifs (${((metrics.activeSubscriptions / metrics.totalCustomers) * 100).toFixed(1)}%). ` +
        `Les clients fidèles avec 3+ commandes sont de bons candidats. ` +
        `Potentiel de revenus récurrents: ${(metrics.activeCustomers * 0.15 * metrics.avgOrderValue * 10).toFixed(0)}€/an.`,
      expectedImpact: {
        conversionUplift: 12,
        revenueImpact: metrics.activeCustomers * 0.12 * metrics.avgOrderValue * 12,
      },
      durationDays: 60,
      conditions: {
        minPreviousOrders: 3,
        avgOrderValue: metrics.avgOrderValue * 0.8,
      },
    });
  }

  // Rule 4: Good performance → Loyalty program
  if (metrics.activeCustomers > 50 && metrics.churnRate < 0.2) {
    recommendations.push({
      type: 'promo_code',
      discountType: 'percentage',
      discountValue: 10,
      target: 'loyal_customers',
      message: 'Programme de fidélité VIP -10% pour top clients',
      reasoning: `Performance solide: ${metrics.activeCustomers} clients actifs, taux de churn faible (${(metrics.churnRate * 100).toFixed(1)}%). ` +
        `Récompenser les 20% meilleurs clients renforcera la fidélité et augmentera le LTV.`,
      expectedImpact: {
        conversionUplift: 15,
        revenueImpact: metrics.activeCustomers * 0.2 * metrics.avgOrderValue * 0.15 * 3,
        customerRetention: 25,
      },
      durationDays: 90,
      conditions: {
        minLifetimeValue: metrics.avgCustomerLifetimeValue * 1.5,
      },
    });
  }

  // Rule 5: New merchant → Welcome campaign
  if (metrics.totalOrders < 100) {
    recommendations.push({
      type: 'campaign',
      discountType: 'percentage',
      discountValue: 20,
      target: 'new_customers',
      message: 'Campagne de lancement -20% pour nouveaux clients',
      reasoning: `Nouveau marchand détecté (${metrics.totalOrders} commandes). ` +
        `Une offre de lancement agressive aidera à acquérir rapidement une base client.`,
      expectedImpact: {
        conversionUplift: 40,
        revenueImpact: 50 * metrics.avgOrderValue * 0.4,
      },
      durationDays: 30,
      conditions: {
        firstPurchaseOnly: true,
      },
    });
  }

  // Save recommendations to database
  const savedRecommendations: GeneratedRecommendation[] = [];

  for (const rec of recommendations) {
    const confidence = calculateConfidence(rec, metrics);

    const { rows } = await pool.query(`
      INSERT INTO marketing_ai_recommendations (
        merchant_id,
        recommendation,
        confidence,
        data_points,
        status
      ) VALUES ($1, $2, $3, $4, 'suggested')
      RETURNING *
    `, [
      merchantId,
      JSON.stringify(rec),
      confidence,
      JSON.stringify({
        abandonmentRate: metrics.abandonmentRate,
        avgOrderValue: metrics.avgOrderValue,
        customerLifetimeValue: metrics.avgCustomerLifetimeValue,
        churnRate: metrics.churnRate,
        totalCustomers: metrics.totalCustomers,
        activeCustomers: metrics.activeCustomers,
      }),
    ]);

    savedRecommendations.push({
      id: rows[0].id,
      merchantId: rows[0].merchant_id,
      recommendation: rows[0].recommendation,
      confidence: Number(rows[0].confidence),
      dataPoints: rows[0].data_points,
      generatedAt: rows[0].generated_at,
    });
  }

  return savedRecommendations;
}

/**
 * Calculate confidence score for a recommendation (0-100)
 */
function calculateConfidence(rec: AIRecommendation, metrics: MerchantMetrics): number {
  let confidence = 70; // Base confidence

  // Adjust based on data volume
  if (metrics.totalOrders > 100) confidence += 10;
  if (metrics.totalOrders > 500) confidence += 5;
  if (metrics.totalCustomers > 50) confidence += 5;

  // Adjust based on recommendation type and metrics alignment
  if (rec.type === 'promo_code' && rec.target === 'abandoned_carts') {
    if (metrics.abandonmentRate > 0.4) confidence += 10;
    else if (metrics.abandonmentRate > 0.3) confidence += 5;
  }

  if (rec.type === 'coupon' && rec.target === 'inactive_customers') {
    if (metrics.churnRate > 0.3) confidence += 10;
    else if (metrics.churnRate > 0.2) confidence += 5;
  }

  // Cap at 100
  return Math.min(confidence, 100);
}

/**
 * Get recent recommendations for a merchant
 */
export async function getRecommendations(
  merchantId: string,
  limit: number = 10
): Promise<GeneratedRecommendation[]> {
  const { rows } = await pool.query(`
    SELECT *
    FROM marketing_ai_recommendations
    WHERE merchant_id = $1
      AND status != 'expired'
    ORDER BY generated_at DESC
    LIMIT $2
  `, [merchantId, limit]);

  return rows.map(row => ({
    id: row.id,
    merchantId: row.merchant_id,
    recommendation: row.recommendation,
    confidence: Number(row.confidence),
    dataPoints: row.data_points,
    generatedAt: row.generated_at,
  }));
}

/**
 * Apply a recommendation (create actual campaign/promo)
 */
export async function applyRecommendation(
  recommendationId: string,
  userId: string
): Promise<{ success: boolean; createdEntityId?: string }> {
  const { rows } = await pool.query(`
    SELECT *
    FROM marketing_ai_recommendations
    WHERE id = $1
      AND status = 'suggested'
  `, [recommendationId]);

  if (rows.length === 0) {
    return { success: false };
  }

  const rec = rows[0];
  const recommendation: AIRecommendation = rec.recommendation;

  let createdEntityId: string | undefined;

  try {
    // Create appropriate entity based on recommendation type
    if (recommendation.type === 'promo_code') {
      const { rows: promoRows } = await pool.query(`
        INSERT INTO promo_codes (
          merchant_id,
          code,
          discount_type,
          discount_value,
          max_uses,
          valid_from,
          valid_until,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, now(), now() + interval '${recommendation.durationDays} days', $6)
        RETURNING id
      `, [
        rec.merchant_id,
        `AI${Date.now().toString(36).toUpperCase()}`,
        recommendation.discountType,
        recommendation.discountValue,
        1000, // Default max uses
        userId,
      ]);
      createdEntityId = promoRows[0].id;

      await pool.query(`
        UPDATE marketing_ai_recommendations
        SET status = 'applied',
            applied_by = $1,
            applied_at = now(),
            created_promo_code_id = $2
        WHERE id = $3
      `, [userId, createdEntityId, recommendationId]);
    } else if (recommendation.type === 'campaign') {
      const { rows: campaignRows } = await pool.query(`
        INSERT INTO marketing_campaigns (
          merchant_id,
          name,
          type,
          status,
          created_by
        ) VALUES ($1, $2, $3, 'active', $4)
        RETURNING id
      `, [
        rec.merchant_id,
        recommendation.message,
        recommendation.type,
        userId,
      ]);
      createdEntityId = campaignRows[0].id;

      await pool.query(`
        UPDATE marketing_ai_recommendations
        SET status = 'applied',
            applied_by = $1,
            applied_at = now(),
            created_campaign_id = $2
        WHERE id = $3
      `, [userId, createdEntityId, recommendationId]);
    }

    return { success: true, createdEntityId };
  } catch (error) {
    console.error('Error applying recommendation:', error);
    return { success: false };
  }
}

/**
 * Dismiss a recommendation
 */
export async function dismissRecommendation(
  recommendationId: string,
  userId: string,
  reason?: string
): Promise<boolean> {
  const { rowCount } = await pool.query(`
    UPDATE marketing_ai_recommendations
    SET status = 'dismissed',
        dismissed_by = $1,
        dismissed_at = now(),
        dismissal_reason = $2
    WHERE id = $3
      AND status = 'suggested'
  `, [userId, reason, recommendationId]);

  return rowCount > 0;
}
