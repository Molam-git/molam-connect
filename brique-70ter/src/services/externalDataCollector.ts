/**
 * External Data Collector Service
 *
 * Collects marketing intelligence from:
 * - Web crawling (competitor pricing, offers)
 * - Public APIs (industry trends, benchmarks)
 * - Open datasets (seasonality, conversion rates)
 */

import { pool } from '../db';
import axios from 'axios';

export interface ExternalDataSource {
  sourceType: 'crawler' | 'api' | 'dataset' | 'benchmark';
  sourceName: string;
  dataCategory: 'pricing' | 'seasonality' | 'conversion_rates' | 'discount_rates' | 'churn_benchmarks';
  dataSummary: Record<string, any>;
  qualityScore: number;
}

export interface CrawlerJob {
  id: string;
  jobType: string;
  targetUrls: string[];
  filters?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    urlsCrawled: number;
    urlsTotal: number;
    dataCollected: number;
  };
  resultSummary?: Record<string, any>;
  priority: number;
}

/**
 * Collect industry benchmarks from public sources
 */
export async function collectIndustryBenchmarks(
  industry: string,
  country: string
): Promise<ExternalDataSource> {
  console.log(`[External Data] Collecting benchmarks for ${industry} in ${country}...`);

  // Mock data collection - in production, would call real APIs
  // Examples: Stripe Industry Reports, Shopify Trends, etc.

  const mockBenchmarks = {
    industry,
    country,
    year: 2025,
    avgDiscountRate: industry === 'e-commerce' ? 15.5 : 12.0,
    avgConversionRate: industry === 'e-commerce' ? 2.8 : 3.5,
    avgChurnRate: industry === 'saas' ? 5.2 : 8.5,
    avgLTV: industry === 'saas' ? 1250 : 450,
    peakSeasons: [
      { month: 11, name: 'November', factor: 2.1 }, // Black Friday
      { month: 12, name: 'December', factor: 2.5 }, // Holidays
    ],
    commonPromoTypes: [
      { type: 'percentage', usage: 65 },
      { type: 'fixed', usage: 25 },
      { type: 'free_shipping', usage: 40 },
    ],
    dataSource: 'Industry Report 2025',
    reliability: 'high',
  };

  const dataSummary = {
    records_count: 1,
    date_range: { start: '2024-01-01', end: '2024-12-31' },
    countries: [country],
    industries: [industry],
    key_insights: mockBenchmarks,
  };

  // Save to database
  const { rows } = await pool.query(`
    INSERT INTO marketing_ai_external_data (
      source_type,
      source_name,
      data_category,
      data_summary,
      quality_score,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, now() + interval '30 days')
    RETURNING *
  `, [
    'benchmark',
    `${industry}_${country}_report_2025`,
    'discount_rates',
    JSON.stringify(dataSummary),
    0.95,
  ]);

  console.log(`[External Data] Collected benchmarks for ${industry} in ${country}: ${mockBenchmarks.avgDiscountRate}% avg discount`);

  return {
    sourceType: 'benchmark',
    sourceName: rows[0].source_name,
    dataCategory: rows[0].data_category,
    dataSummary: rows[0].data_summary,
    qualityScore: Number(rows[0].quality_score),
  };
}

/**
 * Collect seasonal trend data
 */
