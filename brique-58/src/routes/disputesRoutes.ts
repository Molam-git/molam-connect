import { Router, Response } from 'express';
import { authzMiddleware, requireRole, AuthRequest } from '../utils/authz';
import * as disputesService from '../services/disputesService';
import * as evidenceService from '../services/evidenceService';
import { resolveDispute } from '../services/disputesService';
import { pool } from '../utils/db';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// ============ Merchant Endpoints ============

/**
 * GET /api/disputes - List disputes for merchant
 */
router.get('/', authzMiddleware, requireRole('merchant_admin', 'merchant_viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { status, from, to, limit } = req.query;

    const disputes = await disputesService.listDisputes({
      merchantId,
      status: status as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(disputes);
  } catch (error: any) {
    console.error('[DisputesRoutes] Error listing disputes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id - Get dispute details
 */
router.get('/:id', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const merchantId = req.user!.roles.includes('pay_admin') ? undefined : req.user!.merchantId;

    const dispute = await disputesService.getDispute(id, merchantId);
    if (!dispute) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }

    res.json(dispute);
  } catch (error: any) {
    console.error('[DisputesRoutes] Error getting dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id/timeline - Get dispute timeline/events
 */
router.get('/:id/timeline', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const timeline = await disputesService.getDisputeTimeline(id);
    res.json(timeline);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes/:id/evidence - Upload evidence
 */
router.post('/:id/evidence', authzMiddleware, requireRole('merchant_admin'), upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { evidence_type } = req.body;

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const evidence = await evidenceService.uploadEvidence({
      disputeId: id,
      uploadedBy: req.user!.id,
      fileName: req.file.originalname,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      evidenceType: evidence_type || 'other',
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {},
    });

    res.json(evidence);
  } catch (error: any) {
    console.error('[DisputesRoutes] Error uploading evidence:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id/evidence - List evidence for dispute
 */
router.get('/:id/evidence', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const evidence = await evidenceService.listEvidence(id);
    res.json(evidence);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id/evidence/:evidence_id/download - Get download URL
 */
router.get('/:id/evidence/:evidence_id/download', authzMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { evidence_id } = req.params;
    const url = await evidenceService.getEvidenceDownloadUrl(evidence_id);
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/stats - Get dispute statistics
 */
router.get('/merchant/stats', authzMiddleware, requireRole('merchant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.user!.merchantId!;
    const { from, to } = req.query;

    const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to as string) : new Date();

    const stats = await disputesService.getDisputeStats(merchantId, fromDate, toDate);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Ops Endpoints ============

/**
 * POST /api/disputes/:id/submit - Submit dispute to network
 */
router.post('/:id/submit', authzMiddleware, requireRole('pay_admin', 'finance_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Create submit action
    await pool.query(
      `INSERT INTO dispute_actions (dispute_id, action_type, payload, priority)
       VALUES ($1, $2, $3, $4)`,
      [id, 'submit_to_network', JSON.stringify({ requested_by: req.user!.id, notes }), 3]
    );

    res.json({ ok: true, message: 'Submission queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes/:id/resolve - Resolve dispute (won/lost/settled)
 */
router.post('/:id/resolve', authzMiddleware, requireRole('pay_admin', 'finance_ops'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { outcome, note, network_code, network_response } = req.body;

    if (!['won', 'lost', 'settled'].includes(outcome)) {
      res.status(400).json({ error: 'Invalid outcome' });
      return;
    }

    const dispute = await resolveDispute(id, outcome, req.user!.id, {
      note,
      network_code,
      network_response,
    });

    res.json(dispute);
  } catch (error: any) {
    console.error('[DisputesRoutes] Error resolving dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/disputes/:id/status - Update dispute status
 */
router.patch('/:id/status', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, payload } = req.body;

    const dispute = await disputesService.updateDisputeStatus(id, status, req.user!.id, payload);
    res.json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/disputes/:id/evidence/:evidence_id - Delete evidence (ops only, before submission)
 */
router.delete('/:id/evidence/:evidence_id', authzMiddleware, requireRole('pay_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { evidence_id } = req.params;
    await evidenceService.deleteEvidence(evidence_id, req.user!.id);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
