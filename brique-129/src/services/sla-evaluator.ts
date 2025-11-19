// ============================================================================
// SLA Evaluator - Prometheus Metrics Analysis
// ============================================================================

import { Pool } from "pg";
import fetch from "node-fetch";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

/**
 * Evaluate all active SLA policies against Prometheus metrics
 */
export async function evaluateSLAs() {
  const { rows: policies } = await pool.query(
    `SELECT * FROM settlement_sla_policies WHERE enabled=true`
  );

  console.log(`[SLA Evaluator] Evaluating ${policies.length} policies...`);

  let alertsCreated = 0;

  for (const policy of policies) {
    try {
      const observed = await queryMetric(policy);

      if (observed === null) {
        console.warn(`[SLA Evaluator] No data for policy ${policy.id}`);
        continue;
      }

      const breached = checkBreach(observed, policy.threshold, policy.operator);

      if (breached) {
        await createAlert(policy, observed);
        alertsCreated++;
      }
    } catch (e: any) {
      console.error(`[SLA Evaluator] Error evaluating policy ${policy.id}:`, e.message);
    }
  }

  console.log(`[SLA Evaluator] Created ${alertsCreated} new alerts`);
  return alertsCreated;
}

/**
 * Query Prometheus for metric value
 */
async function queryMetric(policy: any): Promise<number | null> {
  const promql = buildPromQL(policy);

  try {
    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const res = await fetch(url, { timeout: 5000 });
    const json = await res.json();

    if (json.status !== 'success' || !json.data?.result?.length) {
      return null;
    }

    return Number(json.data.result[0].value[1]);
  } catch (e: any) {
    console.error(`[SLA Evaluator] Prometheus query failed:`, e.message);
    return null;
  }
}

/**
 * Build PromQL query based on metric type
 */
function buildPromQL(policy: any): string {
  const labels = buildLabels(policy);

  switch (policy.metric) {
    case 'match_rate':
      return `avg_over_time(molam_settlement_match_rate{${labels}}[1h])`;

    case 'success_rate':
      return `avg_over_time(molam_settlement_success_rate{${labels}}[30m])`;

    case 'max_lag_hours':
      return `histogram_quantile(0.95, sum(rate(molam_settlement_latency_seconds_bucket{${labels}}[15m])) by (le)) / 3600`;

    case 'pending_count':
      return `molam_settlement_pending_count{${labels}}`;

    default:
      return '0';
  }
}

/**
 * Build Prometheus label selector
 */
function buildLabels(policy: any): string {
  const labels: string[] = [];

  if (policy.bank_profile_id) {
    labels.push(`bank_profile="${policy.bank_profile_id}"`);
  }
  if (policy.rail) {
    labels.push(`rail="${policy.rail}"`);
  }
  if (policy.country) {
    labels.push(`country="${policy.country}"`);
  }
  if (policy.currency) {
    labels.push(`currency="${policy.currency}"`);
  }

  return labels.join(',');
}

/**
 * Check if threshold is breached
 */
function checkBreach(value: number, threshold: number, operator: string): boolean {
  if (isNaN(value)) return false;

  switch (operator) {
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '>': return value > threshold;
    case '<': return value < threshold;
    default: return false;
  }
}

/**
 * Create alert and trigger auto-actions
 */
async function createAlert(policy: any, observed: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check for existing open alert (dedupe)
    const { rows: [existing] } = await client.query(
      `SELECT * FROM settlement_sla_alerts
       WHERE sla_policy_id=$1 AND status='open'
       LIMIT 1`,
      [policy.id]
    );

    if (existing) {
      await client.query("ROLLBACK");
      return existing;
    }

    // Create new alert
    const { rows: [alert] } = await client.query(
      `INSERT INTO settlement_sla_alerts(
        sla_policy_id, bank_profile_id, rail, country, metric,
        observed_value, threshold, severity, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open') RETURNING *`,
      [
        policy.id,
        policy.bank_profile_id,
        policy.rail,
        policy.country,
        policy.metric,
        observed,
        policy.threshold,
        policy.severity
      ]
    );

    await client.query("COMMIT");

    console.log(`[SLA Evaluator] Alert created: ${alert.id} - ${policy.metric} = ${observed} (threshold: ${policy.threshold})`);

    // Publish event
    publishEvent("treasury", policy.bank_profile_id || "global", "sla.alert.created", {
      alert_id: alert.id,
      metric: policy.metric,
      observed,
      threshold: policy.threshold,
      severity: policy.severity
    });

    // Execute auto-actions (async)
    runAutoActions(policy.id, alert.id).catch(console.error);

    return alert;
  } catch (e: any) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Execute automatic remediation actions
 */
