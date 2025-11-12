/**
 * Predictive Pricing Engine
 *
 * AI-powered dynamic pricing with:
 * - Price optimization based on demand elasticity
 * - Churn risk prediction
 * - Competitive benchmarking
 * - Time-based pricing (happy hours)
 */

import { pool } from '../db';

export interface PriceRecommendation {
  id: string;
  merchantId: string;
  productId: string;
  currentPrice: number;
  suggestedPrice: number;
  priceChange: number;
  priceChangePct: number;
  confidence: number;
  reason: string;
  predictedImpact: {
    revenueUpliftPct: number;
    revenueUpliftAmount: number;
    volumeChangePct: number;
    churnRiskPct: number;
    marginImprovementPct: number;
  };
  zone?: string;
  expiresAt?: Date;
}

/**
 * Calculate price elasticity of demand
 */
export async function calculateElasticity(
  merchantId: string,
  productId: string
): Promise<number> {
  // Fetch historical sales data at different price points
  const { rows: sales } = await pool.query(`
    SELECT
      price,
      COUNT(*) as quantity_sold,
      DATE(created_at) as sale_date
    FROM orders
    WHERE merchant_id = $1
      AND product_id = $2
      AND status = 'completed'
      AND created_at > now() - interval '90 days'
    GROUP BY price, DATE(created_at)
    ORDER BY sale_date
  `, [merchantId, productId]);

  if (sales.length < 5) {
    // Not enough data, return moderate elasticity
    return -1.2;
  }

  // Group by price and calculate avg quantity
  const pricePoints = new Map<number, number>();
  sales.forEach((sale: any) => {
    const price = Number(sale.price);
    const qty = Number(sale.quantity_sold);
    pricePoints.set(price, (pricePoints.get(price) || 0) + qty);
  });

  if (pricePoints.size < 2) {
    return -1.2; // Need at least 2 different prices
  }

  // Calculate elasticity: % change in quantity / % change in price
  const prices = Array.from(pricePoints.keys()).sort((a, b) => a - b);
  const quantities = prices.map(p => pricePoints.get(p)!);

  // Simple linear elasticity calculation
  const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
  const avgQty = quantities.reduce((a, b) => a + b) / quantities.length;

  let elasticity = -1.2; // Default moderate

  if (prices.length >= 2) {
    const priceDiff = prices[prices.length - 1] - prices[0];
    const qtyDiff = quantities[quantities.length - 1] - quantities[0];

    if (priceDiff !== 0 && avgPrice !== 0 && avgQty !== 0) {
      elasticity = (qtyDiff / avgQty) / (priceDiff / avgPrice);
    }
  }

  // Store elasticity
  await pool.query(`
    INSERT INTO pricing_elasticity (
      merchant_id,
      product_id,
      elasticity_coefficient,
      optimal_price_range,
      calculated_from,
      confidence
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (merchant_id, product_id)
    DO UPDATE SET
      elasticity_coefficient = $3,
      last_updated = now()
  `, [
    merchantId,
    productId,
    elasticity,
    JSON.stringify({ min: avgPrice * 0.8, optimal: avgPrice, max: avgPrice * 1.3 }),
    JSON.stringify({ sales_records: sales.length, price_points_tested: pricePoints.size }),
    0.75,
  ]);

  return elasticity;
}

/**
 * Predict churn risk based on price change
 */
export function predictChurnRisk(
  priceChangePct: number,
  elasticity: number
): number {
  // Churn risk increases with price increases, especially for elastic products
  if (priceChangePct <= 0) {
    return 0; // No churn risk from price decrease
  }

  const baseChurnRate = 0.05; // 5% base churn
  const elasticityFactor = Math.abs(elasticity);

  // More elastic products → higher churn risk
  const churnRisk = baseChurnRate * (1 + (priceChangePct / 10) * elasticityFactor);

  return Math.min(churnRisk, 0.25); // Cap at 25%
}

/**
 * Generate AI price recommendation
 */
