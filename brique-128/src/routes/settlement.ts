// ============================================================================
// Settlement API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";
import { processInstruction, createInstruction } from "../services/settlement-engine";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const settlementRouter = Router();

/**
 * GET /api/treasury/settlement - List settlement instructions
 */
settlementRouter.get("/", async (req: any, res) => {
  const limit = Number(req.query.limit) || 50;
  const status = req.query.status;

  try {
    let query = `SELECT si.*, bp.name as bank_name
                 FROM settlement_instructions si
                 LEFT JOIN bank_profiles bp ON bp.id = si.bank_profile_id`;
    const params: any[] = [limit];

    if (status) {
      query += ` WHERE si.status=$2`;
      params.push(status);
    }

    query += ` ORDER BY si.created_at DESC LIMIT $1`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/settlement/:id - Get instruction details
 */
settlementRouter.get("/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows: [instr] } = await pool.query(
      `SELECT si.*, bp.name as bank_name
       FROM settlement_instructions si
       LEFT JOIN bank_profiles bp ON bp.id = si.bank_profile_id
       WHERE si.id=$1`,
      [id]
    );

    if (!instr) {
      return res.status(404).json({ error: "instruction_not_found" });
    }

    // Get logs
    const { rows: logs } = await pool.query(
      `SELECT * FROM settlement_logs WHERE instruction_id=$1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({ ...instr, logs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/settlement - Create settlement instruction
 */
settlementRouter.post("/", async (req: any, res) => {
  const { payout_id, bank_profile_id, amount, currency, rail, idempotency_key } = req.body;

  try {
    const instr = await createInstruction({
      payoutId: payout_id,
      bankProfileId: bank_profile_id,
      amount: Number(amount),
      currency,
      rail,
      idempotencyKey: idempotency_key
    });

    res.json(instr);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/settlement/:id/retry - Retry failed instruction
 */
settlementRouter.post("/:id/retry", async (req: any, res) => {
  const { id } = req.params;

  try {
    // Reset to pending
    await pool.query(
      `UPDATE settlement_instructions SET status='pending', failure_reason=NULL WHERE id=$1`,
      [id]
    );

    res.json({ success: true, message: "Instruction queued for retry" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/settlement/:id/process - Process instruction immediately
 */
settlementRouter.post("/:id/process", async (req: any, res) => {
  const { id } = req.params;

  try {
    const result = await processInstruction(id);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/settlement/stats - Settlement statistics
 */
settlementRouter.get("/stats", async (req: any, res) => {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='sent') as sent,
        COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) FILTER (WHERE status='confirmed') as avg_time_seconds
      FROM settlement_instructions
      WHERE created_at > now() - interval '24 hours'
    `);

    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
