/**
 * Anomalies API Routes
 *
 * Endpoints for viewing and managing detected anomalies
 */

import { Router, Request, Response } from 'express';
import { getAnomalies } from '../services/siraIntegration';
import { pool } from '../db';

export const anomaliesRouter = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    merchantId: string;
    role: string;
  };
}

/**
 * GET /api/anomalies
 * Get detected anomalies for merchant
 */
anomaliesRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = req.query.status as string | undefined;
    const anomalies = await getAnomalies(merchantId, status);

    res.json({
      success: true,
      data: anomalies,
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/anomalies/:id/resolve
 * Mark an anomaly as resolved
 */
anomaliesRouter.post('/:id/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rowCount } = await pool.query(`
      UPDATE marketing_anomalies
      SET status = 'resolved',
          resolved_by = $1,
          resolved_at = now(),
          resolution_notes = $2
      WHERE id = $3
        AND merchant_id = $4
    `, [userId, notes, id, req.user?.merchantId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    res.json({
      success: true,
      message: 'Anomaly resolved',
    });
  } catch (error) {
    console.error('Error resolving anomaly:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/anomalies/:id/false-positive
 * Mark an anomaly as false positive
 */
anomaliesRouter.post('/:id/false-positive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rowCount } = await pool.query(`
      UPDATE marketing_anomalies
      SET status = 'false_positive',
          resolved_by = $1,
          resolved_at = now()
      WHERE id = $2
        AND merchant_id = $3
    `, [userId, id, req.user?.merchantId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    res.json({
      success: true,
      message: 'Anomaly marked as false positive',
    });
  } catch (error) {
    console.error('Error marking false positive:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/anomalies/stats
 * Get anomaly statistics for dashboard
 */
anomaliesRouter.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.user?.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'detected') as unresolved,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high,
        COUNT(*) FILTER (WHERE detected_at > now() - interval '7 days') as recent
      FROM marketing_anomalies
      WHERE merchant_id = $1
    `, [merchantId]);

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error('Error fetching anomaly stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
