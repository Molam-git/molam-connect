/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * API Routes: Predictions, feedback, explain, review queue
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { auth } from "../auth";
import { requireRole, scopeByTenant } from "../utils/rbac";
import { computeExplain } from "../services/explainService";
import { checkMultisigRequirement, userHasMultiSig, recordMultisigApproval } from "../services/multisigService";
import { storeEvidence, generatePresignedUrl } from "../services/evidenceService";
import { publishEvent } from "../webhooks/publisher";
import { logAudit, getAuditContext } from "../utils/audit";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info"
});

export const siraRouter = Router();

// All routes require auth
siraRouter.use(auth);
siraRouter.use(scopeByTenant);

/**
 * GET /api/sira/predictions
 * List predictions with pagination & filters
 */
siraRouter.get("/predictions", requireRole(["sira_reviewer", "pay_admin", "auditor"]), async (req: Request, res: Response) => {
  try {
    const { from, to, product, status, label, limit = 50, cursor } = req.query;
    const user = req.user!;
    const tenantId = user.tenant_id;

    // Build query with tenant scoping
    let query = `
      SELECT 
        p.id,
        p.event_id,
        p.model_id,
        p.product,
        p.score,
        p.decision,
        p.created_at,
        p.features,
        COUNT(DISTINCT f.id) as feedback_count,
        MAX(f.created_at) as last_feedback_at,
        ARRAY_AGG(DISTINCT f.label) FILTER (WHERE f.label IS NOT NULL) as feedback_labels,
        rq.status as review_queue_status
      FROM siramodel_predictions p
      LEFT JOIN sira_feedback f ON f.prediction_id = p.id
      LEFT JOIN sira_review_queue rq ON rq.prediction_id = p.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Tenant scoping (unless admin)
    if (tenantId && !user.roles.includes("pay_admin")) {
      query += ` AND p.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    // Filters
    if (product) {
      query += ` AND p.product = $${paramIndex++}`;
      params.push(product);
    }

    if (status) {
      query += ` AND rq.status = $${paramIndex++}`;
      params.push(status);
    }

    if (label) {
      query += ` AND EXISTS (
        SELECT 1 FROM sira_feedback f2 
        WHERE f2.prediction_id = p.id AND f2.label = $${paramIndex}
      )`;
      params.push(label);
      paramIndex++;
    }

    // Date range
    const fromTs = from || "1970-01-01";
    const toTs = to || new Date().toISOString();
    query += ` AND p.created_at BETWEEN $${paramIndex++}::timestamptz AND $${paramIndex++}::timestamptz`;

    params.push(fromTs, toTs);

    // Group by and order
    query += ` GROUP BY p.id, rq.status ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), cursor ? Number(cursor) : 0);

    const { rows } = await pool.query(query, params);

    logger.info({ count: rows.length, user: user.id }, "Listed predictions");

    res.json({ rows, cursor: Number(cursor || 0) + rows.length });
  } catch (error: any) {
    logger.error({ error }, "Failed to list predictions");
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * GET /api/sira/predictions/:id
 * Get single prediction + explain
 */
siraRouter.get("/predictions/:id", requireRole(["sira_reviewer", "pay_admin", "auditor"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // Get prediction
    const { rows } = await pool.query(
      `SELECT * FROM siramodel_predictions WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "prediction_not_found" });
    }

    const pred = rows[0];

    // Check tenant access
    if (user.tenant_id && pred.tenant_id !== user.tenant_id && !user.roles.includes("pay_admin")) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Get explain (prefer cached)
    let explain = null;
    const { rows: exRows } = await pool.query(
      `SELECT explain_json, computed_at 
       FROM sira_explain_cache 
       WHERE prediction_id = $1`,
      [id]
    );

    if (exRows.length > 0) {
      explain = exRows[0].explain_json;
      // Update cache hit count
      await pool.query(
        `UPDATE sira_explain_cache 
         SET cache_hit_count = cache_hit_count + 1,
             last_accessed_at = now()
         WHERE prediction_id = $1`,
        [id]
      );
    } else {
      // Compute explain
      logger.info({ predictionId: id }, "Computing explain (cache miss)");
      const startTime = Date.now();
      explain = await computeExplain(pred);
      const computationTime = Date.now() - startTime;

      // Cache result
      await pool.query(
        `INSERT INTO sira_explain_cache (prediction_id, explain_json, computation_time_ms, computed_by)
         VALUES ($1, $2, $3, 'explainer_service')
         ON CONFLICT (prediction_id) 
         DO UPDATE SET explain_json = $2, computed_at = now(), computation_time_ms = $3`,
        [id, JSON.stringify(explain), computationTime]
      );
    }

    // Get feedback history
    const { rows: feedbackRows } = await pool.query(
      `SELECT * FROM sira_feedback 
       WHERE prediction_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );

    // Get review queue status
    const { rows: queueRows } = await pool.query(
      `SELECT * FROM sira_review_queue 
       WHERE prediction_id = $1`,
      [id]
    );

    res.json({
      prediction: pred,
      explain,
      feedback: feedbackRows,
      review_queue: queueRows[0] || null
    });
  } catch (error: any) {
    logger.error({ error, predictionId: req.params.id }, "Failed to get prediction");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/sira/feedback
 * Create feedback (label + evidence)
 */
siraRouter.post("/feedback", requireRole(["sira_reviewer", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { prediction_id, label, comment, override_decision, evidence = [] } = req.body;
    const user = req.user!;

    // Validate label
    if (!["fraud", "ok", "needs_review", "false_positive", "false_negative"].includes(label)) {
      return res.status(400).json({ error: "invalid_label" });
    }

    // Get prediction
    const { rows: predRows } = await pool.query(
      `SELECT * FROM siramodel_predictions WHERE id = $1`,
      [prediction_id]
    );

    if (predRows.length === 0) {
      return res.status(404).json({ error: "prediction_not_found" });
    }

    const pred = predRows[0];

    // Check tenant access
    if (user.tenant_id && pred.tenant_id !== user.tenant_id && !user.roles.includes("pay_admin")) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Check multi-sig requirement if override
    let requiresMultisig = false;
    if (override_decision) {
      requiresMultisig = await checkMultisigRequirement(pred, override_decision);
      
      if (requiresMultisig) {
        const hasMultiSig = await userHasMultiSig(user.id, pred.id);
        if (!hasMultiSig) {
          return res.status(403).json({
            error: "multisig_required",
            message: "Multi-signature approval required for this override"
          });
        }
      }
    }

    // Create feedback
    const { rows: feedbackRows } = await pool.query(
      `INSERT INTO sira_feedback
       (prediction_id, reviewer_id, reviewer_role, label, override_decision, comment, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        prediction_id,
        user.id,
        user.roles.join(","),
        label,
        override_decision || null,
        comment || null,
        JSON.stringify(evidence)
      ]
    );

    const feedback = feedbackRows[0];

    // Record multi-sig approval if applicable
    if (requiresMultisig) {
      await recordMultisigApproval(feedback.id, user.id, user.roles[0], "override_decision", req);
    }

    // Close review queue item
    await pool.query(
      `UPDATE sira_review_queue 
       SET status = 'closed',
           closed_at = now(),
           closed_by = $1,
           updated_at = now()
       WHERE prediction_id = $2`,
      [user.id, prediction_id]
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    await logAudit({
      merchant_id: pred.tenant_id || "",
      ...auditCtx,
      action: "sira.feedback.created",
      details: {
        prediction_id,
        label,
        override_decision,
        feedback_id: feedback.id
      }
    });

    // Publish event for retraining ingestion
    await publishEvent("internal", process.env.SIRA_TRAINING_TENANT || "sira", "sira.feedback.created", {
      prediction_id,
      label,
      reviewer: user.id,
      feedback_id: feedback.id
    });

    logger.info({ predictionId: prediction_id, label, reviewer: user.id }, "Feedback created");

    res.json({ ok: true, feedback });
  } catch (error: any) {
    logger.error({ error }, "Failed to create feedback");
    res.status(500).json({ error: "internal_server_error", message: error.message });
  }
});

