// =====================================================================
// Overage Preview API Routes
// =====================================================================
// RESTful API for managing overage previews
// Date: 2025-11-12
// =====================================================================

import { Router } from 'express';
import { pool } from '../db';
import { requireRole, requireAuth, AuthenticatedRequest, getTenantIdFromPreview } from '../utils/authz';
import { previewBuilder } from '../overages/previewBuilder';
import { overageNotifier } from '../notifications/overageNotifier';

export const previewsRouter = Router();

// =====================================================================
// Merchant Endpoints (Tenant-Scoped)
// =====================================================================

/**
 * GET /api/previews
 * List all previews for authenticated merchant
 */
previewsRouter.get('/', requireRole(['merchant_admin', 'billing_admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const { status, period_start, period_end, limit = '50', offset = '0' } = req.query;

    const { rows } = await pool.query(
      `
      SELECT
        p.*,
        COUNT(pl.id) as line_count,
        array_agg(DISTINCT pl.metric) as metrics
      FROM overage_previews p
      LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
      WHERE p.tenant_id = $1
        AND ($2::text IS NULL OR p.status = $2)
        AND ($3::date IS NULL OR p.period_start >= $3)
        AND ($4::date IS NULL OR p.period_end <= $4)
      GROUP BY p.id
      ORDER BY p.period_start DESC, p.created_at DESC
      LIMIT $5 OFFSET $6
      `,
      [tenantId, status || null, period_start || null, period_end || null, parseInt(limit as string), parseInt(offset as string)]
    );

    // Get total count
    const { rows: [{ count }] } = await pool.query(
      `
      SELECT COUNT(DISTINCT p.id)
      FROM overage_previews p
      WHERE p.tenant_id = $1
        AND ($2::text IS NULL OR p.status = $2)
        AND ($3::date IS NULL OR p.period_start >= $3)
        AND ($4::date IS NULL OR p.period_end <= $4)
      `,
      [tenantId, status || null, period_start || null, period_end || null]
    );

    res.json({
      previews: rows,
      total: parseInt(count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Error fetching previews:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/previews/:id
 * Get specific preview with lines
 */
previewsRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Get preview
    const { rows: [preview] } = await pool.query(
      `SELECT * FROM overage_previews WHERE id = $1`,
      [id]
    );

    if (!preview) {
      return res.status(404).json({ error: 'not_found', message: 'Preview not found' });
    }

    // Check access: merchant can only access their own, ops can access all
    const isOps = req.user?.roles.some(r => ['billing_ops', 'finance_ops'].includes(r));
    if (!isOps && String(preview.tenant_id) !== String(req.user?.tenantId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
    }

    // Get lines
    const { rows: lines } = await pool.query(
      `
      SELECT * FROM overage_preview_lines
      WHERE preview_id = $1
      ORDER BY amount DESC
      `,
      [id]
    );

    // Get audit log
    const { rows: auditLog } = await pool.query(
      `
      SELECT * FROM preview_audit_log
      WHERE preview_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [id]
    );

    res.json({
      preview,
      lines,
      audit_log: auditLog,
    });
  } catch (error: any) {
    console.error('Error fetching preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/accept
 * Merchant accepts preview charges
 */
previewsRouter.post('/:id/accept', requireRole(['merchant_admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Get preview
    const { rows: [preview] } = await pool.query(
      `SELECT * FROM overage_previews WHERE id = $1`,
      [id]
    );

    if (!preview) {
      return res.status(404).json({ error: 'not_found', message: 'Preview not found' });
    }

    // Verify tenant ownership
    if (String(preview.tenant_id) !== String(req.user?.tenantId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
    }

    // Check if already accepted or billed
    if (['accepted', 'forwarded_to_billing', 'billed'].includes(preview.status)) {
      return res.status(400).json({ error: 'invalid_status', message: `Preview is already ${preview.status}` });
    }

    // Update preview status
    await pool.query(
      `
      UPDATE overage_previews
      SET
        status = 'accepted',
        merchant_action = 'accepted',
        merchant_action_at = NOW(),
        merchant_action_by = $2,
        merchant_notes = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, req.user?.id, notes || null]
    );

    // Mark underlying overages as ready for billing
    await pool.query(
      `
      UPDATE billing_overages
      SET billing_status = 'ready_for_billing', updated_at = NOW()
      WHERE id IN (
        SELECT overage_id FROM overage_preview_lines WHERE preview_id = $1
      )
      `,
      [id]
    );

    // Send confirmation notification
    await overageNotifier.notifyPreview({
      previewId: id,
      notificationType: 'accepted',
      force: true,
    });

    res.json({ ok: true, message: 'Preview accepted successfully' });
  } catch (error: any) {
    console.error('Error accepting preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/contest
 * Merchant contests preview charges
 */
previewsRouter.post('/:id/contest', requireRole(['merchant_admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_request', message: 'Reason is required' });
    }

    // Get preview
    const { rows: [preview] } = await pool.query(
      `SELECT * FROM overage_previews WHERE id = $1`,
      [id]
    );

    if (!preview) {
      return res.status(404).json({ error: 'not_found', message: 'Preview not found' });
    }

    // Verify tenant ownership
    if (String(preview.tenant_id) !== String(req.user?.tenantId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
    }

    // Update preview status
    await pool.query(
      `
      UPDATE overage_previews
      SET
        status = 'contested',
        merchant_action = 'contested',
        merchant_action_at = NOW(),
        merchant_action_by = $2,
        merchant_notes = $3,
        metadata = metadata || jsonb_build_object(
          'contested_reason', $3,
          'contested_by', $2,
          'contested_at', NOW()
        ),
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, req.user?.id, reason]
    );

    // Send notification to ops
    // (In production, integrate with ticketing system)
    console.log(`Preview ${id} contested by tenant ${preview.tenant_id}: ${reason}`);

    // Send confirmation notification to merchant
    await overageNotifier.notifyPreview({
      previewId: id,
      notificationType: 'contested',
      force: true,
    });

    res.json({ ok: true, message: 'Preview contested successfully. Our billing team will review.' });
  } catch (error: any) {
    console.error('Error contesting preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

// =====================================================================
// Ops Endpoints (Global Access)
// =====================================================================

/**
 * GET /api/previews/ops/list
 * List all previews (Ops only)
 */
previewsRouter.get('/ops/list', requireRole(['billing_ops', 'finance_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { status, tenant_id, limit = '100', offset = '0' } = req.query;

    const { rows } = await pool.query(
      `
      SELECT
        p.*,
        COUNT(pl.id) as line_count,
        array_agg(DISTINCT pl.metric) as metrics
      FROM overage_previews p
      LEFT JOIN overage_preview_lines pl ON p.id = pl.preview_id
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::uuid IS NULL OR p.tenant_id = $2)
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [status || null, tenant_id || null, parseInt(limit as string), parseInt(offset as string)]
    );

    const { rows: [{ count }] } = await pool.query(
      `
      SELECT COUNT(DISTINCT p.id)
      FROM overage_previews p
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::uuid IS NULL OR p.tenant_id = $2)
      `,
      [status || null, tenant_id || null]
    );

    res.json({
      previews: rows,
      total: parseInt(count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error: any) {
    console.error('Error fetching ops previews:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/ops/approve
 * Ops approves contested preview
 */
previewsRouter.post('/:id/ops/approve', requireRole(['billing_ops', 'finance_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes, adjustments } = req.body;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Apply adjustments if provided
      if (adjustments && Array.isArray(adjustments)) {
        for (const adj of adjustments) {
          await client.query(
            `
            UPDATE overage_preview_lines
            SET
              adjusted_amount = $2,
              adjustment_reason = $3,
              adjusted_by = $4,
              adjusted_at = NOW(),
              line_status = 'adjusted'
            WHERE id = $1
            `,
            [adj.line_id, adj.new_amount, adj.reason, req.user?.id]
          );
        }
      }

      // Update preview
      await client.query(
        `
        UPDATE overage_previews
        SET
          status = 'approved_by_ops',
          ops_action = 'approved',
          ops_action_at = NOW(),
          ops_action_by = $2,
          ops_notes = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [id, req.user?.id, notes || null]
      );

      // Mark overages as ready for billing
      await client.query(
        `
        UPDATE billing_overages
        SET billing_status = 'ready_for_billing', updated_at = NOW()
        WHERE id IN (
          SELECT overage_id FROM overage_preview_lines
          WHERE preview_id = $1 AND line_status IN ('included', 'adjusted')
        )
        `,
        [id]
      );

      await client.query('COMMIT');

      // Send notification to merchant
      await overageNotifier.notifyPreview({
        previewId: id,
        notificationType: 'approved',
        force: true,
      });

      res.json({ ok: true, message: 'Preview approved successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error approving preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/ops/reject
 * Ops rejects/voids contested preview
 */
previewsRouter.post('/:id/ops/reject', requireRole(['billing_ops', 'finance_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_request', message: 'Reason is required' });
    }

    // Update preview
    await pool.query(
      `
      UPDATE overage_previews
      SET
        status = 'rejected_by_ops',
        ops_action = 'rejected',
        ops_action_at = NOW(),
        ops_action_by = $2,
        ops_notes = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, req.user?.id, reason]
    );

    // Void underlying overages
    await pool.query(
      `
      UPDATE billing_overages
      SET billing_status = 'voided', updated_at = NOW()
      WHERE id IN (
        SELECT overage_id FROM overage_preview_lines WHERE preview_id = $1
      )
      `,
      [id]
    );

    res.json({ ok: true, message: 'Preview rejected and charges voided' });
  } catch (error: any) {
    console.error('Error rejecting preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/ops/adjust-line
 * Ops adjusts individual line item
 */
previewsRouter.post('/:id/ops/adjust-line', requireRole(['billing_ops', 'finance_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { line_id, new_amount, reason } = req.body;

    if (!line_id || new_amount === undefined || !reason) {
      return res.status(400).json({ error: 'invalid_request', message: 'line_id, new_amount, and reason are required' });
    }

    // Update line
    await pool.query(
      `
      UPDATE overage_preview_lines
      SET
        original_amount = COALESCE(original_amount, amount),
        adjusted_amount = $2,
        adjustment_reason = $3,
        adjusted_by = $4,
        adjusted_at = NOW(),
        line_status = 'adjusted',
        updated_at = NOW()
      WHERE id = $1
      `,
      [line_id, new_amount, reason, req.user?.id]
    );

    res.json({ ok: true, message: 'Line adjusted successfully' });
  } catch (error: any) {
    console.error('Error adjusting line:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/:id/ops/forward-to-billing
 * Forward preview to billing engine (B46)
 */
previewsRouter.post('/:id/ops/forward-to-billing', requireRole(['billing_ops', 'finance_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { invoice_id } = req.body;

    // Update preview
    await pool.query(
      `
      UPDATE overage_previews
      SET
        status = 'forwarded_to_billing',
        billing_invoice_id = $2,
        billing_forwarded_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, invoice_id || null]
    );

    // Mark overages as billed
    await pool.query(
      `
      UPDATE billing_overages
      SET billing_status = 'billed', billed_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT overage_id FROM overage_preview_lines
        WHERE preview_id = $1 AND line_status IN ('included', 'adjusted')
      )
      `,
      [id]
    );

    // Send notification to merchant
    await overageNotifier.notifyPreview({
      previewId: id,
      notificationType: 'billed',
      force: true,
    });

    res.json({ ok: true, message: 'Preview forwarded to billing successfully' });
  } catch (error: any) {
    console.error('Error forwarding to billing:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * POST /api/previews/ops/build
 * Manually trigger preview build (Ops only)
 */
previewsRouter.post('/ops/build', requireRole(['billing_ops']), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenant_id, period_start, period_end } = req.body;

    if (!tenant_id || !period_start || !period_end) {
      return res.status(400).json({ error: 'invalid_request', message: 'tenant_id, period_start, and period_end are required' });
    }

    const result = await previewBuilder.buildOveragePreview({
      tenantType: 'merchant',
      tenantId: tenant_id,
      periodStart: new Date(period_start),
      periodEnd: new Date(period_end),
    });

    res.json({ ok: true, result });
  } catch (error: any) {
    console.error('Error building preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/previews/:id/download
 * Download preview as PDF
 */
previewsRouter.get('/:id/download', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Get preview data
    const { rows: [preview] } = await pool.query(
      `SELECT * FROM overage_previews WHERE id = $1`,
      [id]
    );

    if (!preview) {
      return res.status(404).json({ error: 'not_found', message: 'Preview not found' });
    }

    // Check access
    const isOps = req.user?.roles.some(r => ['billing_ops', 'finance_ops'].includes(r));
    if (!isOps && String(preview.tenant_id) !== String(req.user?.tenantId)) {
      return res.status(403).json({ error: 'forbidden', message: 'Access denied' });
    }

    // Get lines
    const { rows: lines } = await pool.query(
      `SELECT * FROM overage_preview_lines WHERE preview_id = $1 ORDER BY amount DESC`,
      [id]
    );

    // Generate PDF (simplified - use a proper PDF library in production)
    // For now, return JSON
    res.json({
      preview,
      lines,
      download_url: `/api/previews/${id}/download.pdf`,
    });
  } catch (error: any) {
    console.error('Error downloading preview:', error);
    res.status(500).json({ error: 'internal_server_error', message: error.message });
  }
});

/**
 * GET /api/previews/health
 * Health check endpoint
 */
previewsRouter.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});
