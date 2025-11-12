import express from 'express';
import { computeAndPersistTax, getTaxDecision, reverseTaxDecision } from './engine';
import { pool } from '../utils/db';

export const taxRouter = express.Router();

/**
 * POST /api/tax/compute
 * Compute tax for a transaction
 */
taxRouter.post('/compute', async (req, res) => {
  try {
    const result = await computeAndPersistTax(req.body);
    res.json({
      ok: true,
      decision: result,
    });
  } catch (e: any) {
    console.error('Tax compute error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * GET /api/tax/decisions/:connectTxId
 * Get tax decision for a transaction
 */
taxRouter.get('/decisions/:connectTxId', async (req, res) => {
  try {
    const decision = await getTaxDecision(req.params.connectTxId);

    if (!decision) {
      return res.status(404).json({
        error: 'not_found',
      });
    }

    res.json(decision);
  } catch (e: any) {
    console.error('Tax decision lookup error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * POST /api/tax/reverse
 * Reverse a tax decision (for refunds)
 */
taxRouter.post('/reverse', async (req, res) => {
  try {
    const { original_tx_id, reversal_tx_id } = req.body;

    if (!original_tx_id || !reversal_tx_id) {
      return res.status(400).json({
        error: 'missing_required_fields',
      });
    }

    const reversal = await reverseTaxDecision(original_tx_id, reversal_tx_id);

    res.json({
      ok: true,
      reversal,
    });
  } catch (e: any) {
    console.error('Tax reversal error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * GET /api/tax/rules
 * List all active tax rules
 */
taxRouter.get('/rules', async (req, res) => {
  try {
    const { jurisdiction_id } = req.query;

    let query = `
      SELECT tr.*, tj.code as jurisdiction_code, tj.name as jurisdiction_name
      FROM tax_rules tr
      JOIN tax_jurisdictions tj ON tj.id = tr.jurisdiction_id
      WHERE tr.effective_from <= CURRENT_DATE
        AND (tr.effective_to IS NULL OR tr.effective_to >= CURRENT_DATE)
    `;

    const params: any[] = [];

    if (jurisdiction_id) {
      query += ` AND tr.jurisdiction_id = $1`;
      params.push(jurisdiction_id);
    }

    query += ` ORDER BY tj.code, tr.code`;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (e: any) {
    console.error('Tax rules list error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * GET /api/tax/jurisdictions
 * List all tax jurisdictions
 */
taxRouter.get('/jurisdictions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tax_jurisdictions ORDER BY default DESC, code`
    );

    res.json(rows);
  } catch (e: any) {
    console.error('Jurisdictions list error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * GET /api/tax/summary
 * Get tax summary for reporting
 */
taxRouter.get('/summary', async (req, res) => {
  try {
    const { start_date, end_date, jurisdiction_id } = req.query;

    let query = `
      SELECT
        tj.code as jurisdiction_code,
        tj.name as jurisdiction_name,
        td.currency,
        COUNT(td.id) as transaction_count,
        SUM(td.total_tax) as total_tax,
        DATE_TRUNC('day', td.computed_at) as day
      FROM tax_decisions td
      JOIN tax_jurisdictions tj ON tj.id = td.jurisdiction_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND td.computed_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND td.computed_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (jurisdiction_id) {
      query += ` AND td.jurisdiction_id = $${paramIndex}`;
      params.push(jurisdiction_id);
      paramIndex++;
    }

    query += `
      GROUP BY tj.code, tj.name, td.currency, DATE_TRUNC('day', td.computed_at)
      ORDER BY day DESC
    `;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (e: any) {
    console.error('Tax summary error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

/**
 * GET /api/tax/withholdings
 * List withholding reservations
 */
taxRouter.get('/withholdings', async (req, res) => {
  try {
    const { merchant_id, status } = req.query;

    let query = `SELECT * FROM withholding_reservations WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (merchant_id) {
      query += ` AND merchant_id = $${paramIndex}`;
      params.push(merchant_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (e: any) {
    console.error('Withholdings list error:', e);
    res.status(500).json({
      error: e.message,
    });
  }
});

export default taxRouter;