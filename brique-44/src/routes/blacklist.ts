// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Blacklist Management Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { authMiddleware, requireRole } from "../utils/auth";

export const blacklistRouter = Router();

// Apply authentication and fraud_ops role to all routes
blacklistRouter.use(authMiddleware);
blacklistRouter.use(requireRole("fraud_ops"));

// ============================================================================
// POST /api/fraud/blacklist - Add to blacklist
// ============================================================================
blacklistRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { list_type, value, reason, severity, expires_at } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!list_type || !value) {
      res.status(400).json({
        error: "missing_required_fields",
        required: ["list_type", "value"],
      });
      return;
    }

    // Validate list_type
    const validTypes = ["ip", "card_bin", "email", "device", "user", "asn"];
    if (!validTypes.includes(list_type)) {
      res.status(400).json({
        error: "invalid_list_type",
        allowed: validTypes,
      });
      return;
    }

    // Validate severity
    const validSeverities = ["low", "medium", "high", "critical"];
    const severityValue = severity || "medium";
    if (!validSeverities.includes(severityValue)) {
      res.status(400).json({
        error: "invalid_severity",
        allowed: validSeverities,
      });
      return;
    }

    const query = `
      INSERT INTO fraud_blacklist (
        list_type, value, reason, severity, expires_at, added_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (list_type, value) DO UPDATE SET
        reason = EXCLUDED.reason,
        severity = EXCLUDED.severity,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
      RETURNING *
    `;

    const values = [
      list_type,
      value,
      reason || "Manual blacklist addition",
      severityValue,
      expires_at || null,
      userId,
    ];

    const result = await pool.query(query, values);

    // Log audit trail
    const auditQuery = `
      INSERT INTO fraud_audit_logs (
        action, actor_id, actor_type, metadata
      ) VALUES ($1, $2, 'fraud_ops', $3)
    `;
    await pool.query(auditQuery, [
      "blacklist_add",
      userId,
      JSON.stringify({ list_type, value, reason, severity: severityValue }),
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Add blacklist error:", error);
    res.status(500).json({ error: "add_blacklist_failed", details: error.message });
  }
});

// ============================================================================
// GET /api/fraud/blacklist - List blacklist entries
// ============================================================================
blacklistRouter.get("/", async (req: Request, res: Response) => {
  try {
    const list_type = req.query.list_type as string;
    const severity = req.query.severity as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM fraud_blacklist
      WHERE (expires_at IS NULL OR expires_at > now())
    `;

    const values: any[] = [];
    let paramIndex = 1;

    if (list_type) {
      query += ` AND list_type = $${paramIndex}`;
      values.push(list_type);
      paramIndex++;
    }

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      values.push(severity);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    const countQuery = `
      SELECT COUNT(*) FROM fraud_blacklist
      WHERE (expires_at IS NULL OR expires_at > now())
    `;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.status(200).json({
      blacklist: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("List blacklist error:", error);
    res.status(500).json({ error: "list_blacklist_failed", details: error.message });
  }
});

// ============================================================================
// DELETE /api/fraud/blacklist/:id - Remove from blacklist
// ============================================================================
blacklistRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get entry details before deletion for audit log
    const getQuery = `SELECT * FROM fraud_blacklist WHERE id = $1`;
    const getResult = await pool.query(getQuery, [id]);

    if (getResult.rows.length === 0) {
      res.status(404).json({ error: "blacklist_entry_not_found" });
      return;
    }

    const entry = getResult.rows[0];

    // Delete entry
    const deleteQuery = `DELETE FROM fraud_blacklist WHERE id = $1`;
    await pool.query(deleteQuery, [id]);

    // Log audit trail
    const auditQuery = `
      INSERT INTO fraud_audit_logs (
        action, actor_id, actor_type, metadata
      ) VALUES ($1, $2, 'fraud_ops', $3)
    `;
    await pool.query(auditQuery, [
      "blacklist_remove",
      userId,
      JSON.stringify({
        list_type: entry.list_type,
        value: entry.value,
        reason: entry.reason
      }),
    ]);

    res.status(200).json({ success: true, deleted: entry });
  } catch (error: any) {
    console.error("Remove blacklist error:", error);
    res.status(500).json({ error: "remove_blacklist_failed", details: error.message });
  }
});

// ============================================================================
// GET /api/fraud/blacklist/check/:type/:value - Check if blacklisted
// ============================================================================
blacklistRouter.get("/check/:type/:value", async (req: Request, res: Response) => {
  try {
    const { type, value } = req.params;

    const query = `
      SELECT * FROM fraud_blacklist
      WHERE list_type = $1
        AND value = $2
        AND (expires_at IS NULL OR expires_at > now())
    `;

    const result = await pool.query(query, [type, value]);

    if (result.rows.length === 0) {
      res.status(200).json({ blacklisted: false });
      return;
    }

    res.status(200).json({
      blacklisted: true,
      entry: result.rows[0],
    });
  } catch (error: any) {
    console.error("Check blacklist error:", error);
    res.status(500).json({ error: "check_blacklist_failed", details: error.message });
  }
});