/**
 * POST /api/sira/review_queue/:id/assign
 * Assign reviewer to queue item
 */
siraRouter.post("/review_queue/:id/assign", requireRole(["pay_admin", "sira_reviewer"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;
    const user = req.user!;

    await pool.query(
      `UPDATE sira_review_queue 
       SET assigned_to = $1,
           status = 'in_progress',
           assigned_at = now(),
           assigned_by = $2,
           updated_at = now()
       WHERE id = $3`,
      [assigned_to, user.id, id]
    );

    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ error }, "Failed to assign reviewer");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/sira/review_queue/:id/close
 * Close queue item
 */
siraRouter.post("/review_queue/:id/close", requireRole(["pay_admin", "sira_reviewer"]), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user!;

    await pool.query(
      `UPDATE sira_review_queue 
       SET status = 'closed',
           closed_at = now(),
           closed_by = $1,
           closure_reason = $2,
           updated_at = now()
       WHERE id = $3`,
      [user.id, reason || null, id]
    );

    res.json({ ok: true });
  } catch (error: any) {
    logger.error({ error }, "Failed to close queue item");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * GET /api/sira/metrics
 * Aggregated metrics for UI
 */
siraRouter.get("/metrics", requireRole(["sira_reviewer", "pay_admin", "auditor"]), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const tenantFilter = user.tenant_id && !user.roles.includes("pay_admin") 
      ? `AND p.tenant_id = '${user.tenant_id}'` 
      : "";

    // Total predictions
    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*) as count FROM siramodel_predictions p WHERE 1=1 ${tenantFilter}`
    );

    // Pending reviews
    const { rows: pendingRows } = await pool.query(
      `SELECT COUNT(*) as count 
       FROM sira_review_queue rq
       JOIN siramodel_predictions p ON p.id = rq.prediction_id
       WHERE rq.status = 'open' ${tenantFilter}`
    );

    // Feedback distribution
    const { rows: feedbackRows } = await pool.query(
      `SELECT label, COUNT(*) as count
       FROM sira_feedback f
       JOIN siramodel_predictions p ON p.id = f.prediction_id
       WHERE f.created_at >= now() - interval '7 days' ${tenantFilter}
       GROUP BY label`
    );

    // Explain cache hit rate
    const { rows: cacheRows } = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(cache_hit_count) as hits
       FROM sira_explain_cache`
    );

    res.json({
      total_predictions: Number(totalRows[0].count),
      pending_reviews: Number(pendingRows[0].count),
      feedback_distribution: feedbackRows.reduce((acc, row) => {
        acc[row.label] = Number(row.count);
        return acc;
      }, {} as Record<string, number>),
      explain_cache_hit_rate: cacheRows[0].total > 0
        ? (Number(cacheRows[0].hits) / Number(cacheRows[0].total)) * 100
        : 0
    });
  } catch (error: any) {
    logger.error({ error }, "Failed to get metrics");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/sira/override
 * Override decision (with multi-sig enforcement)
 */
siraRouter.post("/override", requireRole(["pay_admin", "sira_reviewer"]), async (req: Request, res: Response) => {
  try {
    const { prediction_id, override_decision, justification } = req.body;
    const user = req.user!;

    // Get prediction
    const { rows: predRows } = await pool.query(
      `SELECT * FROM siramodel_predictions WHERE id = $1`,
      [prediction_id]
    );

    if (predRows.length === 0) {
      return res.status(404).json({ error: "prediction_not_found" });
    }

    const pred = predRows[0];

    // Check multi-sig requirement
    const requiresMultisig = await checkMultisigRequirement(pred, override_decision);
    
    if (requiresMultisig) {
      const hasMultiSig = await userHasMultiSig(user.id, pred.id);
      if (!hasMultiSig) {
        return res.status(403).json({
          error: "multisig_required",
          message: "Multi-signature approval required"
        });
      }
    }

    // Create feedback with override
    const { rows: feedbackRows } = await pool.query(
      `INSERT INTO sira_feedback
       (prediction_id, reviewer_id, reviewer_role, label, override_decision, comment)
       VALUES ($1, $2, $3, 'needs_review', $4, $5)
       RETURNING *`,
      [prediction_id, user.id, user.roles.join(","), override_decision, justification]
    );

    const feedback = feedbackRows[0];

    // Record multi-sig if applicable
    if (requiresMultisig) {
      await recordMultisigApproval(feedback.id, user.id, user.roles[0], "override_decision", req);
    }

    res.json({ ok: true, feedback });
  } catch (error: any) {
    logger.error({ error }, "Failed to override decision");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/s3/presign
 * Generate presigned URL for evidence upload
 */
siraRouter.post("/s3/presign", requireRole(["sira_reviewer", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { filename, contentType } = req.body;
    const user = req.user!;

    const { url, key } = await generatePresignedUrl(filename, contentType, user.id);

    res.json({ presigned_url: url, s3_key: key });
  } catch (error: any) {
    logger.error({ error }, "Failed to generate presigned URL");
    res.status(500).json({ error: "internal_server_error" });
  }
});

/**
 * POST /api/sira/upload_evidence
 * Register evidence after S3 upload
 */
siraRouter.post("/upload_evidence", requireRole(["sira_reviewer", "pay_admin"]), async (req: Request, res: Response) => {
  try {
    const { feedback_id, s3_key, evidence_type, file_hash, file_size, content_type } = req.body;
    const user = req.user!;

    const evidence = await storeEvidence({
      feedback_id,
      s3_key,
      evidence_type,
      file_hash,
      file_size,
      content_type,
      uploaded_by: user.id
    });

    res.json({ ok: true, evidence });
  } catch (error: any) {
    logger.error({ error }, "Failed to register evidence");
    res.status(500).json({ error: "internal_server_error" });
  }
});

