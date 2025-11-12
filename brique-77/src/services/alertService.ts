/**
 * Sous-Brique 77.1 - Alert Service with Auto-Remediation
 *
 * Real-time alerting with SIRA-powered auto-remediation:
 * - Alert detection from metrics events
 * - SIRA recommendation integration
 * - Auto-remediation policy evaluation
 * - Ops action creation and execution
 * - Immutable audit trail
 *
 * @version 1.0.0
 * @date 2025-11-12
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'molam_connect',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
});

// =======================================================================
// TYPES
// =======================================================================

export type AlertType =
  | 'float_low'
  | 'recon_match_drop'
  | 'refund_spike'
  | 'payout_fail_rate'
  | 'dlq_growth'
  | 'fraud_score_high'
  | 'conversion_drop'
  | 'chargeback_spike';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed' | 'auto_remediated';

export interface Alert {
  id: string;
  alert_type: AlertType;
  tenant_type: string;
  tenant_id?: string;
  severity: AlertSeverity;
  metric: Record<string, any>;
  status: AlertStatus;
  title?: string;
  description?: string;
  created_at: Date;
  acknowledged_at?: Date;
  resolved_at?: Date;
  remedied_by_action_id?: string;
}

export interface RemediationPolicy {
  id: string;
  alert_type: AlertType;
  enabled: boolean;
  auto_action: Record<string, any>;
  auto_threshold: number;
  cooldown_seconds: number;
  last_executed_at?: Date;
  require_multi_sig: boolean;
  required_approvals: number;
  notify_channels: string[];
}

export interface SiraRecommendation {
  recommendation: string;
  confidence: number;
  explanation: {
    features: Array<{ name: string; value: any; weight: number }>;
    model: string;
  };
}

export interface MetricEvent {
  metric: string;
  value: number;
  threshold?: number;
  tenant_type: string;
  tenant_id?: string;
  timestamp: Date;
  context?: Record<string, any>;
}

// =======================================================================
// ALERT DETECTION
// =======================================================================

/**
 * Process metric event and create alert if threshold breached
 */
export async function processMetricEvent(event: MetricEvent): Promise<Alert | null> {
  const client = await pool.connect();

  try {
    // Check if alert should be created based on rules
    const alertConfig = getAlertConfigForMetric(event.metric);

    if (!alertConfig) {
      return null;
    }

    const shouldAlert = evaluateAlertRule(event, alertConfig);

    if (!shouldAlert) {
      return null;
    }

    // Create alert
    const alert = await createAlert({
      alert_type: alertConfig.alert_type,
      tenant_type: event.tenant_type,
      tenant_id: event.tenant_id,
      severity: alertConfig.severity(event),
      metric: {
        metric: event.metric,
        value: event.value,
        threshold: event.threshold || alertConfig.threshold,
        previous_value: event.context?.previous_value,
        ...event.context,
      },
      title: alertConfig.title(event),
      description: alertConfig.description(event),
    });

    // Trigger remediation flow (async)
    triggerRemediationFlow(alert).catch((err) => {
      console.error('[AlertService] Remediation flow failed:', err);
    });

    return alert;
  } finally {
    client.release();
  }
}

/**
 * Create alert in database
 */
export async function createAlert(params: {
  alert_type: AlertType;
  tenant_type: string;
  tenant_id?: string;
  severity: AlertSeverity;
  metric: Record<string, any>;
  title?: string;
  description?: string;
}): Promise<Alert> {
  const result = await pool.query<Alert>(
    `SELECT create_alert_with_remediation($1, $2, $3, $4, $5, $6, $7) as id`,
    [
      params.alert_type,
      params.tenant_type,
      params.tenant_id,
      params.severity,
      JSON.stringify(params.metric),
      params.title,
      params.description,
    ]
  );

  const alertId = result.rows[0].id;

  // Fetch created alert
  const alertResult = await pool.query<Alert>(`SELECT * FROM alerts WHERE id = $1`, [alertId]);

  return alertResult.rows[0];
}

// =======================================================================
// ALERT RULES CONFIGURATION
// =======================================================================

