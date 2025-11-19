// ============================================================================
// Brique 123 — Float Manager Worker
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1. Snapshot collector
export async function collectSnapshots() {
  const { rows: accounts } = await pool.query(`SELECT id, currency FROM treasury_accounts WHERE status='active'`);
  for (const acc of accounts) {
    const bal = await getBalanceFromConnector(acc.id);
    await pool.query(
      `INSERT INTO treasury_float_snapshots(treasury_account_id, balance, reserved, available, currency, created_by) VALUES($1,$2,$3,$4,$5,$6)`,
      [acc.id, bal.balance, bal.reserved, bal.available, acc.currency, 'system']
    );
  }
}

async function getBalanceFromConnector(treasuryAccountId: string) {
  // Implementation: call B121 connector or cache
  return { balance: 100000.00, reserved: 1000.00, available: 99000.00 };
}

// 2. Rule evaluator
export async function evaluateRules() {
  const { rows: rules } = await pool.query(`SELECT * FROM sweep_rules WHERE enabled=true`);
  for (const r of rules) {
    const { rows: snaps } = await pool.query(
      `SELECT * FROM treasury_float_snapshots WHERE treasury_account_id=$1 ORDER BY snapshot_ts DESC LIMIT 1`,
      [r.treasury_account_id]
    );
    if (!snaps.length) continue;
    const snap = snaps[0];

    // Top-up condition
    if (Number(snap.available) < Number(r.min_balance)) {
      const need = Number(r.target_balance) - Number(snap.available);
      if (need <= 0) continue;
      await createOrMergePlan({
        rule_id: r.id,
        treasury_account_id: r.treasury_account_id,
        action: 'topup',
        amount: need,
        currency: r.currency,
        suggested_by: 'system'
      }, r);
    }
    // Sweep condition
    else if (r.max_balance && Number(snap.available) > Number(r.max_balance)) {
      const excess = Number(snap.available) - Number(r.target_balance);
      if (excess <= 0) continue;
      await createOrMergePlan({
        rule_id: r.id,
        treasury_account_id: r.treasury_account_id,
        action: 'sweep_to_reserve',
        amount: excess,
        currency: r.currency,
        suggested_by: 'system'
      }, r);
    }
  }
}

// Idempotent plan creation
async function createOrMergePlan(plan: any, rule: any) {
  const { rows } = await pool.query(
    `SELECT * FROM sweep_plans WHERE rule_id=$1 AND action=$2 AND status='proposed' LIMIT 1`,
    [plan.rule_id, plan.action]
  );
  if (rows.length) {
    const existing = rows[0];
    const newAmount = Math.max(Number(existing.amount), Number(plan.amount));
    await pool.query(`UPDATE sweep_plans SET amount=$2, created_at=now() WHERE id=$1`, [existing.id, newAmount]);
    return existing;
  } else {
    const { rows: ins } = await pool.query(
      `INSERT INTO sweep_plans(rule_id, treasury_account_id, action, amount, currency, suggested_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [plan.rule_id, plan.treasury_account_id, plan.action, plan.amount, plan.currency, plan.suggested_by]
    );
    return ins[0];
  }
}

// 3. Plan executor (idempotent)
export async function executePlan(planId: string, executedBy: string) {
  const { rows: [plan] } = await pool.query(`SELECT * FROM sweep_plans WHERE id=$1`, [planId]);
  if (!plan) throw new Error("plan_not_found");
  if (plan.status === 'executed') return plan;

  if (!await canAutoExecute(plan, executedBy)) {
    throw new Error("approval_required");
  }

  await pool.query(`UPDATE sweep_plans SET status='executing' WHERE id=$1`, [planId]);

  try {
    // Call bank connector (omitted)
    const providerRef = `EXEC-${Date.now()}`;

    await pool.query(`UPDATE sweep_plans SET status='executed', executed_at=now() WHERE id=$1`, [plan.id]);
    await pool.query(
      `INSERT INTO sweep_executions(plan_id, execution_ref, status, details) VALUES($1,$2,'success',$3)`,
      [plan.id, providerRef, JSON.stringify({ success: true })]
    );
    return { ok: true, provider_ref: providerRef };
  } catch (e: any) {
    await pool.query(`UPDATE sweep_plans SET status='failed' WHERE id=$1`, [plan.id]);
    await pool.query(
      `INSERT INTO sweep_executions(plan_id, execution_ref, status, details) VALUES($1,NULL,'failed',$2)`,
      [plan.id, JSON.stringify({ error: e.message })]
    );
    throw e;
  }
}

async function canAutoExecute(plan: any, userId: string) {
  const { rows: [rule] } = await pool.query(`SELECT * FROM sweep_rules WHERE id=$1`, [plan.rule_id]);
  if (!rule) return false;
  if (rule.auto_execute && (rule.approval_threshold === null || Number(plan.amount) <= Number(rule.approval_threshold))) return true;
  return false;
}
