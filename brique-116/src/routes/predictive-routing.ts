/**
 * Brique 116sexies: Predictive Routing - API Routes
 * API endpoints for ML-based route forecasting
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { spawn } from 'child_process';
import path from 'path';

const router = express.Router();

/**
 * GET /api/routing/forecasts
 * Get route forecasts for a merchant/currency
 */
router.get('/forecasts', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { merchantId, currency, date } = req.query;

    if (!merchantId || !currency) {
      return res.status(400).json({ error: 'merchantId and currency are required' });
    }

    const forecastDate = date || new Date().toISOString().split('T')[0];

    const { rows } = await db.query(
      `SELECT * FROM routing_forecasts
       WHERE merchant_id = $1 AND currency = $2 AND forecast_date = $3
       ORDER BY sira_confidence DESC`,
      [merchantId, currency, forecastDate]
    );

    res.json({
      success: true,
      forecasts: rows,
      count: rows.length,
      date: forecastDate,
    });
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/forecasts/best
 * Get best predicted route for today
 */
router.get('/forecasts/best', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { merchantId, currency } = req.query;

    if (!merchantId || !currency) {
      return res.status(400).json({ error: 'merchantId and currency are required' });
    }

    const { rows } = await db.query(
      'SELECT * FROM get_best_predicted_route($1, $2)',
      [merchantId, currency]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No forecasts found' });
    }

    res.json({
      success: true,
      bestRoute: rows[0],
    });
  } catch (error) {
    console.error('Error fetching best route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/routing/forecasts/generate
 * Generate new forecasts using Sira engine
 */
router.post('/forecasts/generate', async (req: Request, res: Response) => {
  try {
    const { merchantId, currency, routes, lookbackDays = 30 } = req.body;

    if (!merchantId || !currency || !routes) {
      return res.status(400).json({ error: 'merchantId, currency, and routes are required' });
    }

    // Call Python Sira engine
    const pythonScript = path.join(__dirname, '..', 'sira', 'predictive-router.py');
    const pythonProcess = spawn('python', [
      '-c',
      `
import sys
sys.path.append('${path.dirname(pythonScript)}')
from predictive_router import PredictiveRouter
import json

router = PredictiveRouter("${process.env.DATABASE_URL}")
forecasts = router.generate_forecasts(
    "${merchantId}",
    "${currency}",
    ${JSON.stringify(routes)},
    ${lookbackDays}
)
print(json.dumps(forecasts, default=str))
router.close()
      `,
    ]);

    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python error:', error);
        return res.status(500).json({ error: 'Failed to generate forecasts', details: error });
      }

      try {
        const forecasts = JSON.parse(result);
        res.json({
          success: true,
          forecasts,
          count: forecasts.length,
        });
      } catch (parseError) {
        res.status(500).json({ error: 'Failed to parse forecasts' });
      }
    });
  } catch (error) {
    console.error('Error generating forecasts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/routing/forecasts/history
 * Get forecast history for a route
 */
router.get('/forecasts/history', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { merchantId, currency, route, days = 7 } = req.query;

    if (!merchantId || !currency || !route) {
      return res.status(400).json({ error: 'merchantId, currency, and route are required' });
    }

    const { rows } = await db.query(
      `SELECT * FROM routing_forecasts
       WHERE merchant_id = $1 AND currency = $2 AND route = $3
       AND forecast_date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY forecast_date DESC`,
      [merchantId, currency, route]
    );

    res.json({
      success: true,
      history: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching forecast history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/routing/forecasts/cleanup
 * Cleanup old forecasts (admin only)
 */
router.delete('/forecasts/cleanup', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;

    await db.query('SELECT cleanup_old_forecasts()');

    res.json({
      success: true,
      message: 'Old forecasts cleaned up',
    });
  } catch (error) {
    console.error('Error cleaning up forecasts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