interface AlertRuleConfig {
  alert_type: AlertType;
  threshold: number;
  severity: (event: MetricEvent) => AlertSeverity;
  title: (event: MetricEvent) => string;
  description: (event: MetricEvent) => string;
}

function getAlertConfigForMetric(metric: string): AlertRuleConfig | null {
  const configs: Record<string, AlertRuleConfig> = {
    recon_match_rate: {
      alert_type: 'recon_match_drop',
      threshold: 0.95,
      severity: (e) => (e.value < 0.90 ? 'critical' : 'warning'),
      title: () => 'Reconciliation Match Rate Drop',
      description: (e) =>
        `Match rate dropped to ${(e.value * 100).toFixed(2)}% (threshold: ${
          (e.threshold || 0.95) * 100
        }%)`,
    },
    float_available: {
      alert_type: 'float_low',
      threshold: 1000000,
      severity: (e) => (e.value < 500000 ? 'critical' : 'warning'),
      title: () => 'Low Float Alert',
      description: (e) => `Float available ${e.value} is below threshold ${e.threshold || 1000000}`,
    },
    refund_rate: {
      alert_type: 'refund_spike',
      threshold: 0.05,
      severity: (e) => (e.value > 0.10 ? 'critical' : 'warning'),
      title: () => 'Refund Spike Detected',
      description: (e) =>
        `Refund rate spiked to ${(e.value * 100).toFixed(2)}% (normal: ${
          (e.threshold || 0.05) * 100
        }%)`,
    },
    payout_fail_rate: {
      alert_type: 'payout_fail_rate',
      threshold: 0.05,
      severity: (e) => (e.value > 0.15 ? 'critical' : 'warning'),
      title: () => 'High Payout Failure Rate',
      description: (e) =>
        `Payout failure rate ${(e.value * 100).toFixed(2)}% exceeds threshold`,
    },
    fraud_score: {
      alert_type: 'fraud_score_high',
      threshold: 0.70,
      severity: (e) => (e.value > 0.90 ? 'critical' : 'warning'),
      title: () => 'High Fraud Score Detected',
      description: (e) => `Fraud score ${e.value} exceeds threshold ${e.threshold || 0.70}`,
    },
  };

  return configs[metric] || null;
}

function evaluateAlertRule(event: MetricEvent, config: AlertRuleConfig): boolean {
  const threshold = event.threshold || config.threshold;

  // Simple threshold check (can be extended with anomaly detection)
  switch (event.metric) {
    case 'recon_match_rate':
    case 'conversion_rate':
      return event.value < threshold; // Below threshold is bad

    case 'float_available':
      return event.value < threshold; // Below threshold is bad

    case 'refund_rate':
    case 'payout_fail_rate':
    case 'fraud_score':
      return event.value > threshold; // Above threshold is bad

    default:
      return false;
  }
}

// =======================================================================
// REMEDIATION FLOW
// =======================================================================

/**
 * Trigger remediation flow for alert
 */
async function triggerRemediationFlow(alert: Alert): Promise<void> {
  const client = await pool.connect();

  try {
    // Get remediation policy
    const policyResult = await client.query<RemediationPolicy>(
      `SELECT * FROM remediation_policies WHERE alert_type = $1 AND enabled = true`,
      [alert.alert_type]
    );

    if (policyResult.rows.length === 0) {
      console.log(`[AlertService] No active policy for alert type: ${alert.alert_type}`);
      return;
    }

    const policy = policyResult.rows[0];

    // Check cooldown
    const cooldownOk = await checkCooldown(alert.alert_type);

    if (!cooldownOk) {
      console.log(`[AlertService] Policy in cooldown for: ${alert.alert_type}`);
      await recordDecision(alert.id, {
        actor: 'system',
        action: 'skip',
        details: { reason: 'cooldown', cooldown_seconds: policy.cooldown_seconds },
      });
      return;
    }

    // Call SIRA for recommendation
    const siraRec = await callSiraRecommendation(alert);

    // Record SIRA decision
    await recordDecision(alert.id, {
      actor: 'sira',
      action: 'suggest',
      details: siraRec,
    });

    // Evaluate if auto-remediation should happen
    if (policy.require_multi_sig) {
      // Create ops_action with multi-sig requirement
      await createOpsActionForApproval(alert, policy, siraRec);
    } else if (siraRec.confidence >= policy.auto_threshold) {
      // Auto-execute
      await executeAutoRemediation(alert, policy, siraRec);
    } else {
      console.log(
        `[AlertService] SIRA confidence ${siraRec.confidence} below threshold ${policy.auto_threshold}`
      );
      await recordDecision(alert.id, {
        actor: 'system',
        action: 'skip',
        details: { reason: 'low_confidence', confidence: siraRec.confidence },
      });
    }
  } catch (error: any) {
    console.error('[AlertService] Remediation flow error:', error);
    await recordDecision(alert.id, {
      actor: 'system',
      action: 'error',
      details: { error: error.message },
    });
  } finally {
    client.release();
  }
}

