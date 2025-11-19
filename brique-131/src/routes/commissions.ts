// ============================================================================
// Commissions API Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";
import { calculateFees, simulateFees } from "../commissions/calc";
import { applyFees, reverseFees } from "../commissions/apply";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const commissionsRouter = Router();

/**
 * POST /api/commissions/calc - Calculate fees for a transaction (simulation)
 */
commissionsRouter.post("/calc", async (req: any, res) => {
  try {
    const calc = await calculateFees(req.body);
    res.json(calc);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/commissions/apply - Apply fees to a transaction (idempotent)
 */
commissionsRouter.post("/apply", async (req: any, res) => {
  try {
    const result = await applyFees(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/commissions/reverse - Reverse fees (for chargebacks)
 */
commissionsRouter.post("/reverse", async (req: any, res) => {
  const { transaction_id, reason } = req.body;

  if (!transaction_id) {
    return res.status(400).json({ error: "transaction_id_required" });
  }

  try {
    const result = await reverseFees(transaction_id, reason || "chargeback");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/commissions/simulate - Bulk simulate fees (for pricing pages)
 */
commissionsRouter.post("/simulate", async (req: any, res) => {
  try {
    const result = await simulateFees(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/commissions/rules - List fee rules
 */
commissionsRouter.get("/rules", async (req: any, res) => {
  const { module, event_type, active, limit = 100 } = req.query;

  try {
    let query = `SELECT * FROM fee_rules WHERE 1=1`;
    const params: any[] = [];

    if (module) {
      params.push(module);
      query += ` AND module = $${params.length}`;
    }
    if (event_type) {
      params.push(event_type);
      query += ` AND event_type = $${params.length}`;
    }
    if (active !== undefined) {
      params.push(active === "true");
      query += ` AND active = $${params.length}`;
    }

    query += ` ORDER BY priority DESC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/commissions/rules/:id - Get rule details
 */
commissionsRouter.get("/rules/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM fee_rules WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "rule_not_found" });
    }

    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/commissions/rules - Create new fee rule
 */
commissionsRouter.post("/rules", async (req: any, res) => {
  const {
    name,
    module,
    event_type,
    country,
    currency,
    percent,
    fixed_amount,
    min_amount,
    max_amount,
    apply_to_sender,
    apply_to_receiver,
    agent_share_percent,
    active,
    priority,
    valid_from,
    valid_until,
    metadata,
  } = req.body;

  const userId = req.user?.id || "system";

  try {
    const { rows } = await pool.query(
      `INSERT INTO fee_rules(
        name, module, event_type, country, currency,
        percent, fixed_amount, min_amount, max_amount,
        apply_to_sender, apply_to_receiver, agent_share_percent,
        active, priority, valid_from, valid_until, metadata, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        name,
        module,
        event_type,
        country || null,
        currency || null,
        percent || 0,
        fixed_amount || 0,
        min_amount || null,
        max_amount || null,
        apply_to_sender ?? true,
        apply_to_receiver ?? false,
        agent_share_percent || 0,
        active ?? true,
        priority || 10,
        valid_from || null,
        valid_until || null,
        metadata ? JSON.stringify(metadata) : null,
        userId,
      ]
    );

    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/commissions/rules/:id - Update fee rule
 */
commissionsRouter.put("/rules/:id", async (req: any, res) => {
  const { id } = req.params;
  const {
    percent,
    fixed_amount,
    min_amount,
    max_amount,
    active,
    priority,
    valid_until,
  } = req.body;

  const userId = req.user?.id || "system";

  try {
    // Fetch current values for history
    const { rows: [current] } = await pool.query(
      `SELECT * FROM fee_rules WHERE id = $1`,
      [id]
    );

    if (!current) {
      return res.status(404).json({ error: "rule_not_found" });
    }

    // Record history if percent or fixed changed
    if (
      (percent !== undefined && percent !== current.percent) ||
      (fixed_amount !== undefined && fixed_amount !== current.fixed_amount)
    ) {
      await pool.query(
        `INSERT INTO fee_rates_history(
          rule_id, changed_by, old_percent, old_fixed, new_percent, new_fixed, reason
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          userId,
          current.percent,
          current.fixed_amount,
          percent ?? current.percent,
          fixed_amount ?? current.fixed_amount,
          req.body.reason || "ops_update",
        ]
      );
    }

    // Update rule
    const { rows } = await pool.query(
      `UPDATE fee_rules SET
        percent = COALESCE($2, percent),
        fixed_amount = COALESCE($3, fixed_amount),
        min_amount = COALESCE($4, min_amount),
        max_amount = COALESCE($5, max_amount),
        active = COALESCE($6, active),
        priority = COALESCE($7, priority),
        valid_until = COALESCE($8, valid_until),
        updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        percent,
        fixed_amount,
        min_amount,
        max_amount,
        active,
        priority,
        valid_until,
      ]
    );

    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/commissions/rules/:id - Deactivate rule
 */
commissionsRouter.delete("/rules/:id", async (req: any, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE fee_rules SET active = false, updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "rule_not_found" });
    }

    res.json({ deactivated: true, rule: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/commissions/overrides - List fee overrides
 */
commissionsRouter.get("/overrides", async (req: any, res) => {
  const { target_type, target_id, active, limit = 50 } = req.query;

  try {
    let query = `SELECT o.*, r.name as rule_name FROM fee_overrides o
                 LEFT JOIN fee_rules r ON r.id = o.rule_id
                 WHERE 1=1`;
    const params: any[] = [];

    if (target_type) {
      params.push(target_type);
      query += ` AND o.target_type = $${params.length}`;
    }
    if (target_id) {
      params.push(target_id);
      query += ` AND o.target_id = $${params.length}`;
    }
    if (active !== undefined) {
      params.push(active === "true");
      query += ` AND o.active = $${params.length}`;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/commissions/overrides - Create fee override
 */
commissionsRouter.post("/overrides", async (req: any, res) => {
  const {
    target_type,
    target_id,
    rule_id,
    override_percent,
    override_fixed,
    valid_from,
    valid_until,
  } = req.body;

  const userId = req.user?.id || "system";

  try {
    const { rows } = await pool.query(
      `INSERT INTO fee_overrides(
        target_type, target_id, rule_id, override_percent, override_fixed,
        valid_from, valid_until, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        target_type,
        target_id,
        rule_id,
        override_percent || null,
        override_fixed || null,
        valid_from || null,
        valid_until || null,
        userId,
      ]
    );

    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/commissions/lines - List fee lines (audit)
 */
commissionsRouter.get("/lines", async (req: any, res) => {
  const { transaction_id, event_type, agent_id, limit = 100 } = req.query;

  try {
    let query = `SELECT fl.*, fr.name as rule_name FROM fee_lines fl
                 LEFT JOIN fee_rules fr ON fr.id = fl.rule_id
                 WHERE 1=1`;
    const params: any[] = [];

    if (transaction_id) {
      params.push(transaction_id);
      query += ` AND fl.transaction_id = $${params.length}`;
    }
    if (event_type) {
      params.push(event_type);
      query += ` AND fl.event_type = $${params.length}`;
    }
    if (agent_id) {
      params.push(agent_id);
      query += ` AND fl.agent_id = $${params.length}`;
    }

    query += ` ORDER BY fl.created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/commissions/stats - Get fee revenue statistics
 */
commissionsRouter.get("/stats", async (req: any, res) => {
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
        COUNT(*) as total_transactions,
        SUM(amount::numeric) as total_revenue,
        SUM(split_molam_amount::numeric) as molam_revenue,
        SUM(split_agent_amount::numeric) as agent_revenue,
        AVG(amount::numeric) as avg_fee,
        currency
       FROM fee_lines
       WHERE created_at > now() - interval '${interval}'
       GROUP BY currency`,
    );

    res.json(stats || {});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
