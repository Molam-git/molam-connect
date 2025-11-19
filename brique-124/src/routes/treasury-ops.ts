// ============================================================================
// Brique 124 — Treasury Ops Routes
// ============================================================================

import { Router } from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const treasuryOpsRouter = Router();

// Generate plan
treasuryOpsRouter.post("/plans/generate", async (req: any, res) => {
  const { plan_type, items, origin = 'ops', priority = 100, required_approvals } = req.body;
  const { rows: [plan] } = await pool.query(
    `INSERT INTO treasury_plans(plan_type, origin, priority, metadata, required_approvals, created_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [plan_type, origin, priority, JSON.stringify(req.body.metadata || {}), JSON.stringify(required_approvals || []), req.user?.id || 'system']
  );
  for (const it of items) {
    await pool.query(
      `INSERT INTO treasury_plan_items(plan_id, action, treasury_account_id, amount, currency, target)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [plan.id, it.action, it.treasury_account_id, it.amount, it.currency, JSON.stringify(it.target || {})]
    );
  }
  res.status(201).json({ plan_id: plan.id });
});

// Approve plan
treasuryOpsRouter.post("/plans/:id/approve", async (req: any, res) => {
  const planId = req.params.id;
  await pool.query(
    `INSERT INTO treasury_plan_approvals(plan_id,user_id,role,decision,note)
     VALUES($1,$2,$3,'approved',$4)`,
    [planId, req.user?.id || 'system', req.user?.role || 'admin', req.body.note || null]
  );
  const { rows: [plan] } = await pool.query(`SELECT * FROM treasury_plans WHERE id=$1`, [planId]);
  const approvers = plan.approvers || [];
  approvers.push({ user_id: req.user?.id, role: req.user?.role, ts: new Date().toISOString() });
  await pool.query(`UPDATE treasury_plans SET approvers=$2 WHERE id=$1`, [planId, JSON.stringify(approvers)]);
  res.json({ ok: true });
});

// Execute plan (idempotent)
treasuryOpsRouter.post("/plans/:id/execute", async (req: any, res) => {
  const planId = req.params.id;
  const idempotency = req.headers['idempotency-key'];
  if (!idempotency || idempotency !== planId) return res.status(400).json({ error: "idempotency required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [plan] } = await client.query(`SELECT * FROM treasury_plans WHERE id=$1 FOR UPDATE`, [planId]);
    if (plan.status === 'executed') {
      await client.query("COMMIT");
      return res.json({ status: 'already_executed' });
    }
    await client.query(`UPDATE treasury_plans SET status='executing' WHERE id=$1`, [planId]);

    const { rows: items } = await client.query(`SELECT * FROM treasury_plan_items WHERE plan_id=$1`, [planId]);
    for (const it of items) {
      await client.query(`UPDATE treasury_plan_items SET status='executing' WHERE id=$1`, [it.id]);
      // Execute item (connector call omitted)
      await client.query(`UPDATE treasury_plan_items SET status='done', result=$2 WHERE id=$1`, [it.id, JSON.stringify({ success: true })]);
    }

    await client.query(`UPDATE treasury_plans SET status='executed' WHERE id=$1`, [planId]);
    await client.query(`INSERT INTO treasury_plan_executions(plan_id, actor, action, details) VALUES($1,$2,'execute',$3)`, [planId, req.user?.id, JSON.stringify({ idempotency })]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Rollback plan
treasuryOpsRouter.post("/plans/:id/rollback", async (req: any, res) => {
  const planId = req.params.id;
  await pool.query(`UPDATE treasury_plans SET status='rolled_back' WHERE id=$1`, [planId]);
  res.json({ ok: true });
});

// Get plans
treasuryOpsRouter.get("/plans", async (req, res) => {
  const status = req.query.status as string;
  const { rows } = await pool.query(
    `SELECT * FROM treasury_plans ${status ? 'WHERE status = ANY($1::text[])' : ''} ORDER BY created_at DESC LIMIT 100`,
    status ? [status.split(',')] : []
  );
  res.json(rows);
});
