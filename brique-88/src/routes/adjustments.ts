// REST API Routes for Ledger Adjustments
import { Router, Request, Response } from 'express';
import { pool } from '../utils/db';

const router = Router();

/**
 * POST /api/adjustments
 * Create manual adjustment
 */
router.post('/adjustments', async (req: Request, res: Response) => {
  try {
    const {
      source_type,
      source_id,
      external_ref,
      reason,
      currency,
      amount,
      adjustment_type,
      actions,
    } = req.body;

    // Validate required fields
    if (!external_ref || !currency || !amount || !adjustment_type) {
      return res.status(400).json({
        error: 'Missing required fields: external_ref, currency, amount, adjustment_type',
      });
    }

    // Check for duplicate external_ref
    const { rows: existing } = await pool.query(
      `SELECT id FROM ledger_adjustments WHERE external_ref = $1`,
      [external_ref]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'Duplicate external_ref',
        existing_id: existing[0].id,
      });
    }

    // Insert adjustment
    const { rows } = await pool.query(
      `INSERT INTO ledger_adjustments (
        source_type, source_id, external_ref, reason,
        currency, amount, adjustment_type, actions, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *`,
      [
        source_type || 'manual',
        source_id,
        external_ref,
        reason,
        currency,
        amount,
        adjustment_type,
        JSON.stringify(actions || []),
      ]
    );

    res.status(201).json({
      adjustment: rows[0],
      message: 'Adjustment created successfully',
    });
  } catch (error: any) {
    console.error('Error creating adjustment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/adjustments
 * List adjustments with filters
 */
router.get('/adjustments', async (req: Request, res: Response) => {
  try {
    const {
      status,
      adjustment_type,
      currency,
      date_from,
      date_to,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = `SELECT * FROM ledger_adjustments WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (adjustment_type) {
      query += ` AND adjustment_type = $${paramIndex}`;
      params.push(adjustment_type);
      paramIndex++;
    }

    if (currency) {
      query += ` AND currency = $${paramIndex}`;
      params.push(currency);
      paramIndex++;
    }

    if (date_from) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM ledger_adjustments WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (adjustment_type) {
      countQuery += ` AND adjustment_type = $${countParamIndex}`;
      countParams.push(adjustment_type);
      countParamIndex++;
    }

    if (currency) {
      countQuery += ` AND currency = $${countParamIndex}`;
      countParams.push(currency);
      countParamIndex++;
    }

    const { rows: countRows } = await pool.query(countQuery, countParams);

    res.json({
      adjustments: rows,
      total: parseInt(countRows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Error listing adjustments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/adjustments/:id
 * Get adjustment details with related records
 */
router.get('/adjustments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get adjustment
    const { rows: adjRows } = await pool.query(
      `SELECT * FROM ledger_adjustments WHERE id = $1`,
      [id]
    );

    if (adjRows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adjustment = adjRows[0];

    // Get journal entry
    const { rows: jeRows } = await pool.query(
      `SELECT * FROM journal_entries WHERE source_adjustment_id = $1`,
      [id]
    );

    const journalEntry = jeRows[0] || null;

    // Get journal lines
    let journalLines: any[] = [];
    if (journalEntry) {
      const { rows: linesRows } = await pool.query(
        `SELECT * FROM journal_lines WHERE journal_entry_id = $1 ORDER BY line_number`,
        [journalEntry.id]
      );
      journalLines = linesRows;
    }

    // Get compensation actions
    const { rows: compRows } = await pool.query(
      `SELECT * FROM compensation_actions WHERE adjustment_id = $1 ORDER BY created_at`,
      [id]
    );

    // Get approvals
    const { rows: approvalRows } = await pool.query(
      `SELECT * FROM adjustment_approvals WHERE adjustment_id = $1 ORDER BY created_at`,
      [id]
    );

    // Get reversal info if exists
    const { rows: reversalRows } = await pool.query(
      `SELECT * FROM adjustment_reversals WHERE adjustment_id = $1`,
      [id]
    );

    res.json({
      adjustment,
      journal_entry: journalEntry,
      journal_lines: journalLines,
      compensation_actions: compRows,
      approvals: approvalRows,
      reversal: reversalRows[0] || null,
    });
  } catch (error: any) {
    console.error('Error fetching adjustment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/adjustments/:id/approve
 * Approve adjustment
 */
router.post('/adjustments/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, comment } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Get adjustment
    const { rows: adjRows } = await pool.query(
      `SELECT * FROM ledger_adjustments WHERE id = $1`,
      [id]
    );

    if (adjRows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adjustment = adjRows[0];

    if (adjustment.status !== 'awaiting_approval' && adjustment.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot approve adjustment with status: ${adjustment.status}`,
      });
    }

    // Check if user already approved
    if (adjustment.approved_by && adjustment.approved_by.includes(user_id)) {
      return res.status(400).json({ error: 'User has already approved this adjustment' });
    }

    // Record approval
    await pool.query(
      `INSERT INTO adjustment_approvals (adjustment_id, user_id, approved, comment)
       VALUES ($1, $2, true, $3)`,
      [id, user_id, comment]
    );

    // Update adjustment
    const newApprovedBy = [...(adjustment.approved_by || []), user_id];
    const newApprovalCount = newApprovedBy.length;

    await pool.query(
      `UPDATE ledger_adjustments
       SET approved_by = $2, approval_count = $3, updated_at = now()
       WHERE id = $1`,
      [id, newApprovedBy, newApprovalCount]
    );

    // Check if enough approvals
    const approvalMet = adjustment.approval_required
      ? newApprovalCount >= adjustment.approval_required
      : true;

    res.json({
      message: 'Approval recorded',
      approval_count: newApprovalCount,
      approval_required: adjustment.approval_required,
      approval_met: approvalMet,
    });
  } catch (error: any) {
    console.error('Error approving adjustment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/adjustments/:id/reverse
 * Request adjustment reversal
 */
router.post('/adjustments/:id/reverse', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, reason } = req.body;

    if (!user_id || !reason) {
      return res.status(400).json({ error: 'user_id and reason are required' });
    }

    // Get adjustment
    const { rows: adjRows } = await pool.query(
      `SELECT * FROM ledger_adjustments WHERE id = $1`,
      [id]
    );

    if (adjRows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adjustment = adjRows[0];

    if (adjustment.status !== 'applied') {
      return res.status(400).json({
        error: `Cannot reverse adjustment with status: ${adjustment.status}`,
      });
    }

    // Check if already has reversal request
    const { rows: existingReversals } = await pool.query(
      `SELECT * FROM adjustment_reversals WHERE adjustment_id = $1 AND status IN ('requested', 'approved')`,
      [id]
    );

    if (existingReversals.length > 0) {
      return res.status(400).json({
        error: 'Reversal already requested for this adjustment',
        reversal_id: existingReversals[0].id,
      });
    }

    // Get approval requirement from config
    const { rows: configRows } = await pool.query(
      `SELECT value FROM adjustment_config WHERE key = 'reversal_approval_quorum'`
    );

    const requiredApprovals = configRows.length > 0 ? parseInt(configRows[0].value) : 2;

    // Create reversal request
    const { rows } = await pool.query(
      `INSERT INTO adjustment_reversals (
        adjustment_id, requested_by, reason, status, approval_required
      ) VALUES ($1, $2, $3, 'requested', $4)
      RETURNING *`,
      [id, user_id, reason, requiredApprovals]
    );

    res.status(201).json({
      reversal: rows[0],
      message: 'Reversal request created',
      approval_required: requiredApprovals,
    });
  } catch (error: any) {
    console.error('Error requesting reversal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reversals/:id/approve
 * Approve reversal request
 */
router.post('/reversals/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, comment } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Get reversal
    const { rows: revRows } = await pool.query(
      `SELECT * FROM adjustment_reversals WHERE id = $1`,
      [id]
    );

    if (revRows.length === 0) {
      return res.status(404).json({ error: 'Reversal request not found' });
    }

    const reversal = revRows[0];

    if (reversal.status !== 'requested') {
      return res.status(400).json({
        error: `Cannot approve reversal with status: ${reversal.status}`,
      });
    }

    // Check if user already approved
    if (reversal.approvers && reversal.approvers.includes(user_id)) {
      return res.status(400).json({ error: 'User has already approved this reversal' });
    }

    // Update reversal
    const newApprovers = [...(reversal.approvers || []), user_id];
    const newApprovalCount = newApprovers.length;

    await pool.query(
      `UPDATE adjustment_reversals
       SET approvers = $2, approval_count = $3, updated_at = now()
       WHERE id = $1`,
      [id, newApprovers, newApprovalCount]
    );

    // Check if enough approvals
    const approvalMet = newApprovalCount >= reversal.approval_required;

    if (approvalMet) {
      await pool.query(
        `UPDATE adjustment_reversals SET status = 'approved' WHERE id = $1`,
        [id]
      );
    }

    res.json({
      message: 'Reversal approval recorded',
      approval_count: newApprovalCount,
      approval_required: reversal.approval_required,
      approval_met: approvalMet,
      status: approvalMet ? 'approved' : 'requested',
    });
  } catch (error: any) {
    console.error('Error approving reversal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/compensations
 * List compensation actions
 */
router.get('/compensations', async (req: Request, res: Response) => {
  try {
    const { status, action_type, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT ca.*, la.external_ref, la.amount, la.currency
      FROM compensation_actions ca
      LEFT JOIN ledger_adjustments la ON ca.adjustment_id = la.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND ca.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (action_type) {
      query += ` AND ca.action_type = $${paramIndex}`;
      params.push(action_type);
      paramIndex++;
    }

    query += ` ORDER BY ca.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    res.json({
      compensations: rows,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Error listing compensations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health
 * Health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');

    // Get stats
    const { rows: pendingAdj } = await pool.query(
      `SELECT COUNT(*) FROM ledger_adjustments WHERE status = 'pending'`
    );

    const { rows: awaitingApproval } = await pool.query(
      `SELECT COUNT(*) FROM ledger_adjustments WHERE status = 'awaiting_approval'`
    );

    const { rows: queuedComp } = await pool.query(
      `SELECT COUNT(*) FROM compensation_actions WHERE status = 'queued'`
    );

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      stats: {
        pending_adjustments: parseInt(pendingAdj[0].count),
        awaiting_approval: parseInt(awaitingApproval[0].count),
        queued_compensations: parseInt(queuedComp[0].count),
      },
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