export async function generatePriceRecommendation(
  merchantId: string,
  productId: string,
  zone?: string
): Promise<PriceRecommendation> {
  // Fetch current product info
  const { rows: products } = await pool.query(`
    SELECT id, name, price, category, stock_quantity
    FROM products
    WHERE id = $1 AND merchant_id = $2
  `, [productId, merchantId]);

  if (products.length === 0) {
    throw new Error('Product not found');
  }

  const product = products[0];
  const currentPrice = Number(product.price);

  // Calculate elasticity
  const elasticity = await calculateElasticity(merchantId, productId);

  // Fetch recent sales performance
  const { rows: salesStats } = await pool.query(`
    SELECT
      COUNT(*) as total_sales,
      AVG(quantity) as avg_quantity,
      SUM(total_amount) as total_revenue
    FROM orders
    WHERE merchant_id = $1
      AND product_id = $2
      AND status = 'completed'
      AND created_at > now() - interval '30 days'
  `, [merchantId, productId]);

  const stats = salesStats[0];
  const totalSales = Number(stats.total_sales) || 0;
  const avgQuantity = Number(stats.avg_quantity) || 1;
  const totalRevenue = Number(stats.total_revenue) || 0;

  // Fetch competitor pricing (if available)
  const { rows: competitors } = await pool.query(`
    SELECT AVG(competitor_price) as avg_competitor_price
    FROM pricing_competitor_data
    WHERE product_category = $1
      AND collected_at > now() - interval '7 days'
      ${zone ? 'AND zone = $2' : ''}
  `, zone ? [product.category, zone] : [product.category]);

  const avgCompetitorPrice = Number(competitors[0]?.avg_competitor_price) || currentPrice;

  // AI PRICING LOGIC

  let suggestedPrice = currentPrice;
  let reason = '';
  const factors: any[] = [];

  // Factor 1: Demand (sales volume)
  if (totalSales > 50) {
    // High demand → can increase price
    const demandFactor = Math.min((totalSales - 50) / 100, 0.15);
    suggestedPrice *= (1 + demandFactor);
    factors.push({ type: 'high_demand', weight: 0.3, impact: `+${(demandFactor * 100).toFixed(1)}%` });
  } else if (totalSales < 10) {
    // Low demand → decrease price
    const demandFactor = 0.1;
    suggestedPrice *= (1 - demandFactor);
    factors.push({ type: 'low_demand', weight: 0.3, impact: `-${(demandFactor * 100).toFixed(1)}%` });
  }

  // Factor 2: Competitor pricing
  if (avgCompetitorPrice > 0) {
    const competitorDiff = (currentPrice - avgCompetitorPrice) / avgCompetitorPrice;

    if (competitorDiff > 0.15) {
      // 15%+ more expensive than competitors → reduce
      suggestedPrice *= 0.95;
      factors.push({ type: 'competitor_pricing', weight: 0.25, impact: '-5%' });
      reason = 'Prix supérieur aux concurrents (+15%)';
    } else if (competitorDiff < -0.15) {
      // 15%+ cheaper → can increase
      suggestedPrice *= 1.05;
      factors.push({ type: 'competitor_pricing', weight: 0.25, impact: '+5%' });
      reason = 'Opportunité d\'alignement marché';
    }
  }

  // Factor 3: Stock level
  const stockLevel = Number(product.stock_quantity) || 0;
  if (stockLevel < 10) {
    // Low stock → price surge
    suggestedPrice *= 1.10;
    factors.push({ type: 'low_stock', weight: 0.2, impact: '+10%' });
    reason = reason || 'Stock faible → augmentation stratégique';
  } else if (stockLevel > 100) {
    // Overstock → clearance
    suggestedPrice *= 0.92;
    factors.push({ type: 'overstock', weight: 0.2, impact: '-8%' });
    reason = reason || 'Surplus de stock → promotion clearance';
  }

  // Factor 4: Seasonality (simplified - check month)
  const currentMonth = new Date().getMonth();
  const peakMonths = [11, 12]; // Nov, Dec (Black Friday, Christmas)

  if (peakMonths.includes(currentMonth)) {
    suggestedPrice *= 1.08;
    factors.push({ type: 'seasonality', weight: 0.25, impact: '+8%' });
    reason = reason || 'Période de forte demande saisonnière';
  }

  // Apply elasticity constraint
  if (Math.abs(elasticity) > 1.5) {
    // Highly elastic → be conservative with price changes
    const diff = suggestedPrice - currentPrice;
    suggestedPrice = currentPrice + (diff * 0.7);
  }

  // Round to reasonable price
  suggestedPrice = Math.round(suggestedPrice / 10) * 10;

  // Calculate changes
  const priceChange = suggestedPrice - currentPrice;
  const priceChangePct = (priceChange / currentPrice) * 100;

  // Predict impact
  const volumeChangePct = priceChangePct * elasticity; // Elasticity formula
  const revenueUpliftPct = priceChangePct + volumeChangePct; // Price effect + volume effect
  const revenueUpliftAmount = (totalRevenue * revenueUpliftPct) / 100;
  const churnRiskPct = predictChurnRisk(priceChangePct, elasticity);
  const marginImprovementPct = priceChangePct * 0.7; // Assume 70% of price change is margin

  // Calculate confidence
  const confidence = Math.min(
    0.7 + (totalSales / 200) * 0.2 + (factors.length / 10) * 0.1,
    0.95
  );

  if (!reason) {
    reason = priceChangePct > 0 ? 'Optimisation basée sur analyse historique' : 'Ajustement compétitif recommandé';
  }

  // Save recommendation
  const { rows } = await pool.query(`
    INSERT INTO pricing_ai_recommendations (
      merchant_id,
      product_id,
      current_price,
      suggested_price,
      price_change,
      price_change_pct,
      confidence,
      reason,
      reasoning_data,
      predicted_impact,
      zone,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + interval '7 days')
    RETURNING *
  `, [
    merchantId,
    productId,
    currentPrice,
    suggestedPrice,
    priceChange,
    priceChangePct,
    confidence,
    reason,
    JSON.stringify({ factors, elasticity, sales_data: { total_sales: totalSales } }),
    JSON.stringify({
      revenue_uplift_pct: Math.round(revenueUpliftPct * 10) / 10,
      revenue_uplift_amount: Math.round(revenueUpliftAmount * 100) / 100,
      volume_change_pct: Math.round(volumeChangePct * 10) / 10,
      churn_risk_pct: Math.round(churnRiskPct * 1000) / 10,
      margin_improvement_pct: Math.round(marginImprovementPct * 10) / 10,
    }),
    zone,
  ]);

  console.log(`[Pricing AI] Generated recommendation for product ${productId}: ${currentPrice} → ${suggestedPrice} (${priceChangePct.toFixed(1)}%)`);

  return {
    id: rows[0].id,
    merchantId,
    productId,
    currentPrice,
    suggestedPrice,
    priceChange,
    priceChangePct,
    confidence,
    reason,
    predictedImpact: rows[0].predicted_impact,
    zone,
    expiresAt: rows[0].expires_at,
  };
}