export async function collectSeasonalTrends(
  industry: string
): Promise<ExternalDataSource> {
  console.log(`[External Data] Collecting seasonal trends for ${industry}...`);

  // Mock seasonal data - in production would analyze historical patterns
  const seasonalData = {
    industry,
    patterns: [
      { name: 'New Year Sales', month: 1, uplift: 1.3, duration_days: 15 },
      { name: 'Valentine\'s Day', month: 2, uplift: 1.5, duration_days: 7 },
      { name: 'Easter', month: 4, uplift: 1.2, duration_days: 10 },
      { name: 'Back to School', month: 8, uplift: 1.6, duration_days: 30 },
      { name: 'Black Friday', month: 11, uplift: 2.5, duration_days: 3 },
      { name: 'Cyber Monday', month: 11, uplift: 2.3, duration_days: 1 },
      { name: 'Christmas', month: 12, uplift: 2.8, duration_days: 20 },
    ],
    dataSource: 'Historical Analysis 2020-2024',
  };

  const dataSummary = {
    records_count: seasonalData.patterns.length,
    industries: [industry],
    key_insights: seasonalData,
  };

  const { rows } = await pool.query(`
    INSERT INTO marketing_ai_external_data (
      source_type,
      source_name,
      data_category,
      data_summary,
      quality_score,
      expires_at
    ) VALUES ($1, $2, $3, $4, $5, now() + interval '90 days')
    RETURNING *
  `, [
    'dataset',
    `seasonal_trends_${industry}_2025`,
    'seasonality',
    JSON.stringify(dataSummary),
    0.90,
  ]);

  console.log(`[External Data] Collected ${seasonalData.patterns.length} seasonal patterns for ${industry}`);

  return {
    sourceType: 'dataset',
    sourceName: rows[0].source_name,
    dataCategory: rows[0].data_category,
    dataSummary: rows[0].data_summary,
    qualityScore: Number(rows[0].quality_score),
  };
}

/**
 * Fetch data from public APIs (e.g., currency rates, economic indicators)
 */
export async function fetchPublicAPIData(
  apiName: string,
  category: string
): Promise<ExternalDataSource | null> {
  console.log(`[External Data] Fetching from public API: ${apiName}...`);

  try {
    // Example: Mock API call for economic indicators
    // In production: axios.get('https://api.example.com/indicators')

    const mockAPIData = {
      apiName,
      category,
      timestamp: new Date().toISOString(),
      data: {
        gdp_growth: 2.3,
        inflation_rate: 3.1,
        consumer_confidence_index: 105.2,
        unemployment_rate: 4.1,
      },
      source: 'Economic Indicators API',
    };

    const dataSummary = {
      records_count: 1,
      api_name: apiName,
      key_insights: mockAPIData.data,
    };

    const { rows } = await pool.query(`
      INSERT INTO marketing_ai_external_data (
        source_type,
        source_name,
        data_category,
        data_summary,
        quality_score,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
      RETURNING *
    `, [
      'api',
      apiName,
      category,
      JSON.stringify(dataSummary),
      0.85,
    ]);

    return {
      sourceType: 'api',
      sourceName: rows[0].source_name,
      dataCategory: rows[0].data_category,
      dataSummary: rows[0].data_summary,
      qualityScore: Number(rows[0].quality_score),
    };
  } catch (error) {
    console.error(`[External Data] Error fetching from ${apiName}:`, error);
    return null;
  }
}

/**
 * Create a crawler job (to be processed by worker)
 */
export async function createCrawlerJob(
  jobType: string,
  targetUrls: string[],
  filters?: Record<string, any>,
  priority: number = 5
): Promise<CrawlerJob> {
  const { rows } = await pool.query(`
    INSERT INTO marketing_ai_crawler_jobs (
      job_type,
      target_urls,
      filters,
      priority,
      status,
      progress
    ) VALUES ($1, $2, $3, $4, 'pending', '{"urls_crawled": 0, "urls_total": ${targetUrls.length}, "data_collected": 0}')
    RETURNING *
  `, [
    jobType,
    targetUrls,
    filters ? JSON.stringify(filters) : null,
    priority,
  ]);

  console.log(`[External Data] Created crawler job ${rows[0].id}: ${jobType} with ${targetUrls.length} URLs`);

  return {
    id: rows[0].id,
    jobType: rows[0].job_type,
    targetUrls: rows[0].target_urls,
    filters: rows[0].filters,
    status: rows[0].status,
    progress: rows[0].progress,
    resultSummary: rows[0].result_summary,
    priority: rows[0].priority,
  };
}

/**
 * Process a crawler job (simplified web scraping)
 */
