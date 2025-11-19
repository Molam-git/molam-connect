// ============================================================================
// Payouts API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";
import {
  createPayout,
  cancelPayout,
  getPayout,
  listPayouts,
  reconcilePayout,
} from "../services/payoutService";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const payoutsRouter = Router();

/**
 * POST /api/treasury/payouts - Create new payout
 * Requires Idempotency-Key header
 */
payoutsRouter.post("/payouts", async (req: any, res) => {
  const idempotency = req.headers["idempotency-key"];

  if (!idempotency) {
    return res.status(400).json({ error: "idempotency_key_required" });
  }

  try {
    const payout = await createPayout({
      idempotency,
      ...req.body,
    });

    res.status(201).json(payout);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/payouts/:id - Get payout details
 */
payoutsRouter.get("/payouts/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const payout = await getPayout(id);
    res.json(payout);
  } catch (e: any) {
    if (e.message === "payout_not_found") {
      return res.status(404).json({ error: "payout_not_found" });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/payouts - List payouts with filters
 */
payoutsRouter.get("/payouts", async (req: any, res) => {
  const {
    status,
    origin_module,
    currency,
    from,
    to,
    limit = 50,
    offset = 0,
  } = req.query;

  try {
    const payouts = await listPayouts({
      status,
      origin_module,
      currency,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json(payouts);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/payouts/:id/cancel - Cancel payout
 */
payoutsRouter.post("/payouts/:id/cancel", async (req: any, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const result = await cancelPayout(id, reason);
    res.json(result);
  } catch (e: any) {
    if (e.message.startsWith("cannot_cancel")) {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === "payout_not_found") {
      return res.status(404).json({ error: "payout_not_found" });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/payouts/:id/execute - Force execute payout now (admin)
 */
payoutsRouter.post("/payouts/:id/execute", async (req: any, res) => {
  const { id } = req.params;

  try {
    // Update scheduled_for to now and priority to highest
    await pool.query(
      `UPDATE payouts
       SET scheduled_for = now(),
           priority = 0,
           updated_at = now()
       WHERE id = $1 AND status IN ('pending','reserved')`,
      [id]
    );

    res.json({ executed: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/payouts/batch - Create payout batch
 */
payoutsRouter.post("/batches", async (req: any, res) => {
  const {
    batch_ref,
    payout_ids,
    treasury_account_id,
    scheduled_for,
  } = req.body;

  if (!batch_ref || !payout_ids || payout_ids.length === 0) {
    return res.status(400).json({ error: "invalid_batch_params" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create batch
    const { rows: [batch] } = await client.query(
      `INSERT INTO payout_batches(batch_ref, treasury_account_id, scheduled_for, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [
        batch_ref,
        treasury_account_id,
        scheduled_for || new Date(),
        req.user?.id || "system",
      ]
    );

    // Add items to batch
    for (const payoutId of payout_ids) {
      await client.query(
        `INSERT INTO payout_batch_items(batch_id, payout_id) VALUES ($1,$2)`,
        [batch.id, payoutId]
      );
    }

    // Update batch totals
    const { rows: [stats] } = await client.query(
      `SELECT COUNT(*) as count, SUM(amount) as total, currency
       FROM payouts
       WHERE id = ANY($1)
       GROUP BY currency`,
      [payout_ids]
    );

    await client.query(
      `UPDATE payout_batches
       SET total_count = $2, total_amount = $3, currency = $4
       WHERE id = $1`,
      [batch.id, stats?.count || 0, stats?.total || 0, stats?.currency || "USD"]
    );

    await client.query("COMMIT");

    res.status(201).json(batch);
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/treasury/batches/:id/lock - Lock batch for processing
 */
payoutsRouter.post("/batches/:id/lock", async (req: any, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE payout_batches SET status = 'locked', updated_at = now() WHERE id = $1`,
      [id]
    );

    res.json({ locked: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/batches - List batches
 */
payoutsRouter.get("/batches", async (req: any, res) => {
  const { status, limit = 50 } = req.query;

  try {
    let query = `SELECT * FROM payout_batches WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/treasury/reconcile - Reconcile payout with statement line
 */
payoutsRouter.post("/reconcile", async (req: any, res) => {
  const { payout_id, statement_line_id, matched_by, confidence_score } =
    req.body;

  if (!payout_id || !statement_line_id) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const result = await reconcilePayout({
      payout_id,
      statement_line_id,
      matched_by: matched_by || "manual",
      confidence_score,
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/treasury/stats - Get treasury statistics
 */
payoutsRouter.get("/stats", async (req: any, res) => {
  const { period = "24h" } = req.query;

  const intervalMap: any = {
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
  };

  const interval = intervalMap[period as string] || "24 hours";

  try {
    const { rows: [stats] } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'settled') as settled_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        SUM(amount) FILTER (WHERE status = 'settled') as settled_amount,
        currency
       FROM payouts
       WHERE requested_at > now() - interval '${interval}'
       GROUP BY currency`
    );

    res.json(stats || {});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
