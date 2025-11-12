/**
 * Brique 48 - Radar Routes
 * Risk evaluation and merchant endpoints
 */

import { Router, Request, Response } from "express";
import { pool } from "../utils/db.js";
import { authenticateJWT, requireRole } from "../utils/authz.js";
import { evaluateTransaction } from "../radar/engine.js";

const router = Router();

/**
 * POST /api/radar/evaluate
 * Evaluate a transaction for fraud risk
 * Internal endpoint (no auth) - called by payment services
 */
router.post("/evaluate", async (req: Request, res: Response) => {
  try {
    const tx = req.body;

    if (!tx.id || !tx.amount || !tx.currency) {
      return res.status(400).json({ error: { message: "Missing required fields", type: "validation_error" } });
    }

    const decision = await evaluateTransaction(tx);

    res.json(decision);
  } catch (err: any) {
    console.error("Evaluation error:", err);
    res.status(500).json({ error: { message: "Evaluation failed", type: "server_error" } });
  }
});

/**
 * GET /api/radar/merchants/:merchantId/decisions
 * List risk decisions for a merchant
 */
router.get("/merchants/:merchantId/decisions", authenticateJWT, requireRole("merchant_admin", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { decision, limit = 50, offset = 0 } = req.query;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    let query = `SELECT id, transaction_id, transaction_type, amount, currency, decision, confidence, ml_score, reason, risk_flags, created_at
                 FROM risk_decisions
                 WHERE merchant_id = $1`;
    const params: any[] = [merchantId];

    if (decision) {
      query += ` AND decision = $${params.length + 1}`;
      params.push(decision);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ data: rows });
  } catch (err: any) {
    console.error("Error fetching decisions:", err);
    res.status(500).json({ error: { message: "Failed to fetch decisions", type: "database_error" } });
  }
});

/**
 * GET /api/radar/merchants/:merchantId/profile
 * Get merchant risk profile
 */
router.get("/merchants/:merchantId/profile", authenticateJWT, requireRole("merchant_admin", "pay_admin"), async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== merchantId) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    const { rows: [profile] } = await pool.query(
      `SELECT * FROM merchant_risk_profiles WHERE merchant_id = $1`,
      [merchantId]
    );

    if (!profile) {
      return res.status(404).json({ error: { message: "Profile not found", type: "not_found" } });
    }

    res.json(profile);
  } catch (err: any) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: { message: "Failed to fetch profile", type: "database_error" } });
  }
});

/**
 * GET /api/radar/decisions/:id
 * Get decision details
 */
router.get("/decisions/:id", authenticateJWT, requireRole("merchant_admin", "pay_admin", "risk_ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows: [decision] } = await pool.query(
      `SELECT * FROM risk_decisions WHERE id = $1`,
      [id]
    );

    if (!decision) {
      return res.status(404).json({ error: { message: "Decision not found", type: "not_found" } });
    }

    // Verify access
    if (req.user && req.user.roles.includes("merchant_admin") && req.user.merchantId !== decision.merchant_id) {
      return res.status(403).json({ error: { message: "Access denied", type: "forbidden" } });
    }

    res.json(decision);
  } catch (err: any) {
    console.error("Error fetching decision:", err);
    res.status(500).json({ error: { message: "Failed to fetch decision", type: "database_error" } });
  }
});

export default router;
