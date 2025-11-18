// Reconciliation REST API routes for Ops UI
import { Router, Request, Response } from 'express';
import { pool } from '../utils/db';
import {
  getQueueItems,
  assignQueueItem,
  resolveQueueItem,
  ignoreQueueItem,
  createAdjustment,
} from '../services/reconciliation-queue';

const router = Router();

/**
 * GET /api/reco/lines
 * List bank statement lines with filters
 */
router.get('/lines', async (req: Request, res: Response) => {
  try {
    const {
      status = 'unmatched',
      bank_profile_id,
      date_from,
      date_to,
      min_amount,
      max_amount,
      currency,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = `
      SELECT
        l.id,
        l.bank_profile_id,
        l.statement_date,
        l.value_date,
        l.amount,
        l.currency,
        l.description,
        l.reference,
        l.provider_ref,
        l.beneficiary_name,
        l.transaction_type,
        l.reconciliation_status,
        l.matched_at,
        l.created_at,
        m.matched_type,
        m.matched_entity_id,
        m.match_score,
        m.match_rule
      FROM bank_statement_lines l
      LEFT JOIN reconciliation_matches m ON m.bank_statement_line_id = l.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND l.reconciliation_status = $${paramIndex++}`;
      params.push(status);
    }

    if (bank_profile_id) {
      query += ` AND l.bank_profile_id = $${paramIndex++}`;
      params.push(bank_profile_id);
    }

    if (date_from) {
      query += ` AND l.value_date >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND l.value_date <= $${paramIndex++}`;
      params.push(date_to);
    }

    if (min_amount) {
      query += ` AND ABS(l.amount) >= $${paramIndex++}`;
      params.push(min_amount);
    }

    if (max_amount) {
      query += ` AND ABS(l.amount) <= $${paramIndex++}`;
      params.push(max_amount);
    }

    if (currency) {
      query += ` AND l.currency = $${paramIndex++}`;
      params.push(currency);
    }

    query += ` ORDER BY l.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM').split('ORDER BY')[0];
    const { rows: [{ count }] } = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      data: rows,
      pagination: {
        total: parseInt(count),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error: any) {
    console.error('Error fetching lines:', error);
    res.status(500).json({ error: 'Failed to fetch lines', message: error.message });
  }
});

/**
 * GET /api/reco/lines/:id
 * Get single line with full details and candidates
 */
router.get('/lines/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch line
    const { rows: [line] } = await pool.query(
      `SELECT * FROM bank_statement_lines WHERE id = $1`,
      [id]
    );

    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Fetch match if exists
    const { rows: [match] } = await pool.query(
      `SELECT * FROM reconciliation_matches WHERE bank_statement_line_id = $1`,
      [id]
    );

    // Fetch queue entry if exists
    const { rows: [queueEntry] } = await pool.query(
      `SELECT * FROM reconciliation_queue WHERE bank_statement_line_id = $1`,
      [id]
    );

    // Fetch candidate payouts
    const { rows: candidates } = await pool.query(
      `SELECT id, amount, currency, reference_code, provider_ref, created_at, status
       FROM payouts
       WHERE currency = $1
       AND ABS(amount) BETWEEN $2 AND $3
       AND created_at BETWEEN $4 AND $5
       ORDER BY ABS(ABS(amount) - $6) ASC
       LIMIT 10`,
      [
        line.currency,
        Math.abs(line.amount) * 0.95,
        Math.abs(line.amount) * 1.05,
        new Date(new Date(line.value_date).getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(new Date(line.value_date).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        Math.abs(line.amount),
      ]
    );

    res.json({
      line,
      match,
      queue_entry: queueEntry,
      candidates,
    });
  } catch (error: any) {
    console.error('Error fetching line:', error);
    res.status(500).json({ error: 'Failed to fetch line', message: error.message });
  }
});

/**
 * GET /api/reco/queue
 * Get reconciliation queue items
 */
router.get('/queue', async (req: Request, res: Response) => {
  try {
    const {
      status = 'open',
      severity,
      assigned_to,
      limit = '50',
      offset = '0',
    } = req.query;

    const items = await getQueueItems({
      status: status as string,
      severity: severity as string,
      assignedTo: assigned_to as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({ data: items });
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue', message: error.message });
  }
});

/**
 * POST /api/reco/queue/:id/assign
 * Assign queue item to user
 */
router.post('/queue/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    await assignQueueItem(id, user_id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error assigning queue item:', error);
    res.status(500).json({ error: 'Failed to assign queue item', message: error.message });
  }
});

/**
 * POST /api/reco/queue/:id/resolve
 * Resolve queue item with manual match
 */
router.post('/queue/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, matched_type, matched_entity_id, notes } = req.body;

    if (!user_id || !matched_type || !matched_entity_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await resolveQueueItem(id, user_id, {
      matchedType: matched_type,
      matchedEntityId: matched_entity_id,
      notes,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resolving queue item:', error);
    res.status(500).json({ error: 'Failed to resolve queue item', message: error.message });
  }
});

/**
 * POST /api/reco/queue/:id/ignore
 * Ignore/dismiss queue item
 */
router.post('/queue/:id/ignore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, notes } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    await ignoreQueueItem(id, user_id, notes);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error ignoring queue item:', error);
    res.status(500).json({ error: 'Failed to ignore queue item', message: error.message });
  }
});

/**
 * POST /api/reco/adjustments
 * Create reconciliation adjustment
 */
router.post('/adjustments', async (req: Request, res: Response) => {
  try {
    const { line_id, payout_id, adjustment_type, original_amount, adjusted_amount, currency, reason } = req.body;

    if (!line_id || !adjustment_type || !original_amount || !adjusted_amount || !currency || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const adjustmentId = await createAdjustment(line_id, payout_id, {
      adjustmentType: adjustment_type,
      originalAmount: parseFloat(original_amount),
      adjustedAmount: parseFloat(adjusted_amount),
      currency,
      reason,
    });

    res.json({ success: true, adjustment_id: adjustmentId });
  } catch (error: any) {
    console.error('Error creating adjustment:', error);
    res.status(500).json({ error: 'Failed to create adjustment', message: error.message });
  }
});

/**
 * GET /api/reco/stats
 * Get reconciliation statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { bank_profile_id, date_from, date_to } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (bank_profile_id) {
      whereClause += ` AND bank_profile_id = $${paramIndex++}`;
      params.push(bank_profile_id);
    }

    if (date_from) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(date_to);
    }

    const { rows: [stats] } = await pool.query(
      `SELECT
        COUNT(*) as total_lines,
        COUNT(*) FILTER (WHERE reconciliation_status = 'matched') as matched_count,
        COUNT(*) FILTER (WHERE reconciliation_status = 'unmatched') as unmatched_count,
        COUNT(*) FILTER (WHERE reconciliation_status = 'manual_review') as manual_review_count,
        COUNT(*) FILTER (WHERE reconciliation_status = 'suspicious') as suspicious_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE reconciliation_status = 'matched') / NULLIF(COUNT(*), 0), 2) as match_rate_pct,
        SUM(amount) FILTER (WHERE reconciliation_status = 'matched') as matched_amount,
        SUM(amount) FILTER (WHERE reconciliation_status = 'unmatched') as unmatched_amount
      FROM bank_statement_lines
      ${whereClause}`,
      params
    );

    const { rows: queueStats } = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM reconciliation_queue
       WHERE status IN ('open', 'in_review')
       GROUP BY severity`
    );

    res.json({
      lines: stats,
      queue: queueStats,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

export default router;
