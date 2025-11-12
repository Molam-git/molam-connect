/**
 * Brique 50 - Fiscal Reporting
 * API Routes
 */

import { Router, Request, Response } from "express";
import { requireRole } from "../utils/authz.js";
import { generateFiscalReport, getReportById, listReports } from "../services/fiscalReportService.js";
import { submitReport, getSubmissionHistory } from "../services/submissionService.js";
import { pool } from "../utils/db.js";
import { generateSignedURL } from "../utils/s3.js";

export const fiscalRouter = Router();

/**
 * Generate a fiscal report (Ops)
 * POST /api/fiscal/reports/generate
 */
fiscalRouter.post("/reports/generate", requireRole("finance_ops", "tax_ops"), async (req: any, res: Response) => {
  try {
    const { legalEntity, reportType, periodStart, periodEnd } = req.body;

    if (!legalEntity || !reportType || !periodStart || !periodEnd) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const report = await generateFiscalReport({
      legalEntity,
      reportType,
      periodStart,
      periodEnd,
      createdBy: req.user.id,
    });

    res.json(report);
  } catch (err: any) {
    console.error("Report generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List fiscal reports
 * GET /api/fiscal/reports
 */
fiscalRouter.get("/reports", requireRole("finance_ops", "tax_ops", "auditor"), async (req: any, res: Response) => {
  try {
    const filters = {
      legalEntity: req.query.legal_entity as string,
      country: req.query.country as string,
      status: req.query.status as string,
    };

    const reports = await listReports(filters);
    res.json(reports);
  } catch (err: any) {
    console.error("List reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get report by ID
 * GET /api/fiscal/reports/:id
 */
fiscalRouter.get("/reports/:id", requireRole("finance_ops", "tax_ops", "auditor"), async (req: any, res: Response) => {
  try {
    const report = await getReportById(req.params.id);
    res.json(report);
  } catch (err: any) {
    console.error("Get report error:", err);
    res.status(404).json({ error: err.message });
  }
});

/**
 * Submit a report to a channel
 * POST /api/fiscal/reports/:id/submit
 */
fiscalRouter.post("/reports/:id/submit", requireRole("finance_ops", "tax_ops"), async (req: any, res: Response) => {
  try {
    const reportId = req.params.id;
    const { channelId, idempotencyKey } = req.body;

    if (!channelId) {
      res.status(400).json({ error: "channel_id_required" });
      return;
    }

    const result = await submitReport({
      reportId,
      channelId,
      idempotencyKey,
      requestedBy: req.user.id,
    });

    res.json(result);
  } catch (err: any) {
    console.error("Submit report error:", err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get submission history for a report
 * GET /api/fiscal/reports/:id/submissions
 */
fiscalRouter.get("/reports/:id/submissions", requireRole("finance_ops", "tax_ops", "auditor"), async (req: any, res: Response) => {
  try {
    const history = await getSubmissionHistory(req.params.id);
    res.json(history);
  } catch (err: any) {
    console.error("Get submission history error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get signed URL for viewing artifact
 * GET /api/fiscal/reports/:id/artifact
 */
fiscalRouter.get("/reports/:id/artifact", requireRole("finance_ops", "tax_ops", "auditor"), async (req: any, res: Response) => {
  try {
    const report = await getReportById(req.params.id);

    if (!report.artifact_s3_key) {
      res.status(404).json({ error: "artifact_not_found" });
      return;
    }

    const url = await generateSignedURL(report.artifact_s3_key, 3600);
    res.json({ url, key: report.artifact_s3_key });
  } catch (err: any) {
    console.error("Get artifact URL error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List submission channels
 * GET /api/fiscal/channels
 */
fiscalRouter.get("/channels", requireRole("finance_ops", "tax_ops"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, country, authority, protocol, format, requires_signature, approval_required, status, priority
       FROM fiscal_submission_channels
       ORDER BY country ASC, priority ASC`
    );

    res.json(rows);
  } catch (err: any) {
    console.error("List channels error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List remediation tasks
 * GET /api/fiscal/remediations
 */
fiscalRouter.get("/remediations", requireRole("finance_ops", "tax_ops"), async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, fr.legal_entity, fr.report_type, fr.period_start, fr.period_end
       FROM fiscal_remediations r
       JOIN fiscal_reports fr ON fr.id = r.report_id
       WHERE r.status IN ('open', 'in_progress')
       ORDER BY r.severity DESC, r.created_at ASC
       LIMIT 100`
    );

    res.json(rows);
  } catch (err: any) {
    console.error("List remediations error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resolve remediation task
 * POST /api/fiscal/remediations/:id/resolve
 */
fiscalRouter.post("/remediations/:id/resolve", requireRole("finance_ops", "tax_ops"), async (req: any, res: Response) => {
  try {
    const { resolutionNotes } = req.body;

    await pool.query(
      `UPDATE fiscal_remediations
       SET status = 'resolved', resolution_notes = $1, resolved_at = now(), updated_at = now()
       WHERE id = $2`,
      [resolutionNotes, req.params.id]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("Resolve remediation error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Request approval for report
 * POST /api/fiscal/reports/:id/approve
 */
fiscalRouter.post("/reports/:id/approve", requireRole("finance_admin", "compliance_admin"), async (req: any, res: Response) => {
  try {
    const { comments } = req.body;

    await pool.query(
      `INSERT INTO fiscal_approvals(report_id, approver_id, approver_role, status, comments, approved_at)
       VALUES ($1, $2, $3, 'approved', $4, now())`,
      [req.params.id, req.user.id, req.user.roles[0], comments]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("Approve report error:", err);
    res.status(500).json({ error: err.message });
  }
});
