// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Manual Review Queue Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { authMiddleware, requireRole } from "../utils/auth";

export const reviewsRouter = Router();

// Apply authentication and fraud_ops role to all routes
reviewsRouter.use(authMiddleware);
reviewsRouter.use(requireRole("fraud_ops"));

// ============================================================================
// GET /api/fraud/reviews - Get review queue
// ============================================================================
reviewsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || "pending";
    const priority = req.query.priority as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        r.id,
        r.decision_id,
        r.priority,
        r.status,
        r.assigned_to,
        r.created_at,
        r.updated_at,
        d.txn_id,
        d.user_id,
        d.merchant_id,
        d.score,
        d.sira_score,
        d.confidence,
        d.reason
      FROM fraud_reviews r
      JOIN fraud_decisions d ON r.decision_id = d.id
      WHERE r.status = $1
    `;

    const values: any[] = [status];
    let paramIndex = 2;

    if (priority) {
      query += ` AND r.priority = $${paramIndex}`;
      values.push(priority);
      paramIndex++;
    }

    query += ` ORDER BY
      CASE r.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      r.created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    res.status(200).json({
      reviews: result.rows,
      pagination: { page, limit },
    });
  } catch (error: any) {
    console.error("Get reviews error:", error);
    res.status(500).json({ error: "get_reviews_failed", details: error.message });
  }
});

// ============================================================================
// POST /api/fraud/reviews/:id/assign - Assign review to agent
// ============================================================================
reviewsRouter.post("/:id/assign", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const query = `
      UPDATE fraud_reviews
      SET assigned_to = $1, status = 'in_progress', updated_at = now()
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `;

    const result = await pool.query(query, [userId, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "review_not_found_or_already_assigned" });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (error: any) {
    console.error("Assign review error:", error);
    res.status(500).json({ error: "assign_review_failed", details: error.message });
  }
});

// ============================================================================
// POST /api/fraud/reviews/:id/decide - Manual decision (allow/block)
// ============================================================================
reviewsRouter.post("/:id/decide", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { decision, notes, add_to_blacklist } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    // Validate decision
    if (!["allow", "block"].includes(decision)) {
      res.status(400).json({
        error: "invalid_decision",
        allowed: ["allow", "block"],
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get review details
      const reviewQuery = `
        SELECT r.*, d.txn_id, d.user_id, d.merchant_id
        FROM fraud_reviews r
        JOIN fraud_decisions d ON r.decision_id = d.id
        WHERE r.id = $1
      `;
      const reviewResult = await client.query(reviewQuery, [id]);

      if (reviewResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "review_not_found" });
        return;
      }

      const review = reviewResult.rows[0];

      // Update decision
      const updateDecisionQuery = `
        UPDATE fraud_decisions
        SET decision = $1, decided_by = $2, decided_at = now()
        WHERE id = $3
      `;
      await client.query(updateDecisionQuery, [decision, userId, review.decision_id]);

      // Update review status
      const updateReviewQuery = `
        UPDATE fraud_reviews
        SET status = 'resolved', notes = $1, updated_at = now()
        WHERE id = $2
      `;
      await client.query(updateReviewQuery, [notes || null, id]);

      // Add to blacklist if requested
      if (add_to_blacklist && decision === "block") {
        const { list_type, value, reason } = add_to_blacklist;

        const blacklistQuery = `
          INSERT INTO fraud_blacklist (list_type, value, reason, severity, added_by)
          VALUES ($1, $2, $3, 'high', $4)
          ON CONFLICT (list_type, value) DO NOTHING
        `;
        await client.query(blacklistQuery, [list_type, value, reason || "Manual review decision", userId]);
      }

      // Log audit trail
      const auditQuery = `
        INSERT INTO fraud_audit_logs (
          decision_id, action, actor_id, actor_type, metadata
        ) VALUES ($1, $2, $3, 'fraud_ops', $4)
      `;
      await client.query(auditQuery, [
        review.decision_id,
        `manual_${decision}`,
        userId,
        JSON.stringify({ notes, add_to_blacklist }),
      ]);

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        decision,
        txn_id: review.txn_id,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Manual decision error:", error);
    res.status(500).json({ error: "manual_decision_failed", details: error.message });
  }
});

// ============================================================================
// GET /api/fraud/reviews/stats - Review queue statistics
// ============================================================================
reviewsRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        COUNT(*) FILTER (WHERE priority = 'medium') as medium_priority,
        COUNT(*) FILTER (WHERE priority = 'low') as low_priority
      FROM fraud_reviews
      WHERE created_at >= now() - interval '24 hours'
    `;

    const result = await pool.query(query);

    res.status(200).json(result.rows[0]);
  } catch (error: any) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "get_stats_failed", details: error.message });
  }
});