/**
 * Apply price recommendation
 */
export async function applyPriceRecommendation(
  recommendationId: string,
  accepted: boolean,
  appliedPrice?: number
): Promise<any> {
  const { rows: recs } = await pool.query(`
    SELECT * FROM pricing_ai_recommendations WHERE id = $1
  `, [recommendationId]);

  if (recs.length === 0) {
    throw new Error('Recommendation not found');
  }

  const rec = recs[0];
  const finalPrice = appliedPrice || (accepted ? rec.suggested_price : rec.current_price);

  // Update product price if accepted
  if (accepted) {
    await pool.query(`
      UPDATE products
      SET price = $1, updated_at = now()
      WHERE id = $2
    `, [finalPrice, rec.product_id]);

    // Update recommendation status
    await pool.query(`
      UPDATE pricing_ai_recommendations
      SET status = 'applied'
      WHERE id = $1
    `, [recommendationId]);
  } else {
    await pool.query(`
      UPDATE pricing_ai_recommendations
      SET status = 'rejected'
      WHERE id = $1
    `, [recommendationId]);
  }

  // Log result
  const { rows: results } = await pool.query(`
    INSERT INTO pricing_ai_results (
      recommendation_id,
      accepted,
      applied_price,
      measurement_period
    ) VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [
    recommendationId,
    accepted,
    finalPrice,
    JSON.stringify({ start: new Date().toISOString().split('T')[0], days: 7 }),
  ]);

  console.log(`[Pricing AI] Applied recommendation ${recommendationId}: accepted=${accepted}, price=${finalPrice}`);

  return results[0];
}

/**
 * Get recommendations for merchant
 */
export async function getRecommendations(
  merchantId: string,
  status?: string
): Promise<PriceRecommendation[]> {
  let query = `
    SELECT * FROM pricing_ai_recommendations
    WHERE merchant_id = $1
  `;
  const params: any[] = [merchantId];

  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT 50`;

  const { rows } = await pool.query(query, params);

  return rows.map(row => ({
    id: row.id,
    merchantId: row.merchant_id,
    productId: row.product_id,
    currentPrice: Number(row.current_price),
    suggestedPrice: Number(row.suggested_price),
    priceChange: Number(row.price_change),
    priceChangePct: Number(row.price_change_pct),
    confidence: Number(row.confidence),
    reason: row.reason,
    predictedImpact: row.predicted_impact,
    zone: row.zone,
    expiresAt: row.expires_at,
  }));
}
