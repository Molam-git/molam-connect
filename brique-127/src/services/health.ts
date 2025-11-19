// ============================================================================
// Bank Health Monitoring & Circuit Breaker
// ============================================================================

import { Pool } from "pg";
import fetch from "node-fetch";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DEGRADED_THRESHOLD = 0.5;
const SUCCESS_RATE_THRESHOLD = 0.95;

/**
 * Probe bank connector health endpoint
 */
export async function probeBankConnector(bankProfile: any) {
  const url = bankProfile.metadata?.healthcheck_url;
  if (!url) {
    console.warn(`[Health] No healthcheck URL for bank ${bankProfile.id}`);
    return { status: "unknown" };
  }

  const start = Date.now();
  try {
    const res = await fetch(url, { timeout: 5000 });
    const latency = Date.now() - start;

    if (res.status >= 200 && res.status < 300) {
      // Update health metrics
      await pool.query(
        `INSERT INTO bank_health_metrics(
          bank_profile_id, last_checked, status, success_rate, avg_latency_ms, recent_failures, updated_at
        ) VALUES ($1, now(), 'healthy', 0.99, $2, 0, now())
        ON CONFLICT (bank_profile_id) DO UPDATE SET
          last_checked=now(), status='healthy', avg_latency_ms=$2, recent_failures=0, updated_at=now()`,
        [bankProfile.id, latency]
      );

      // Reset circuit breaker
      await pool.query(
        `INSERT INTO bank_circuit_breakers(bank_profile_id, state, failure_count, success_count, updated_at)
         VALUES ($1, 'closed', 0, 1, now())
         ON CONFLICT (bank_profile_id) DO UPDATE SET
           state='closed', failure_count=0, success_count=bank_circuit_breakers.success_count+1, updated_at=now()`,
        [bankProfile.id]
      );

      return { status: "healthy", latency };
    } else {
      throw new Error(`http_${res.status}`);
    }
  } catch (e: any) {
    // Record failure
    await pool.query(
      `INSERT INTO bank_health_metrics(
        bank_profile_id, last_checked, status, success_rate, avg_latency_ms, recent_failures, last_error, updated_at
      ) VALUES ($1, now(), 'down', 0.0, null, 1, $2, now())
      ON CONFLICT (bank_profile_id) DO UPDATE SET
        last_checked=now(), status='down', recent_failures=bank_health_metrics.recent_failures+1,
        last_error=$2, updated_at=now()`,
      [bankProfile.id, e.message]
    );

    // Update circuit breaker
    const { rows: [cb] } = await pool.query(
      `SELECT * FROM bank_circuit_breakers WHERE bank_profile_id=$1`,
      [bankProfile.id]
    );

    if (!cb) {
      await pool.query(
        `INSERT INTO bank_circuit_breakers(bank_profile_id, state, failure_count, opened_at, updated_at)
         VALUES ($1, 'open', 1, now(), now())`,
        [bankProfile.id]
      );
    } else {
      const newFailCount = (cb.failure_count || 0) + 1;
      const newState = newFailCount >= 5 ? 'open' : cb.state;

      await pool.query(
        `UPDATE bank_circuit_breakers SET
          failure_count=$2, state=$3,
          opened_at=CASE WHEN $3='open' THEN now() ELSE opened_at END,
          next_probe_at=now() + interval '5 minutes',
          updated_at=now()
         WHERE bank_profile_id=$1`,
        [bankProfile.id, newFailCount, newState]
      );
    }

    return { status: "down", error: e.message };
  }
}

/**
 * Get bank health metrics from DB
 */
export async function getBankHealth(bankProfileId: string) {
  const { rows } = await pool.query(
    `SELECT bhm.*, bp.risk_score
       FROM bank_health_metrics bhm
       LEFT JOIN bank_profiles bp ON bp.id = bhm.bank_profile_id
      WHERE bhm.bank_profile_id=$1`,
    [bankProfileId]
  );

  if (!rows.length) {
    return {
      success_rate: 1.0,
      avg_latency_ms: 50,
      recent_failures: 0,
      status: "unknown",
      risk_score: 0,
      degraded: false
    };
  }

  const record = rows[0];

  const { rows: [agg] } = await pool.query(
    `SELECT AVG(success_rate)::float AS avg_success,
            AVG(latency_ms)::float AS avg_latency
       FROM bank_health_logs
      WHERE bank_profile_id=$1
        AND checked_at >= now() - interval '15 minutes'`,
    [bankProfileId]
  );

  const successRate = Number(record.success_rate ?? agg?.avg_success ?? 1);
  const avgLatency = Number(record.avg_latency_ms ?? agg?.avg_latency ?? 50);
  const riskScore = Number(record.risk_score ?? 0);
  const degraded = riskScore > DEGRADED_THRESHOLD || successRate < SUCCESS_RATE_THRESHOLD;

  return {
    success_rate: successRate,
    avg_latency_ms: avgLatency,
    recent_failures: record.recent_failures || 0,
    status: degraded ? "degraded" : record.status,
    risk_score: riskScore,
    degraded
  };
}

/**
 * Run health probes for all active banks
 */
export async function runHealthCheckSweep() {
  const { rows: banks } = await pool.query(
    `SELECT * FROM bank_profiles WHERE enabled=true`
  );

  console.log(`[Health] Probing ${banks.length} banks...`);

  for (const bank of banks) {
    const result = await probeBankConnector(bank);
    console.log(`[Health] ${bank.name} - ${result.status}`);
  }
}

/**
 * Start periodic health check worker
 */
export async function startHealthCheckWorker() {
  console.log("[Health Worker] Starting...");

  // Run immediately
  await runHealthCheckSweep();

  // Run every 60 seconds
  setInterval(async () => {
    try {
      await runHealthCheckSweep();
    } catch (e: any) {
      console.error("[Health Worker] Error:", e.message);
    }
  }, 60000);
}

// Start if run directly
if (require.main === module) {
  startHealthCheckWorker().catch(console.error);
}
