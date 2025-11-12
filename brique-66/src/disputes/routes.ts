import express from 'express';
import {
  createDispute,
  submitEvidence,
  addEvidenceDocument,
  resolveDispute,
  getDisputeById,
  listDisputesByMerchant,
  getDisputeStats,
  updateDisputeStatus,
  getDisputeEvidence,
  getDisputeLogs,
  getDisputeFees,
} from './engine';
import { pool } from '../utils/db';

export const disputeRouter = express.Router();

/**
 * POST /api/disputes
 * Create a new dispute
 */
disputeRouter.post('/', async (req, res) => {
  try {
    const dispute = await createDispute(req.body);
    res.status(201).json(dispute);
  } catch (e: any) {
    console.error('Error creating dispute:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/:id
 * Get dispute details
 */
disputeRouter.get('/:id', async (req, res) => {
  try {
    const dispute = await getDisputeById(req.params.id);

    if (!dispute) {
      return res.status(404).json({ error: 'not_found' });
    }

    return res.json(dispute);
  } catch (e: any) {
    console.error('Error fetching dispute:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes
 * List disputes (with filters)
 */
disputeRouter.get('/', async (req, res) => {
  try {
    const { merchant_id, status, limit, offset } = req.query;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id required' });
    }

    const disputes = await listDisputesByMerchant(merchant_id as string, {
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    return res.json(disputes);
  } catch (e: any) {
    console.error('Error listing disputes:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/disputes/:id/evidence
 * Submit evidence for a dispute
 */
disputeRouter.post('/:id/evidence', async (req, res) => {
  try {
    const { actor, evidence } = req.body;

    if (!actor || !evidence) {
      return res.status(400).json({ error: 'actor and evidence required' });
    }

    const dispute = await submitEvidence(req.params.id, actor, evidence);

    return res.json(dispute);
  } catch (e: any) {
    console.error('Error submitting evidence:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/disputes/:id/evidence/upload
 * Upload evidence document
 */
disputeRouter.post('/:id/evidence/upload', async (req, res) => {
  try {
    const {
      evidence_type,
      file_url,
      file_name,
      mime_type,
      uploaded_by,
      notes,
    } = req.body;

    if (!evidence_type || !file_url || !file_name || !mime_type || !uploaded_by) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    await addEvidenceDocument(
      req.params.id,
      evidence_type,
      file_url,
      file_name,
      mime_type,
      uploaded_by,
      notes
    );

    return res.json({ success: true, message: 'Evidence uploaded' });
  } catch (e: any) {
    console.error('Error uploading evidence:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/disputes/:id/resolve
 * Resolve a dispute
 */
disputeRouter.post('/:id/resolve', async (req, res) => {
  try {
    const { actor, outcome, notes } = req.body;

    if (!actor || !outcome) {
      return res.status(400).json({ error: 'actor and outcome required' });
    }

    if (!['won', 'lost'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be "won" or "lost"' });
    }

    const dispute = await resolveDispute(req.params.id, actor, outcome, notes);

    return res.json(dispute);
  } catch (e: any) {
    console.error('Error resolving dispute:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/disputes/:id/status
 * Update dispute status
 */
disputeRouter.patch('/:id/status', async (req, res) => {
  try {
    const { status, actor } = req.body;

    if (!status || !actor) {
      return res.status(400).json({ error: 'status and actor required' });
    }

    const dispute = await updateDisputeStatus(req.params.id, status, actor);

    return res.json(dispute);
  } catch (e: any) {
    console.error('Error updating dispute status:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/:id/evidence
 * Get all evidence for a dispute
 */
disputeRouter.get('/:id/evidence', async (req, res) => {
  try {
    const evidence = await getDisputeEvidence(req.params.id);
    res.json(evidence);
  } catch (e: any) {
    console.error('Error fetching evidence:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/:id/logs
 * Get all logs for a dispute
 */
disputeRouter.get('/:id/logs', async (req, res) => {
  try {
    const logs = await getDisputeLogs(req.params.id);
    res.json(logs);
  } catch (e: any) {
    console.error('Error fetching logs:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/:id/fees
 * Get all fees for a dispute
 */
disputeRouter.get('/:id/fees', async (req, res) => {
  try {
    const fees = await getDisputeFees(req.params.id);
    res.json(fees);
  } catch (e: any) {
    console.error('Error fetching fees:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/stats/:merchant_id
 * Get dispute statistics for a merchant
 */
disputeRouter.get('/stats/:merchant_id', async (req, res) => {
  try {
    const stats = await getDisputeStats(req.params.merchant_id);
    res.json(stats);
  } catch (e: any) {
    console.error('Error fetching stats:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/disputes/templates
 * Get all dispute templates
 */
disputeRouter.get('/templates', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM dispute_templates ORDER BY name');
    return res.json(rows);
  } catch (e: any) {
    console.error('Error fetching templates:', e);
    return res.status(500).json({ error: e.message });
  }
});

export default disputeRouter;