// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Fraud Evaluation API Routes
// ============================================================================

import { Router, Request, Response } from "express";
import { pool } from "../utils/db";
import { scoreTransaction, ScoringContext } from "../services/scoring";
import { authMiddleware, requireRole } from "../utils/auth";

export const fraudRouter = Router();

// Apply authentication to all routes
fraudRouter.use(authMiddleware);

// ============================================================================
// POST /api/fraud/evaluate - Synchronous fraud evaluation
// ============================================================================
fraudRouter.post("/evaluate", async (req: Request, res: Response) => {
  try {
    const {
      txnId,
      userId,
      merchantId,
      amount,
      currency,
      country,
      ip,
      device,
      payment_method,
    } = req.body;

    // Validate required fields
    if (!txnId || !userId || !merchantId || !amount || !currency) {
      res.status(400).json({
        error: "missing_required_fields",
        required: ["txnId", "userId", "merchantId", "amount", "currency"],
      });
      return;
    }

    // Build scoring context
    const ctx: ScoringContext = {
      txnId,
      userId,
      merchantId,
      amount,
      currency,
      country: country || "US",
      ip: ip || req.ip || "127.0.0.1",
      device: device || {},
      payment_method: payment_method || {},
    };

    // Score transaction
    const result = await scoreTransaction(ctx);

    // Store decision in database
    const query = `
      INSERT INTO fraud_decisions (
        txn_id, user_id, merchant_id, decision, score, sira_score,
        confidence, reason, decided_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (txn_id) DO UPDATE SET
        decision = EXCLUDED.decision,
        score = EXCLUDED.score,
        sira_score = EXCLUDED.sira_score,
        confidence = EXCLUDED.confidence,
        reason = EXCLUDED.reason,
        decided_at = now()
      RETURNING *
    `;

    const values = [
      txnId,
      userId,
      merchantId,
      result.decision,
      result.score,
      result.sira_score,
      result.confidence,
      JSON.stringify(result.reasons),
      "auto",
    ];

    const dbResult = await pool.query(query, values);

    // If decision is "review", create review record
    if (result.decision === "review") {
      const reviewQuery = `
        INSERT INTO fraud_reviews (decision_id, priority, status)
        VALUES ($1, $2, 'pending')
      `;
      const priority = result.score >= 70 ? "high" : "medium";
      await pool.query(reviewQuery, [dbResult.rows[0].id, priority]);
    }

    res.status(200).json({
      decision: result.decision,
      score: result.score,
      sira_score: result.sira_score,
      confidence: result.confidence,
      reasons: result.reasons,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Fraud evaluation error:", error);
    res.status(500).json({ error: "evaluation_failed", details: error.message });
  }
});

// ============================================================================
// GET /api/fraud/decisions/:txnId - Get decision for specific transaction
// ============================================================================
fraudRouter.get("/decisions/:txnId", async (req: Request, res: Response) => {
  try {
    const { txnId } = req.params;

    const query = `
      SELECT * FROM fraud_decisions
      WHERE txn_id = $1
    `;

    const result = await pool.query(query, [txnId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "decision_not_found" });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (error: any) {
    console.error("Get decision error:", error);
    res.status(500).json({ error: "get_decision_failed", details: error.message });
  }
});

// ============================================================================
// GET /api/fraud/decisions - List decisions (paginated)
// ============================================================================
fraudRouter.get("/decisions", requireRole("fraud_ops", "auditor"), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const decision = req.query.decision as string;
    const merchantId = req.query.merchant_id as string;

    let query = `SELECT * FROM fraud_decisions WHERE 1=1`;
    const values: any[] = [];
    let paramIndex = 1;

    if (decision) {
      query += ` AND decision = $${paramIndex}`;
      values.push(decision);
      paramIndex++;
    }

    if (merchantId) {
      query += ` AND merchant_id = $${paramIndex}`;
      values.push(merchantId);
      paramIndex++;
    }

    query += ` ORDER BY decided_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);

    const countQuery = `SELECT COUNT(*) FROM fraud_decisions`;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.status(200).json({
      decisions: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("List decisions error:", error);
    res.status(500).json({ error: "list_decisions_failed", details: error.message });
  }
});
