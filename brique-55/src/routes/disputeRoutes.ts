/**
 * Dispute Routes - REST API endpoints
 */
import express from "express";
import { AuthRequest, requireRole } from "../utils/authz.js";
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { storeFileWORM, hashBuffer } from "../utils/storage.js";
import {
  createDispute,
  getDispute,
  listDisputes,
  assignDispute,
  resolveDispute,
} from "../services/disputeService.js";

const router = express.Router();

/**
 * POST /api/disputes/ingest
 * Ingest network callback (signed webhook from Visa/Mastercard/etc)
 */
router.post("/ingest", async (req, res): Promise<void> => {
  try {
    const { network, payload, external_id } = req.body;

    if (!network || !payload) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    // Store raw callback
    await pool.query(
      `INSERT INTO dispute_callbacks_raw (external_id, network, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (external_id) DO NOTHING`,
      [external_id || payload.id, network, payload]
    );

    // Acknowledge receipt (worker will process asynchronously)
    await publishEvent("internal", "treasury", "dispute.callback_received", {
      network,
      external_id: external_id || payload.id,
    });

    res.status(202).json({ ok: true, message: "callback_queued" });
  } catch (error: any) {
    console.error("Ingest error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes
 * Create manual dispute (merchant/customer claim)
 */
router.post("/", requireRole("merchant_admin", "connect_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const idempotencyKey = req.headers["idempotency-key"] as string;
    const { payment_id, amount, currency, reason_code, origin, metadata } = req.body;

    if (!payment_id || !amount || !currency || !reason_code) {
      res.status(400).json({ error: "missing_required_fields" });
      return;
    }

    const dispute = await createDispute(
      {
        idempotencyKey,
        paymentId: payment_id,
        merchantId: req.user!.merchantId!,
        amount,
        currency,
        reasonCode: reason_code,
        origin,
        metadata,
      },
      req.user!.id
    );

    res.status(201).json(dispute);
  } catch (error: any) {
    console.error("Create dispute error:", error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id
 * Get dispute details with evidences and timeline
 */
router.get("/:id", requireRole("merchant_admin", "connect_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const dispute = await getDispute(id);

    // Authorization check
    if (
      !req.user!.roles.includes("connect_ops") &&
      dispute.merchant_id !== req.user!.merchantId
    ) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // Fetch evidences
    const { rows: evidences } = await pool.query(
      "SELECT * FROM dispute_evidences WHERE dispute_id = $1 ORDER BY uploaded_at DESC",
      [id]
    );

    // Fetch timeline
    const { rows: timeline } = await pool.query(
      "SELECT * FROM dispute_timeline WHERE dispute_id = $1 ORDER BY created_at DESC",
      [id]
    );

    res.json({ ...dispute, evidences, timeline });
  } catch (error: any) {
    console.error("Get dispute error:", error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/disputes
 * List disputes with filters
 */
router.get("/", requireRole("merchant_admin", "connect_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { status, from, to, limit, offset } = req.query;

    const filters: any = {
      merchantId: req.user!.roles.includes("connect_ops") ? undefined : req.user!.merchantId,
      status: status as string,
      fromDate: from ? new Date(from as string) : undefined,
      toDate: to ? new Date(to as string) : undefined,
      limit: limit ? parseInt(limit as string) : 20,
      offset: offset ? parseInt(offset as string) : 0,
    };

    const result = await listDisputes(filters);
    res.json(result);
  } catch (error: any) {
    console.error("List disputes error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes/:id/evidence
 * Upload evidence (multipart/form-data)
 */
router.post(
  "/:id/evidence",
  requireRole("merchant_admin", "connect_ops"),
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { id } = req.params;
      const dispute = await getDispute(id);

      // Authorization check
      if (
        !req.user!.roles.includes("connect_ops") &&
        dispute.merchant_id !== req.user!.merchantId
      ) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      // Check if file uploaded
      const files = (req as any).files;
      if (!files || !files.file) {
        res.status(400).json({ error: "no_file" });
        return;
      }

      const file = files.file;
      const buf = file.data as Buffer;
      const hash = hashBuffer(buf);
      const type = req.body.type || "other";

      // Store in WORM S3
      const s3Key = await storeFileWORM(buf, `disputes/${id}/${Date.now()}_${file.name}`);

      // Record in database
      await pool.query(
        `INSERT INTO dispute_evidences (
          dispute_id, uploader_id, type, s3_key, hash, size_bytes, content_meta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          req.user!.id,
          type,
          s3Key,
          hash,
          buf.length,
          { filename: file.name, mimetype: file.mimetype },
        ]
      );

      // Log timeline
      await pool.query(
        `INSERT INTO dispute_timeline (dispute_id, actor_id, actor_type, action, details)
         VALUES ($1, $2, $3, 'evidence_uploaded', $4)`,
        [id, req.user!.id, req.user!.roles.includes("connect_ops") ? "ops" : "merchant", { s3Key, hash, type }]
      );

      // Publish webhook
      await publishEvent("merchant", dispute.merchant_id, "dispute.evidence.uploaded", {
        dispute_id: id,
        evidence_type: type,
      });

      res.json({ ok: true, s3_key: s3Key, hash });
    } catch (error: any) {
      console.error("Upload evidence error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/disputes/:id/respond
 * Submit response to network
 */
router.post("/:id/respond", requireRole("connect_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { evidence_ids, message } = req.body;

    const dispute = await getDispute(id);

    // Update dispute
    await pool.query(
      `UPDATE disputes
       SET status = 'responding', response_submitted_at = now(), updated_at = now()
       WHERE id = $1`,
      [id]
    );

    // Log timeline
    await pool.query(
      `INSERT INTO dispute_timeline (dispute_id, actor_id, actor_type, action, details)
       VALUES ($1, $2, 'ops', 'response_submitted', $3)`,
      [id, req.user!.id, { evidence_ids, message }]
    );

    // Publish webhook
    await publishEvent("merchant", dispute.merchant_id, "dispute.responded", {
      dispute_id: id,
      evidence_count: evidence_ids?.length || 0,
    });

    res.json({ ok: true });
  } catch (error: any) {
    console.error("Respond error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes/:id/assign
 * Assign dispute to ops user
 */
router.post("/:id/assign", requireRole("connect_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      res.status(400).json({ error: "assigned_to_required" });
      return;
    }

    await assignDispute(id, assigned_to, req.user!.id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error("Assign error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/disputes/:id/resolve
 * Ops resolve dispute
 */
router.post("/:id/resolve", requireRole("connect_ops", "finance_ops"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { outcome, network_fee, details } = req.body;

    if (!outcome || !["merchant_won", "merchant_lost", "voided", "cancelled"].includes(outcome)) {
      res.status(400).json({ error: "invalid_outcome" });
      return;
    }

    const resolution = await resolveDispute(
      id,
      outcome,
      req.user!.id,
      network_fee || 0,
      details || {}
    );

    res.json({ ok: true, resolution });
  } catch (error: any) {
    console.error("Resolve error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/disputes/:id/audit
 * Get audit log (timeline)
 */
router.get("/:id/audit", requireRole("connect_ops", "auditor"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { rows: timeline } = await pool.query(
      "SELECT * FROM dispute_timeline WHERE dispute_id = $1 ORDER BY created_at ASC",
      [id]
    );

    res.json({ dispute_id: id, timeline });
  } catch (error: any) {
    console.error("Audit error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