async function runAutoActions(policyId: string, alertId: string) {
  const { rows: actions } = await pool.query(
    `SELECT * FROM sla_auto_actions WHERE sla_policy_id=$1 AND enabled=true`,
    [policyId]
  );

  for (const action of actions) {
    try {
      // Check cooldown
      if (action.last_executed_at) {
        const elapsed = Date.now() - new Date(action.last_executed_at).getTime();
        if (elapsed < action.cooldown_seconds * 1000) {
          console.log(`[Auto Action] Skipping ${action.action_type} - cooldown active`);
          continue;
        }
      }

      await executeAction(action, alertId);

      // Update last executed
      await pool.query(
        `UPDATE sla_auto_actions SET last_executed_at=now() WHERE id=$1`,
        [action.id]
      );
    } catch (e: any) {
      console.error(`[Auto Action] Failed to execute ${action.action_type}:`, e.message);
    }
  }
}

/**
 * Execute specific action type
 */
async function executeAction(action: any, alertId: string) {
  console.log(`[Auto Action] Executing ${action.action_type} for alert ${alertId}`);

  switch (action.action_type) {
    case 'auto_pause_bank':
      await pauseBank(action.params.bank_profile_id);
      break;

    case 'auto_reroute':
      await requestReroute(action.params, alertId);
      break;

    case 'create_ticket':
      await createIncidentTicket(alertId);
      break;

    case 'notify':
    case 'email':
    case 'sms':
    case 'slack':
      await sendNotification(alertId, action.action_type, action.params);
      break;
  }

  // Log action execution
  await pool.query(
    `UPDATE settlement_sla_alerts
     SET metadata = jsonb_set(coalesce(metadata,'{}'), '{auto_actions}',
       coalesce(metadata->'auto_actions', '[]'::jsonb) || $2::jsonb)
     WHERE id=$1`,
    [alertId, JSON.stringify([{ type: action.action_type, executed_at: new Date() }])]
  );
}

/**
 * Pause bank profile
 */
async function pauseBank(bankProfileId: string) {
  // TODO: Integrate with bank_profiles table
  await pool.query(
    `UPDATE bank_profiles SET enabled=false, updated_at=now() WHERE id=$1`,
    [bankProfileId]
  );
  console.log(`[Auto Action] Bank ${bankProfileId} paused`);
}

/**
 * Request SIRA rerouting suggestion
 */
async function requestReroute(params: any, alertId: string) {
  publishEvent("sira", "", "routing.suggestion.request", {
    alert_id: alertId,
    params
  });
  console.log(`[Auto Action] Reroute request sent to SIRA`);
}

/**
 * Create incident ticket
 */
async function createIncidentTicket(alertId: string) {
  const ticketRef = `INC-${Date.now()}`;
  await pool.query(
    `INSERT INTO sla_incidents(alert_id, ticket_ref, status) VALUES ($1,$2,'open')`,
    [alertId, ticketRef]
  );
  console.log(`[Auto Action] Incident ticket created: ${ticketRef}`);
}

/**
 * Send notification via channel
 */
async function sendNotification(alertId: string, channel: string, params: any) {
  await pool.query(
    `INSERT INTO sla_alert_notifications(alert_id, channel, recipient, status)
     VALUES ($1,$2,$3,'pending')`,
    [alertId, channel, params.recipient || 'ops@molam.com']
  );
  console.log(`[Auto Action] Notification queued: ${channel}`);
}

/**
 * Publish event (webhook stub)
 */
function publishEvent(entity: string, id: string, event: string, data: any) {
  console.log(`[Webhook] ${entity}:${id} event=${event}`, data);
}
