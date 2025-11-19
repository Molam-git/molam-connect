// ============================================================================
// Bank Profiles Health Monitor
// ============================================================================

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const fetchFn = (globalThis as any).fetch as typeof globalThis.fetch;

const REQUEST_TIMEOUT_MS = 5000;
const DEGRADED_THRESHOLD = 0.5;
const FAILOVER_THRESHOLD = 0.8;
const SUCCESS_RATE_THRESHOLD = 0.95;
const FAILOVER_SUCCESS_THRESHOLD = 0.75;

async function fetchWithTimeout(url: string) {
  if (!fetchFn) {
    throw new Error("Global fetch is not available. Use Node 18+ or polyfill it.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, { method: "GET", signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function recordAlert(type: string, entity: string, severity: "info" | "warning" | "critical", message: string, metadata: Record<string, unknown> = {}) {
  try {
    await pool.query(
      `INSERT INTO alerts (type, entity, severity, message, metadata, status)
       VALUES ($1,$2,$3,$4,$5,'open')`,
      [type, entity, severity, message, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.warn("[BankHealthMonitor] Unable to record alert:", (error as Error).message);
  }
}

async function computeRollingStats(bankId: string) {
  const { rows: [stats] } = await pool.query(
    `SELECT AVG(success_rate)::float AS avg_success,
            AVG(latency_ms)::float AS avg_latency
     FROM bank_health_logs
     WHERE bank_profile_id = $1
       AND checked_at >= now() - interval '15 minutes'`,
    [bankId]
  );

  return {
    avgSuccess: stats?.avg_success ?? null,
    avgLatency: stats?.avg_latency ?? null
  };
}

async function upsertHealthMetrics(bankId: string, status: "healthy" | "degraded" | "down", successRate: number, latencyMs: number | null, errorMessage?: string) {
  await pool.query(
    `INSERT INTO bank_health_metrics (
        bank_profile_id, last_checked, status, success_rate, avg_latency_ms, recent_failures, last_error, updated_at
     ) VALUES ($1, now(), $2, $3, $4, CASE WHEN $2='down' THEN 1 ELSE 0 END, $5, now())
     ON CONFLICT (bank_profile_id) DO UPDATE SET
        last_checked = now(),
        status = $2,
        success_rate = $3,
        avg_latency_ms = $4,
        recent_failures = CASE WHEN $2='down' THEN bank_health_metrics.recent_failures + 1 ELSE 0 END,
        last_error = $5,
        updated_at = now()`,
    [bankId, status, successRate, latencyMs, errorMessage || null]
  );
}

async function openCircuitBreaker(bankId: string) {
  await pool.query(
    `INSERT INTO bank_circuit_breakers (bank_profile_id, state, opened_at, failure_count, updated_at)
     VALUES ($1, 'open', now(), 1, now())
     ON CONFLICT (bank_profile_id) DO UPDATE SET
       state='open',
       opened_at=COALESCE(bank_circuit_breakers.opened_at, now()),
       failure_count=bank_circuit_breakers.failure_count+1,
       updated_at=now()`,
    [bankId]
  );
}

async function adjustRiskScore(bankId: string, direction: "up" | "down", amount: number) {
  const columnExpression = direction === "up"
    ? `LEAST(1, risk_score + ${amount})`
    : `GREATEST(0, risk_score - ${amount})`;

  const { rows: [profile] } = await pool.query(
    `UPDATE bank_profiles
        SET risk_score = ${columnExpression},
            updated_at = now()
      WHERE id = $1
      RETURNING risk_score`,
    [bankId]
  );

  return Number(profile?.risk_score ?? 0);
}

async function insertHealthLog(bankId: string, latency: number | null, successRate: number, anomalies: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO bank_health_logs (bank_profile_id, latency_ms, success_rate, anomalies)
     VALUES ($1,$2,$3,$4)`,
    [bankId, latency, successRate, JSON.stringify(anomalies || {})]
  );
}

async function evaluateThresholds(bankId: string, riskScore: number, avgSuccess: number | null) {
  const successValue = avgSuccess ?? 1;
  const degraded = riskScore > DEGRADED_THRESHOLD || successValue < SUCCESS_RATE_THRESHOLD;
  const failover = riskScore > FAILOVER_THRESHOLD || successValue < FAILOVER_SUCCESS_THRESHOLD;

  if (failover) {
    await openCircuitBreaker(bankId);
    await recordAlert(
      "bank_failover",
      bankId,
      "critical",
      `Failover activated: risk_score=${riskScore.toFixed(2)}, success=${(successValue * 100).toFixed(1)}%`,
      { risk_score: riskScore, success_rate: successValue }
    );
    return "down";
  }

  if (degraded) {
    await recordAlert(
      "bank_health",
      bankId,
      "warning",
      `Risk score elevated (${riskScore.toFixed(2)}) or success degraded (${(successValue * 100).toFixed(1)}%)`,
      { risk_score: riskScore, success_rate: successValue }
    );
    return "degraded";
  }

  return "healthy";
}

async function checkBankHealth(bankId: string, testUrl: string) {
  const start = Date.now();
  let status: "healthy" | "degraded" | "down" = "healthy";
  let latency = 0;
  let anomalies: Record<string, unknown> = {};
  let success = 1;

  try {
    const response = await fetchWithTimeout(testUrl);
    latency = Date.now() - start;

    if (!response.ok) {
      success = 0;
      anomalies = {
        code: response.status,
        message: (await response.text()).slice(0, 200)
      };
      await adjustRiskScore(bankId, "up", 0.05);
    } else if (latency > REQUEST_TIMEOUT_MS) {
      await adjustRiskScore(bankId, "up", 0.05);
    } else {
      await adjustRiskScore(bankId, "down", 0.01);
    }
  } catch (error: any) {
    latency = Date.now() - start;
    success = 0;
    anomalies = { error: error.message };
    await adjustRiskScore(bankId, "up", 0.1);
  }

  await insertHealthLog(bankId, latency || null, success, anomalies);

  const { avgSuccess, avgLatency } = await computeRollingStats(bankId);
  const { rows: [profile] } = await pool.query(
    `SELECT risk_score FROM bank_profiles WHERE id=$1`,
    [bankId]
  );
  const riskScore = Number(profile?.risk_score ?? 0);

  status = await evaluateThresholds(bankId, riskScore, avgSuccess ?? success);

  await upsertHealthMetrics(bankId, status, avgSuccess ?? success, avgLatency ?? latency, anomalies.error ? String(anomalies.error) : undefined);

  if (riskScore > 0.5) {
    console.warn(`[BankHealthMonitor] Bank ${bankId} risk_score=${riskScore.toFixed(2)} status=${status}`);
  }
}

export async function runBankHealthMonitor() {
  const { rows: banks } = await pool.query(
    `SELECT id, metadata
     FROM bank_profiles
     WHERE status='active'`
  );

  console.log(`[BankHealthMonitor] Checking ${banks.length} banks...`);

  for (const bank of banks) {
    const testUrl = bank.metadata?.healthcheck_url || `https://api.molam-banks.com/${bank.id}/heartbeat`;
    await checkBankHealth(bank.id, testUrl);
  }

  console.log("[BankHealthMonitor] Cycle complete");
}

if (require.main === module) {
  runBankHealthMonitor()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[BankHealthMonitor] Fatal error:", error);
      process.exit(1);
    });
}