/**
 * Check if policy is outside cooldown period
 */
async function checkCooldown(alertType: AlertType): Promise<boolean> {
  const result = await pool.query<{ cooldown_ok: boolean }>(
    `SELECT check_policy_cooldown($1) as cooldown_ok`,
    [alertType]
  );

  return result.rows[0]?.cooldown_ok ?? false;
}

/**
 * Call SIRA API for recommendation
 */
async function callSiraRecommendation(alert: Alert): Promise<SiraRecommendation> {
  const siraUrl = process.env.SIRA_URL || 'http://localhost:5000';
  const siraKey = process.env.SIRA_KEY || 'test-key';

  try {
    const response = await fetch(`${siraUrl}/v1/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${siraKey}`,
      },
      body: JSON.stringify({ alert }),
      timeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`SIRA API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('[AlertService] SIRA call failed:', error);

    // Fallback: return default recommendation with low confidence
    return {
      recommendation: 'manual_review',
      confidence: 0.5,
      explanation: {
        features: [],
        model: 'fallback',
      },
    };
  }
}

/**
 * Record decision in alert_decisions
 */
async function recordDecision(
  alertId: string,
  decision: Record<string, any>
): Promise<void> {
  await pool.query(
    `INSERT INTO alert_decisions (alert_id, decision) VALUES ($1, $2)`,
    [alertId, JSON.stringify(decision)]
  );
}

/**
 * Create ops_action for multi-sig approval
 */
async function createOpsActionForApproval(
  alert: Alert,
  policy: RemediationPolicy,
  siraRec: SiraRecommendation
): Promise<void> {
  const actionType = policy.auto_action.action_type;
  const target = {
    tenant_type: alert.tenant_type,
    tenant_id: alert.tenant_id,
    alert_id: alert.id,
  };
  const params = {
    ...policy.auto_action.params,
    sira_recommendation: siraRec.recommendation,
    sira_confidence: siraRec.confidence,
  };

  const result = await pool.query(
    `INSERT INTO ops_actions (
      actor_id, actor_role, action_type, target, params, status, required_approvals, risk_level
    ) VALUES ($1, $2, $3, $4, $5, 'requested', $6, 'high')
    RETURNING id`,
    [null, 'sira', actionType, JSON.stringify(target), JSON.stringify(params), policy.required_approvals]
  );

  console.log(
    `[AlertService] Created ops_action ${result.rows[0].id} for alert ${alert.id} (requires approval)`
  );

  // TODO: Notify ops team (email, Slack, etc.)
}

/**
 * Execute auto-remediation
 */
async function executeAutoRemediation(
  alert: Alert,
  policy: RemediationPolicy,
  siraRec: SiraRecommendation
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create ops_action with auto-approved status
    const actionResult = await client.query(
      `INSERT INTO ops_actions (
        actor_id, actor_role, action_type, target, params, status, risk_level
      ) VALUES ($1, $2, $3, $4, $5, 'approved', 'medium')
      RETURNING *`,
      [
        null,
        'sira',
        policy.auto_action.action_type,
        JSON.stringify({ tenant_type: alert.tenant_type, tenant_id: alert.tenant_id }),
        JSON.stringify({ ...policy.auto_action.params, sira_confidence: siraRec.confidence }),
      ]
    );

    const action = actionResult.rows[0];

    // Execute action (stub - actual implementation depends on action type)
    const executionResult = await executeAction(action);

    // Update action as executed
    await client.query(
      `UPDATE ops_actions
       SET status = 'executed', executed_at = now(), execution_result = $1
       WHERE id = $2`,
      [JSON.stringify(executionResult), action.id]
    );

    // Update alert as auto-remediated
    await client.query(
      `UPDATE alerts
       SET status = 'auto_remediated', resolved_at = now(), remedied_by_action_id = $1
       WHERE id = $2`,
      [action.id, alert.id]
    );

    // Record execution decision
    await client.query(
      `INSERT INTO alert_decisions (alert_id, decision) VALUES ($1, $2)`,
      [alert.id, JSON.stringify({
        actor: 'system',
        action: 'execute',
        details: { action_id: action.id, result: executionResult },
      })]
    );

    // Update policy last_executed_at
    await client.query(`SELECT update_policy_last_executed($1)`, [alert.alert_type]);

    await client.query('COMMIT');

    console.log(`[AlertService] Auto-remediated alert ${alert.id} with action ${action.id}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute action (stub - actual implementation depends on action type)
 */
async function executeAction(action: any): Promise<Record<string, any>> {
  console.log(`[AlertService] Executing action: ${action.action_type}`, action.params);

  // TODO: Implement actual action execution
  // - PAUSE_PAYOUT: Call treasury API to pause payouts
  // - FREEZE_MERCHANT: Update merchant status
  // - ADJUST_FLOAT: Trigger float adjustment
  // - ROUTE_PAYOUT_OVERRIDE: Update payout routing rules
  // etc.

  return {
    executed: true,
    executed_at: new Date().toISOString(),
    action_type: action.action_type,
  };
}

// =======================================================================
// ALERT MANAGEMENT
// =======================================================================

/**
 * Get alerts for tenant
 */
export async function getAlerts(params: {
  tenant_type: string;
  tenant_id?: string;
  status?: AlertStatus;
  severity?: AlertSeverity[];
  limit?: number;
  offset?: number;
}): Promise<Alert[]> {
  const { tenant_type, tenant_id, status, severity, limit = 50, offset = 0 } = params;

  let query = `SELECT * FROM alerts WHERE tenant_type = $1`;
  const queryParams: any[] = [tenant_type];
  let paramIndex = 2;

  if (tenant_id) {
    query += ` AND tenant_id = $${paramIndex}`;
    queryParams.push(tenant_id);
    paramIndex++;
  }

  if (status) {
    query += ` AND status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }

  if (severity && severity.length > 0) {
    query += ` AND severity = ANY($${paramIndex})`;
    queryParams.push(severity);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  queryParams.push(limit, offset);

  const result = await pool.query<Alert>(query, queryParams);

  return result.rows;
}

/**
 * Acknowledge alert
 */
export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE alerts SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = $1 WHERE id = $2`,
    [userId, alertId]
  );
}

/**
 * Resolve alert manually
 */
export async function resolveAlert(alertId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE alerts SET status = 'resolved', resolved_at = now(), resolved_by = $1 WHERE id = $2`,
    [userId, alertId]
  );
}

// =======================================================================
// POLICY MANAGEMENT
// =======================================================================

/**
 * Get remediation policy
 */
export async function getPolicy(alertType: AlertType): Promise<RemediationPolicy | null> {
  const result = await pool.query<RemediationPolicy>(
    `SELECT * FROM remediation_policies WHERE alert_type = $1`,
    [alertType]
  );

  return result.rows[0] || null;
}

/**
 * Update remediation policy
 */
export async function updatePolicy(
  alertType: AlertType,
  updates: Partial<RemediationPolicy>,
  userId: string
): Promise<RemediationPolicy> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (['id', 'alert_type', 'created_by', 'created_at'].includes(key)) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(JSON.stringify(value));
    } else {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
    }
    paramIndex++;
  }

  fields.push(`updated_by = $${paramIndex}`);
  values.push(userId);
  paramIndex++;

  values.push(alertType);

  const result = await pool.query<RemediationPolicy>(
    `UPDATE remediation_policies
     SET ${fields.join(', ')}, updated_at = now()
     WHERE alert_type = $${paramIndex}
     RETURNING *`,
    values
  );

  return result.rows[0];
}

export { pool };
