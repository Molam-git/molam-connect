import { pool } from "../db";
import { publishEvent } from "../events/publisher";
import { computeSiraScore } from "./score";
import { backtestRecommendation, attachBacktestToRecommendation } from "./backtest";
import { pickRouting } from "../treasury/routing";
import { createLedgerHold } from "../ledger";

type RunOptions = {
  runDate?: Date;
  simulate?: boolean;
};

async function fetchVolumeMetricsForAccount(_treasury_account_id: string, _currency: string) {
  return {
    volume_30d: 10000,
    volume_7d: 2500,
    volume_1d: 300,
    volatility: 1.2,
    match_rate: 0.995,
    avg_fee: 0.0025
  };
}

function computeSafetyBuffer(metrics: any) {
  const avgDaily = (metrics.volume_7d || 0) / 7;
  return Math.max(avgDaily * 2, (metrics.volume_30d || 0) * 0.05, 50);
}

function computeUpperBuffer(metrics: any) {
  const avgDaily = (metrics.volume_7d || 0) / 7;
  return Math.min(Math.max(avgDaily * 3, (metrics.volume_30d || 0) * 0.15), metrics.volume_30d || 0);
}

async function getAutoModeForAccount(_treasury_account_id: string) {
  return "auto";
}

async function getOpsThreshold() {
  return 5000;
}

async function initiateTransfer(params: { from: string; to: string; amount: number; currency: string; metadata: any }) {
  return {
    status: "sent",
    provider_ref: `SIM-${Date.now()}`,
    details: params
  };
}

export async function runFloatOptimizer(opts: RunOptions = {}) {
  const now = opts.runDate || new Date();

  const { rows: targets } = await pool.query(
    `SELECT id as treasury_account_id, currency, ledger_account_code
     FROM treasury_accounts
     WHERE status = 'active'`
  );

  for (const target of targets) {
    const metrics = await fetchVolumeMetricsForAccount(target.treasury_account_id, target.currency);
    const safetyBuffer = computeSafetyBuffer(metrics);
    const upperBuffer = computeUpperBuffer(metrics);

    const { rows: [snapshot] } = await pool.query(
      `SELECT balance FROM treasury_float_snapshots
         WHERE treasury_account_id = $1
         ORDER BY snapshot_ts DESC LIMIT 1`,
      [target.treasury_account_id]
    );
    const current = snapshot ? Number(snapshot.balance) : 0;

    let recommended_action: "topup" | "sweep" | "none" = "none";
    let amount = 0;

    if (current < safetyBuffer) {
      recommended_action = "topup";
      amount = Math.max(safetyBuffer - current, Math.ceil(safetyBuffer * 0.05));
    } else if (current > upperBuffer) {
      recommended_action = "sweep";
      amount = Math.max(current - upperBuffer, Math.ceil(upperBuffer * 0.05));
    }

    const reason = {
      metrics,
      safetyBuffer,
      upperBuffer,
      current,
      generated_at: now.toISOString()
    };

    const sira_score = await computeSiraScore({ metrics, current, t: target });

    if (recommended_action !== "none") {
      const { rows: [recommendation] } = await pool.query(
        `INSERT INTO float_recommendations
           (target_account_id, currency, recommended_action, amount, reason, sira_score, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [target.treasury_account_id, target.currency, recommended_action, amount, reason, sira_score, "sira"]
      );

      await publishEvent("treasury", target.treasury_account_id, "float.recommendation.created", {
        recommendation_id: recommendation.id,
        amount: recommendation.amount,
        currency: recommendation.currency
      });

      const backtest = await backtestRecommendation(target.treasury_account_id, target.currency, amount);
      await attachBacktestToRecommendation(recommendation.id, backtest);

      const autoMode = await getAutoModeForAccount(target.treasury_account_id);
      const opsThreshold = await getOpsThreshold();

      if (!opts.simulate && autoMode === "auto" && Number(amount) <= opsThreshold) {
        await executeRecommendation(recommendation.id, recommendation.recommended_action as "topup" | "sweep", Number(recommendation.amount));
      }
    }
  }
}

export async function executeRecommendation(recoId: string, action: "topup" | "sweep", amount: number) {
  const { rows: [recommendation] } = await pool.query(
    `SELECT * FROM float_recommendations WHERE id = $1`,
    [recoId]
  );

  if (!recommendation) {
    throw new Error("not_found");
  }

  if (!["suggested", "approved"].includes(recommendation.status)) {
    return;
  }

  const { routing } = await pickRouting(recommendation.currency, amount);

  await createLedgerHold({
    origin: `SIRA-${recommendation.id}`,
    account: routing.treasury_account_id || "unknown",
    amount,
    currency: recommendation.currency,
    ref: `SIRA-HOLD-${recommendation.id}`
  });

  const result = await initiateTransfer({
    from: routing.from,
    to: routing.to,
    amount,
    currency: recommendation.currency,
    metadata: { recoId }
  });

  await pool.query(
    `INSERT INTO float_actions_log(recommendation_id, action_type, payload, result, executed_by)
     VALUES($1,$2,$3,$4,$5)`,
    [recoId, action, JSON.stringify({ routing }), JSON.stringify(result), "sira-worker"]
  );

  await pool.query(
    `UPDATE float_recommendations
        SET status = 'done', updated_at = now()
      WHERE id = $1`,
    [recoId]
  );

  await publishEvent("treasury", recommendation.target_account_id, "float.recommendation.executed", {
    recoId,
    result
  });
}

