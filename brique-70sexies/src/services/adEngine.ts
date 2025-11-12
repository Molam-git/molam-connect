/**
 * Brique 70sexies - AI Social Ads Generator
 * Main Ad Generation Engine (Sira Social Engine)
 */

import pool from '../db';
import { generateCopy, GeneratedCopy } from './copywritingService';
import { generateVisual, generateCarousel, generateVideoAd, GeneratedVisual } from './visualGenerator';
import { optimizeTargeting, recommendBudget, OptimizedTargeting, BudgetRecommendation } from './targetingOptimizer';

export interface AdGenerationParams {
  merchantId: string;
  platform: 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'twitter';
  objective: 'awareness' | 'traffic' | 'engagement' | 'conversions' | 'app_installs' | 'video_views';
  productName?: string;
  productCategory?: string;
  budget?: number;
  currency?: string;
  format?: 'image' | 'video' | 'carousel';
  desiredConversions?: number;
  avgOrderValue?: number;
  existingCustomerData?: any;
}

export interface GeneratedAd {
  id: string;
  merchantId: string;
  platform: string;
  campaignName: string;
  objective: string;

  // Content
  title: string;
  copyText: string;
  ctaButton: string;
  mediaUrl: string;
  mediaType: string;

  // Targeting
  targeting: OptimizedTargeting;
  audienceSizeEstimate: number;

  // Budget
  budget: number;
  currency: string;
  budgetType: string;
  budgetRecommendation: BudgetRecommendation;

  // AI Metadata
  aiConfidenceScore: number;
  generatedBy: string;

  status: string;
  createdAt: Date;
}

/**
 * Generate complete social media ad campaign
 */
export async function generateSocialAd(params: AdGenerationParams): Promise<GeneratedAd> {
  const {
    merchantId,
    platform,
    objective,
    productName,
    productCategory = 'ecommerce',
    budget = 50,
    currency = 'USD',
    format = 'image',
    desiredConversions = 10,
    avgOrderValue = 50,
    existingCustomerData
  } = params;

  // Step 1: Fetch merchant data and insights
  const merchantData = await fetchMerchantData(merchantId);
  const topProduct = productName || await getTopProduct(merchantId);

  // Step 2: Generate ad copy
  const copy = generateCopy({
    platform,
    objective,
    productName: topProduct,
    productCategory,
    tone: platform === 'linkedin' ? 'professional' : platform === 'tiktok' ? 'trendy' : 'casual'
  });

  // Step 3: Generate visuals
  let visual: GeneratedVisual;
  if (format === 'video') {
    visual = await generateVideoAd({
      productName: topProduct,
      productCategory,
      duration: platform === 'tiktok' ? 15 : 10,
      style: 'modern',
      platform
    });
  } else if (format === 'carousel') {
    const carouselImages = await generateCarousel({
      platform,
      format: 'image',
      productName: topProduct,
      productCategory,
      style: 'vibrant'
    }, 3);
    visual = carouselImages[0]; // Primary image
  } else {
    visual = await generateVisual({
      platform,
      format: 'image',
      productName: topProduct,
      productCategory,
      style: 'modern',
      includeText: true,
      textOverlay: copy.title
    });
  }

  // Step 4: Optimize targeting
  const targeting = optimizeTargeting({
    platform,
    objective,
    productCategory,
    merchantCountry: merchantData.country || 'US',
    budget,
    existingCustomerData
  });

  // Step 5: Generate budget recommendation
  const budgetRec = recommendBudget({
    platform,
    objective,
    targetAudienceSize: targeting.audienceSizeEstimate,
    desiredConversions,
    avgOrderValue
  });

  // Step 6: Calculate AI confidence score
  const aiConfidenceScore = calculateConfidenceScore({
    copyQuality: 0.85,
    visualQuality: visual.confidenceScore,
    targetingQuality: scoreTargetingQuality(targeting, budget),
    budgetAdequacy: budget >= budgetRec.dailyBudget ? 0.9 : 0.6
  });

  // Step 7: Save to database
  const campaignName = `${platform} - ${topProduct} - ${objective}`;

  const result = await pool.query(
    `INSERT INTO ai_social_ads
     (merchant_id, platform, campaign_name, objective, title, copy_text, cta_button,
      media_url, media_type, targeting, audience_size_estimate, budget, currency,
      budget_type, ai_confidence_score, generated_by, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
     RETURNING *`,
    [
      merchantId,
      platform,
      campaignName,
      objective,
      copy.title,
      copy.body + (copy.hashtags ? '\n\n' + copy.hashtags.map(h => '#' + h).join(' ') : ''),
      copy.cta,
      visual.url,
      format,
      JSON.stringify(targeting),
      targeting.audienceSizeEstimate,
      budget,
      currency,
      'daily',
      aiConfidenceScore,
      'sira_ai',
      'draft'
    ]
  );

  const ad = result.rows[0];

  // Step 8: Save creative
  await pool.query(
    `INSERT INTO ai_social_ad_creatives
     (ad_id, creative_type, url, thumbnail_url, width, height, file_size_bytes, format,
      generation_prompt, generation_model, performance_score, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      ad.id,
      format,
      visual.url,
      visual.thumbnailUrl,
      visual.width,
      visual.height,
      visual.fileSize,
      visual.format,
      visual.generationPrompt,
      visual.generationModel,
      visual.confidenceScore
    ]
  );

  return {
    ...ad,
    targeting,
    budgetRecommendation: budgetRec
  };
}

/**
 * Fetch merchant data
 */
async function fetchMerchantData(merchantId: string): Promise<any> {
  // Mock data - in production, fetch from merchants table
  return {
    id: merchantId,
    name: 'MoLam Store',
    country: 'SN',
    category: 'ecommerce'
  };
}

/**
 * Get top-selling product
 */
async function getTopProduct(merchantId: string): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT product_name, COUNT(*) as sales
       FROM orders
       WHERE merchant_id = $1
       GROUP BY product_name
       ORDER BY sales DESC
       LIMIT 1`,
      [merchantId]
    );

    return result.rows[0]?.product_name || 'Produit Vedette';
  } catch (error) {
    return 'Produit Vedette';
  }
}

