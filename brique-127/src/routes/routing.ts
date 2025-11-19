// ============================================================================
// Bank Routing API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";
import { selectBankForPayout } from "../services/routing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const routingRouter = Router();

/**
 * GET /api/treasury/routing/decisions - List routing decisions
 */
routingRouter.get("/decisions", async (req: any, res) => {
  const limit = Number(req.query.limit) || 50;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM bank_routing_decisions ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/routing/health - Bank health status
 */
routingRouter.get("/health", async (req: any, res) => {
  try {
    const { rows: health } = await pool.query(
      `SELECT bh.*, bp.name as bank_name
       FROM bank_health_metrics bh
       JOIN bank_profiles bp ON bp.id = bh.bank_profile_id
       ORDER BY bh.last_checked DESC`
    );

    const { rows: circuits } = await pool.query(
      `SELECT bc.*, bp.name as bank_name
       FROM bank_circuit_breakers bc
       JOIN bank_profiles bp ON bp.id = bc.bank_profile_id
       WHERE bc.state != 'closed'`
    );

    res.json({ health, circuits });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/routing/override/:decisionId - Override routing decision
 */
routingRouter.post("/override/:decisionId", async (req: any, res) => {
  const { decisionId } = req.params;
  const { bank_profile_id, reason } = req.body;

  try {
    const { rows: [decision] } = await pool.query(
      `UPDATE bank_routing_decisions
       SET chosen_bank_profile_id=$2, reason=$3, metadata=jsonb_set(metadata, '{override}', 'true')
       WHERE id=$1 RETURNING *`,
      [decisionId, bank_profile_id, reason || "manual_override"]
    );

    res.json(decision);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/routing/adjustments - Create routing adjustment
 */
routingRouter.post("/adjustments", async (req: any, res) => {
  const { bank_profile_id, scope, weight, expires_at } = req.body;

  try {
    const { rows: [adjustment] } = await pool.query(
      `INSERT INTO bank_routing_adjustments(bank_profile_id, scope, weight, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [bank_profile_id, scope, weight || 1.0, expires_at || null, req.user?.id || null]
    );

    res.json(adjustment);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/routing/adjustments - List adjustments
 */
routingRouter.get("/adjustments", async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ra.*, bp.name as bank_name
       FROM bank_routing_adjustments ra
       JOIN bank_profiles bp ON bp.id = ra.bank_profile_id
       WHERE ra.expires_at IS NULL OR ra.expires_at > now()
       ORDER BY ra.created_at DESC`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/routing/test - Test routing selection
 */
routingRouter.post("/test", async (req: any, res) => {
  const { amount, currency, country } = req.body;

  try {
    const decision = await selectBankForPayout({
      originModule: "test",
      amount: Number(amount),
      currency,
      country: country || "US"
    });

    res.json(decision);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
