/**
 * Market Benchmarks API Routes
 *
 * Endpoints for accessing SIRA market intelligence and benchmarking
 */

import { Router, Request, Response } from 'express';
import { fetchMarketBenchmarks } from '../services/siraIntegration';
import { pool } from '../db';

export const benchmarksRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * GET /api/benchmarks
 * Get market benchmarks for merchant's industry and country
 */
benchmarksRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get merchant's industry and country
    const { rows: merchants } = await pool.query(`
      SELECT industry, country
      FROM merchants
      WHERE id = $1
    `, [merchantId]);

    if (merchants.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const merchant = merchants[0];
    const industry = req.query.industry as string || merchant.industry || 'e-commerce';
    const country = req.query.country as string || merchant.country || 'US';

    const benchmarks = await fetchMarketBenchmarks(merchantId, industry, country);

    if (!benchmarks) {
      return res.status(503).json({ error: 'Unable to fetch benchmarks at this time' });
    }

    res.json({
      success: true,
      data: benchmarks,
    });
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/benchmarks/history
 * Get historical benchmarks for trend analysis
 */
benchmarksRouter.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await pool.query(`
      SELECT
        id,
        industry,
        country,
        benchmark_data,
        merchant_comparison,
        recommendations,
        fetched_at
      FROM marketing_benchmarks
      WHERE merchant_id = $1
      ORDER BY fetched_at DESC
      LIMIT 12
    `, [merchantId]);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching benchmark history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