/**
 * Calculate overall AI confidence score
 */
function calculateConfidenceScore(scores: {
  copyQuality: number;
  visualQuality: number;
  targetingQuality: number;
  budgetAdequacy: number;
}): number {
  const weights = {
    copyQuality: 0.25,
    visualQuality: 0.30,
    targetingQuality: 0.30,
    budgetAdequacy: 0.15
  };

  const weighted =
    scores.copyQuality * weights.copyQuality +
    scores.visualQuality * weights.visualQuality +
    (scores.targetingQuality / 100) * weights.targetingQuality +
    scores.budgetAdequacy * weights.budgetAdequacy;

  return Math.round(weighted * 100) / 100;
}

/**
 * Score targeting quality (imported from targetingOptimizer)
 */
function scoreTargetingQuality(targeting: OptimizedTargeting, budget: number): number {
  let score = 50;
  const audienceTobudgetRatio = targeting.audienceSizeEstimate / budget;
  if (audienceTobudgetRatio > 5000 && audienceTobudgetRatio < 50000) score += 20;
  if (targeting.interests.length >= 3 && targeting.interests.length <= 7) score += 15;
  if (targeting.ageMax - targeting.ageMin >= 15 && targeting.ageMax - targeting.ageMin <= 25) score += 10;
  if (targeting.countries.length <= 3) score += 10;
  if (targeting.lookalike) score += 10;
  return Math.min(Math.max(score, 0), 100);
}

/**
 * Get ad by ID
 */
export async function getAd(adId: string): Promise<any> {
  const result = await pool.query(
    'SELECT * FROM ai_social_ads WHERE id = $1',
    [adId]
  );

  if (result.rows.length === 0) {
    throw new Error('Ad not found');
  }

  return result.rows[0];
}

/**
 * List ads for merchant
 */
