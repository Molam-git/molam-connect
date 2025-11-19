/**
 * BRIQUE 142-SIRA — Approvals API Routes
 * Multi-signature approval workflow endpoints
 */

import { Router } from 'express';
import { requireRole } from '../utils/authz';
import {
  createApprovalRequest,
  signApprovalRequest,
  rejectApprovalRequest,
} from '../services/approval_service';
import { pool } from '../db';

const router = Router();

/**
 * Create approval request
 * POST /api/approvals
 */
router.post(
  '/',
  requireRole(['pay_admin', 'fraud_ops', 'compliance']),
  async (req: any, res) => {
    try {
      const { request_type, reference_id, policy_id, metadata } = req.body;

      if (!request_type || !policy_id) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }

      const created = await createApprovalRequest(
        request_type,
        reference_id,
        req.user.id,
        policy_id,
        metadata
      );

      res.status(201).json(created);
    } catch (e: any) {
      console.error('[Approvals] Create error:', e);
      res.status(400).json({ error: e.message });
    }
  }
);

/**
 * Sign approval request
 * POST /api/approvals/:id/sign
 */
router.post(
  '/:id/sign',
  requireRole(['pay_admin', 'fraud_ops', 'compliance']),
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const signerRoles = req.user.roles || [];
      const { comment } = req.body;

      const result = await signApprovalRequest(id, req.user.id, signerRoles, comment);

      res.json(result);
    } catch (e: any) {
      console.error('[Approvals] Sign error:', e);
      res.status(400).json({ error: e.message });
    }
  }
);

/**
 * Reject approval request
 * POST /api/approvals/:id/reject
 */
router.post(
  '/:id/reject',
  requireRole(['pay_admin', 'fraud_ops', 'compliance']),
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await rejectApprovalRequest(id, req.user.id, reason || 'manual_reject');

      res.json({ ok: true });
    } catch (e: any) {
      console.error('[Approvals] Reject error:', e);
      res.status(400).json({ error: e.message });
    }
  }
);

/**
 * Get approval request details
 * GET /api/approvals/:id
 */
router.get(
  '/:id',
  requireRole(['pay_admin', 'fraud_ops', 'compliance', 'auditor']),
  async (req: any, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        `SELECT ar.*,
                array_agg(jsonb_build_object(
                  'signer', s.signer_user_id,
                  'roles', s.signer_roles,
                  'signed_at', s.signed_at,
                  'comment', s.comment
                )) FILTER (WHERE s.id IS NOT NULL) AS signatures
         FROM approval_requests ar
         LEFT JOIN approval_signatures s ON s.approval_request_id = ar.id
         WHERE ar.id = $1
         GROUP BY ar.id`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'not_found' });
      }

      res.json(rows[0]);
    } catch (e: any) {
      console.error('[Approvals] Get error:', e);
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * List approval requests
 * GET /api/approvals
 */
router.get(
  '/',
  requireRole(['pay_admin', 'fraud_ops', 'compliance', 'auditor']),
  async (req: any, res) => {
    try {
      const { status, request_type } = req.query;

      let query = `SELECT ar.*, COUNT(s.id) as signature_count
                   FROM approval_requests ar
                   LEFT JOIN approval_signatures s ON s.approval_request_id = ar.id
                   WHERE 1=1`;

      const params: any[] = [];

      if (status) {
        params.push(status);
        query += ` AND ar.status = $${params.length}`;
      }

      if (request_type) {
        params.push(request_type);
        query += ` AND ar.request_type = $${params.length}`;
      }

      query += ` GROUP BY ar.id ORDER BY ar.requested_at DESC LIMIT 100`;

      const { rows } = await pool.query(query, params);

      res.json(rows);
    } catch (e: any) {
      console.error('[Approvals] List error:', e);
      res.status(500).json({ error: e.message });
    }
  }
);

/**
 * Get approval policies
 * GET /api/approvals/policies
 */
router.get('/policies/list', async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM approval_policies ORDER BY created_at DESC`
    );

    res.json(rows);
  } catch (e: any) {
    console.error('[Approvals] Policies list error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