export async function processCrawlerJob(jobId: string): Promise<boolean> {
  // Update status to running
  await pool.query(`
    UPDATE marketing_ai_crawler_jobs
    SET status = 'running', started_at = now()
    WHERE id = $1
  `, [jobId]);

  console.log(`[External Data] Processing crawler job ${jobId}...`);

  try {
    // Fetch job details
    const { rows: jobs } = await pool.query(`
      SELECT * FROM marketing_ai_crawler_jobs WHERE id = $1
    `, [jobId]);

    if (jobs.length === 0) {
      throw new Error('Job not found');
    }

    const job = jobs[0];

    // Mock crawling - in production would use Cheerio + Axios or Puppeteer
    const mockResults = {
      urls_crawled: job.target_urls.length,
      competitor_offers: [
        { competitor: 'Competitor A', discount: '20% off', type: 'percentage' },
        { competitor: 'Competitor B', discount: 'Buy 2 Get 1 Free', type: 'bogo' },
        { competitor: 'Competitor C', discount: 'Free Shipping', type: 'free_shipping' },
      ],
      avg_discount_rate: 17.5,
      most_common_type: 'percentage',
      insights: 'Competitors heavily focus on percentage discounts, avg 15-20%',
    };

    // Save results
    await pool.query(`
      UPDATE marketing_ai_crawler_jobs
      SET status = 'completed',
          completed_at = now(),
          progress = $1,
          result_summary = $2
      WHERE id = $3
    `, [
      JSON.stringify({
        urls_crawled: job.target_urls.length,
        urls_total: job.target_urls.length,
        data_collected: mockResults.competitor_offers.length,
      }),
      JSON.stringify(mockResults),
      jobId,
    ]);

    // Store crawled data as external data
    await pool.query(`
      INSERT INTO marketing_ai_external_data (
        source_type,
        source_name,
        data_category,
        data_summary,
        quality_score
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      'crawler',
      `crawler_job_${jobId}`,
      'discount_rates',
      JSON.stringify({
        job_type: job.job_type,
        records_count: mockResults.competitor_offers.length,
        key_insights: mockResults,
      }),
      0.75, // Lower quality for crawler data (can be noisy)
    ]);

    console.log(`[External Data] Completed crawler job ${jobId}: ${mockResults.urls_crawled} URLs, ${mockResults.competitor_offers.length} offers found`);

    return true;
  } catch (error) {
    console.error(`[External Data] Error processing crawler job ${jobId}:`, error);

    await pool.query(`
      UPDATE marketing_ai_crawler_jobs
      SET status = 'failed',
          completed_at = now(),
          error_message = $1
      WHERE id = $2
    `, [
      (error as Error).message,
      jobId,
    ]);

    return false;
  }
}

/**
 * Get pending crawler jobs
 */
export async function getPendingCrawlerJobs(limit: number = 10): Promise<CrawlerJob[]> {
  const { rows } = await pool.query(`
    SELECT *
    FROM marketing_ai_crawler_jobs
    WHERE status = 'pending'
    ORDER BY priority ASC, scheduled_at ASC NULLS LAST
    LIMIT $1
  `, [limit]);

  return rows.map(row => ({
    id: row.id,
    jobType: row.job_type,
    targetUrls: row.target_urls,
    filters: row.filters,
    status: row.status,
    progress: row.progress,
    resultSummary: row.result_summary,
    priority: row.priority,
  }));
}

/**
 * Get all external data sources
 */
export async function getExternalData(
  sourceType?: string,
  category?: string,
  limit: number = 50
): Promise<any[]> {
  let query = `SELECT * FROM marketing_ai_external_data`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (sourceType) {
    conditions.push(`source_type = $${conditions.length + 1}`);
    params.push(sourceType);
  }

  if (category) {
    conditions.push(`data_category = $${conditions.length + 1}`);
    params.push(category);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY collected_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Collect all available external data for training enrichment
 */
export async function collectAllExternalData(
  industry: string,
  country: string
): Promise<void> {
  console.log(`[External Data] Starting comprehensive data collection for ${industry} in ${country}...`);

  // Collect benchmarks
  await collectIndustryBenchmarks(industry, country);

  // Collect seasonal trends
  await collectSeasonalTrends(industry);

  // Collect from public APIs (mock examples)
  await fetchPublicAPIData('economic_indicators_api', 'conversion_rates');

  console.log('[External Data] Comprehensive data collection completed');
}