export async function listAds(
  merchantId: string,
  filters?: { platform?: string; status?: string; limit?: number }
): Promise<any[]> {
  let query = 'SELECT * FROM ai_social_ads WHERE merchant_id = $1';
  const params: any[] = [merchantId];
  let paramIndex = 2;

  if (filters?.platform) {
    query += ` AND platform = $${paramIndex}`;
    params.push(filters.platform);
    paramIndex++;
  }

  if (filters?.status) {
    query += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(filters.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Update ad status
 */
export async function updateAdStatus(
  adId: string,
  status: 'draft' | 'pending_review' | 'approved' | 'running' | 'paused' | 'completed' | 'rejected'
): Promise<void> {
  await pool.query(
    'UPDATE ai_social_ads SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, adId]
  );
}

/**
 * Track ad performance
 */
export async function trackPerformance(
  adId: string,
  date: Date,
  metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
    revenue?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  }
): Promise<void> {
  const {
    impressions = 0,
    clicks = 0,
    conversions = 0,
    spend = 0,
    revenue = 0,
    likes = 0,
    shares = 0,
    comments = 0
  } = metrics;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpcv = conversions > 0 ? spend / conversions : 0;

  await pool.query(
    `INSERT INTO ai_social_ad_performance
     (ad_id, date, impressions, clicks, ctr, conversions, conversion_rate, spend, revenue,
      roas, cost_per_click, cost_per_conversion, likes, shares, comments, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     ON CONFLICT (ad_id, date, COALESCE(hour, -1))
     DO UPDATE SET
       impressions = ai_social_ad_performance.impressions + EXCLUDED.impressions,
       clicks = ai_social_ad_performance.clicks + EXCLUDED.clicks,
       conversions = ai_social_ad_performance.conversions + EXCLUDED.conversions,
       spend = ai_social_ad_performance.spend + EXCLUDED.spend,
       revenue = ai_social_ad_performance.revenue + EXCLUDED.revenue`,
    [
      adId,
      date,
      impressions,
      clicks,
      ctr,
      conversions,
      conversionRate,
      spend,
      revenue,
      roas,
      cpc,
      cpcv,
      likes,
      shares,
      comments
    ]
  );

  // Update aggregate performance on ad
  await pool.query(
    `UPDATE ai_social_ads
     SET performance = jsonb_set(
       jsonb_set(
         jsonb_set(
           jsonb_set(
             performance,
             '{impressions}',
             to_jsonb(COALESCE((performance->>'impressions')::int, 0) + $2)
           ),
           '{clicks}',
           to_jsonb(COALESCE((performance->>'clicks')::int, 0) + $3)
         ),
         '{conversions}',
         to_jsonb(COALESCE((performance->>'conversions')::int, 0) + $4)
       ),
       '{revenue}',
       to_jsonb(COALESCE((performance->>'revenue')::numeric, 0) + $5)
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [adId, impressions, clicks, conversions, revenue]
  );
}

/**
 * Get ad performance report
 */
export async function getPerformanceReport(adId: string, days: number = 7): Promise<any> {
  const ad = await getAd(adId);

  const performanceResult = await pool.query(
    `SELECT
       date,
       SUM(impressions) as impressions,
       SUM(clicks) as clicks,
       AVG(ctr) as ctr,
       SUM(conversions) as conversions,
       AVG(conversion_rate) as conversion_rate,
       SUM(spend) as spend,
       SUM(revenue) as revenue,
       AVG(roas) as roas
     FROM ai_social_ad_performance
     WHERE ad_id = $1 AND date >= CURRENT_DATE - $2
     GROUP BY date
     ORDER BY date DESC`,
    [adId, days]
  );

  const totalResult = await pool.query(
    `SELECT
       SUM(impressions) as total_impressions,
       SUM(clicks) as total_clicks,
       SUM(conversions) as total_conversions,
       SUM(spend) as total_spend,
       SUM(revenue) as total_revenue
     FROM ai_social_ad_performance
     WHERE ad_id = $1`,
    [adId]
  );

  const totals = totalResult.rows[0] || {};

  return {
    adId,
    platform: ad.platform,
    status: ad.status,
    budget: ad.budget,
    timeline: performanceResult.rows,
    totals: {
      impressions: parseInt(totals.total_impressions) || 0,
      clicks: parseInt(totals.total_clicks) || 0,
      conversions: parseInt(totals.total_conversions) || 0,
      spend: parseFloat(totals.total_spend) || 0,
      revenue: parseFloat(totals.total_revenue) || 0,
      ctr: totals.total_impressions > 0 ? ((totals.total_clicks / totals.total_impressions) * 100).toFixed(2) + '%' : '0%',
      roas: totals.total_spend > 0 ? (totals.total_revenue / totals.total_spend).toFixed(2) : '0'
    }
  };
}

/**
 * Generate AI recommendations for ad
 */
export async function generateRecommendations(adId: string): Promise<void> {
  const ad = await getAd(adId);
  const performance = ad.performance || {};

  const recommendations: any[] = [];

  // Recommendation 1: Low CTR → Change creative
  const impressions = performance.impressions || 0;
  const clicks = performance.clicks || 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  if (impressions > 1000 && ctr < 1.0) {
    recommendations.push({
      type: 'change_creative',
      title: 'Taux de clic faible',
      description: `Votre CTR (${ctr.toFixed(2)}%) est inférieur à la moyenne. Essayez un nouveau visuel ou slogan.`,
      priority: 'high',
      estimatedImpact: { metric: 'clicks', increase_pct: 30, confidence: 0.75 }
    });
  }

  // Recommendation 2: Good performance → Increase budget
  if (ctr > 2.0 && ad.status === 'running') {
    recommendations.push({
      type: 'increase_budget',
      title: 'Performance excellente',
      description: `Votre annonce performe bien (CTR ${ctr.toFixed(2)}%). Augmentez le budget pour maximiser les résultats.`,
      priority: 'medium',
      estimatedImpact: { metric: 'conversions', increase_pct: 50, confidence: 0.85 }
    });
  }

  // Recommendation 3: High spend, low conversions → Adjust targeting
  const spend = performance.spend || 0;
  const conversions = performance.conversions || 0;
  if (spend > ad.budget * 3 && conversions < 5) {
    recommendations.push({
      type: 'adjust_targeting',
      title: 'Ciblage à optimiser',
      description: 'Dépenses élevées mais peu de conversions. Affinez votre audience.',
      priority: 'urgent',
      estimatedImpact: { metric: 'cost_per_conversion', decrease_pct: 40, confidence: 0.70 }
    });
  }

  // Save recommendations
  for (const rec of recommendations) {
    await pool.query(
      `INSERT INTO ai_social_ad_recommendations
       (merchant_id, ad_id, recommendation_type, title, description, priority, estimated_impact, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [
        ad.merchant_id,
        adId,
        rec.type,
        rec.title,
        rec.description,
        rec.priority,
        JSON.stringify(rec.estimatedImpact)
      ]
    );
  }
}
