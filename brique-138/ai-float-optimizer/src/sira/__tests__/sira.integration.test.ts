import { pool } from "../../../db";
import { runFloatOptimizer } from "../../float_optimizer";

beforeAll(async () => {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS treasury_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      currency TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS treasury_float_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      treasury_account_id UUID NOT NULL,
      snapshot_ts TIMESTAMPTZ DEFAULT now(),
      balance NUMERIC(18,2) NOT NULL,
      available NUMERIC(18,2) NOT NULL,
      currency TEXT
    );

    CREATE TABLE IF NOT EXISTS float_recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_account_id UUID NOT NULL,
      currency TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      reason JSONB NOT NULL,
      sira_score NUMERIC(6,4),
      status TEXT NOT NULL DEFAULT 'suggested',
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS float_actions_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recommendation_id UUID REFERENCES float_recommendations(id),
      action_type TEXT NOT NULL,
      payload JSONB,
      result JSONB,
      executed_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await pool.end();
});

test("runFloatOptimizer creates recommendation and backtest", async () => {
  const { rows: [account] } = await pool.query(
    `INSERT INTO treasury_accounts(currency, status)
       VALUES ($1, 'active')
       RETURNING *`,
    ["USD"]
  );

  await pool.query(
    `INSERT INTO treasury_float_snapshots(treasury_account_id, balance, available, currency)
       VALUES($1,$2,$3,$4)`,
    [account.id, 10, 10, "USD"]
  );

  await runFloatOptimizer({ simulate: true });

  const { rows: recommendations } = await pool.query(
    `SELECT * FROM float_recommendations WHERE target_account_id = $1`,
    [account.id]
  );

  expect(recommendations.length).toBeGreaterThan(0);

  const recommendation = recommendations[0];
  expect(recommendation.recommended_action).toBeDefined();
  expect(Number(recommendation.amount)).toBeGreaterThan(0);
  expect(recommendation.reason?.backtest).toBeDefined();

  const { rows: logs } = await pool.query(
    `SELECT * FROM float_actions_log WHERE recommendation_id = $1`,
    [recommendation.id]
  );

  expect(logs.length).toBe(0);
});

