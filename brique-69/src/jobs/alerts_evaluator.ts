/**
 * Alerts Evaluator Job
 * Periodically evaluates alert rules against real-time metrics
 */

import * as dotenv from 'dotenv';
import { query, getPool } from '../services/db';
import { alertsCreated } from '../utils/metrics';

dotenv.config();

const CHECK_INTERVAL = parseInt(process.env.ANALYTICS_ALERT_CHECK_INTERVAL || '60000', 10);

interface AlertRule {
  id: string;
  name: string;
  merchant_id?: string;
  region?: string;
  country?: string;
  metric: string;
  comparator: string;
  threshold: number;
  window_minutes: number;
  severity: string;
  notify_channels?: any;
  webhook_url?: string;
  auto_actions?: any;
}

export async function evaluateAlertRules() {
  try {
    console.log('🔍 Evaluating alert rules...');

    // Fetch active alert rules
    const rulesResult = await query<AlertRule>(
      'SELECT * FROM analytics_alert_rules WHERE is_active = true'
    );

    const rules = rulesResult.rows;
    console.log(`Found ${rules.length} active alert rules`);

    for (const rule of rules) {
      try {
        await evaluateRule(rule);
      } catch (error) {
        console.error(`Error evaluating rule ${rule.id}:`, error);
      }
    }

    console.log('✅ Alert evaluation complete');
  } catch (error) {
    console.error('Error in alert evaluation:', error);
  }
}

async function evaluateRule(rule: AlertRule) {
  // Build query based on metric type
  let metricQuery: string;
  let params: any[];

  const windowStart = new Date(Date.now() - rule.window_minutes * 60 * 1000);

  switch (rule.metric) {
    case 'refund_rate':
      metricQuery = `
        SELECT
          CASE
            WHEN SUM(tx_count) > 0 THEN (SUM(refunds_local) / SUM(gross_volume_local) * 100)
            ELSE 0
          END as value
        FROM txn_hourly_agg
        WHERE
          hour >= $1
          AND ($2::uuid IS NULL OR merchant_id = $2)
          AND ($3::text IS NULL OR region = $3)
          AND ($4::text IS NULL OR country = $4)
      `;
      params = [windowStart, rule.merchant_id || null, rule.region || null, rule.country || null];
      break;

    case 'chargeback_rate':
      metricQuery = `
        SELECT
          CASE
            WHEN SUM(tx_count) > 0 THEN (SUM(chargebacks_local) / SUM(gross_volume_local) * 100)
            ELSE 0
          END as value
        FROM txn_hourly_agg
        WHERE
          hour >= $1
          AND ($2::uuid IS NULL OR merchant_id = $2)
          AND ($3::text IS NULL OR region = $3)
          AND ($4::text IS NULL OR country = $4)
      `;
      params = [windowStart, rule.merchant_id || null, rule.region || null, rule.country || null];
      break;

    case 'volume_spike':
      // Calculate z-score compared to historical average
      metricQuery = `
        WITH current_window AS (
          SELECT SUM(gross_volume_usd) as current_value
          FROM txn_hourly_agg
          WHERE hour >= $1
            AND ($2::uuid IS NULL OR merchant_id = $2)
            AND ($3::text IS NULL OR region = $3)
            AND ($4::text IS NULL OR country = $4)
        ),
        historical AS (
          SELECT AVG(gross_volume_usd) as avg_value, STDDEV(gross_volume_usd) as stddev_value
          FROM txn_hourly_agg
          WHERE hour >= $1 - INTERVAL '7 days' AND hour < $1
            AND ($2::uuid IS NULL OR merchant_id = $2)
            AND ($3::text IS NULL OR region = $3)
            AND ($4::text IS NULL OR country = $4)
        )
        SELECT
          CASE
            WHEN historical.stddev_value > 0 THEN
              ABS(current_window.current_value - historical.avg_value) / historical.stddev_value
            ELSE 0
          END as value
        FROM current_window, historical
      `;
      params = [windowStart, rule.merchant_id || null, rule.region || null, rule.country || null];
      break;

    case 'success_rate':
      metricQuery = `
        SELECT
          CASE
            WHEN SUM(tx_count) > 0 THEN (SUM(success_count)::float / SUM(tx_count)::float * 100)
            ELSE 100
          END as value
        FROM txn_hourly_agg
        WHERE
          hour >= $1
          AND ($2::uuid IS NULL OR merchant_id = $2)
          AND ($3::text IS NULL OR region = $3)
          AND ($4::text IS NULL OR country = $4)
      `;
      params = [windowStart, rule.merchant_id || null, rule.region || null, rule.country || null];
      break;

    case 'transaction_volume':
      metricQuery = `
        SELECT SUM(gross_volume_usd) as value
        FROM txn_hourly_agg
        WHERE
          hour >= $1
          AND ($2::uuid IS NULL OR merchant_id = $2)
          AND ($3::text IS NULL OR region = $3)
          AND ($4::text IS NULL OR country = $4)
      `;
      params = [windowStart, rule.merchant_id || null, rule.region || null, rule.country || null];
      break;

    default:
      console.warn(`Unknown metric type: ${rule.metric}`);
      return;
  }

  // Execute metric query
  const metricResult = await query<{ value: number }>(metricQuery, params);
  const currentValue = metricResult.rows[0]?.value || 0;

  // Evaluate condition
  const conditionMet = evaluateCondition(currentValue, rule.comparator, rule.threshold);

  if (conditionMet) {
    console.log(`⚠️  Alert triggered: ${rule.name} (${currentValue} ${rule.comparator} ${rule.threshold})`);

    // Check if similar alert already exists and is open
    const existingAlertResult = await query(
      `SELECT id FROM analytics_alerts
       WHERE source = 'rule'
         AND metric = $1
         AND status = 'open'
         AND ($2::uuid IS NULL OR merchant_id = $2)
         AND created_at >= NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [rule.metric, rule.merchant_id || null]
    );

    if (existingAlertResult.rowCount === 0) {
      // Create new alert
      await createAlert(rule, currentValue);
    } else {
      console.log(`Similar alert already exists, skipping duplicate`);
    }
  }
}

function evaluateCondition(value: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '=': return Math.abs(value - threshold) < 0.01;
    case '!=': return Math.abs(value - threshold) >= 0.01;
    default: return false;
  }
}

async function createAlert(rule: AlertRule, currentValue: number) {
  const deviation = rule.threshold > 0 ? ((currentValue - rule.threshold) / rule.threshold * 100) : 0;

  const title = `${rule.name}: ${rule.metric} alert`;
  const description = `${rule.metric} is ${currentValue.toFixed(2)}, which ${rule.comparator} threshold of ${rule.threshold}`;

  const insertQuery = `
    INSERT INTO analytics_alerts (
      source, alert_type, merchant_id, region, country,
      severity, metric, current_value, threshold_value, deviation_percent,
      title, description, payload, recommended_action, auto_action_taken
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id
  `;

  const result = await query(insertQuery, [
    'rule',
    'threshold',
    rule.merchant_id || null,
    rule.region || null,
    rule.country || null,
    rule.severity,
    rule.metric,
    currentValue,
    rule.threshold,
    deviation,
    title,
    description,
    JSON.stringify({ rule_id: rule.id, rule_name: rule.name }),
    getRecommendedAction(rule.metric, currentValue, rule.threshold),
    false,
  ]);

  const alertId = result.rows[0].id;
  console.log(`✅ Alert created: ${alertId}`);

  // Update metrics
  alertsCreated.inc({ severity: rule.severity, source: 'rule' });

  // Send notifications
  await sendNotifications(rule, alertId, currentValue);

  // Execute auto-actions
  if (rule.auto_actions) {
    await executeAutoActions(rule, alertId);
  }
}

function getRecommendedAction(metric: string, value: number, threshold: number): string {
  switch (metric) {
    case 'refund_rate':
      return 'Review recent transactions and contact affected merchants';
    case 'chargeback_rate':
      return 'Investigate fraud patterns and consider pausing high-risk merchants';
    case 'volume_spike':
      return 'Verify legitimacy of spike and ensure sufficient liquidity';
    case 'success_rate':
      return 'Check integration health and payment provider status';
    default:
      return 'Review metrics and investigate root cause';
  }
}

async function sendNotifications(rule: AlertRule, alertId: string, currentValue: number) {
  if (!rule.notify_channels) return;

  const channels = Array.isArray(rule.notify_channels) ? rule.notify_channels : rule.notify_channels.channels || [];

  for (const channel of channels) {
    try {
      if (channel === 'webhook' && rule.webhook_url) {
        // Send webhook notification
        await fetch(rule.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert_id: alertId,
            rule_name: rule.name,
            metric: rule.metric,
            current_value: currentValue,
            threshold: rule.threshold,
            severity: rule.severity,
            timestamp: new Date().toISOString(),
          }),
        });
        console.log(`📤 Webhook notification sent to ${rule.webhook_url}`);
      } else if (channel === 'email') {
        // TODO: Implement email notification
        console.log('📧 Email notification (not implemented)');
      } else if (channel === 'sms') {
        // TODO: Implement SMS notification
        console.log('📱 SMS notification (not implemented)');
      }
    } catch (error) {
      console.error(`Error sending ${channel} notification:`, error);
    }
  }
}

async function executeAutoActions(rule: AlertRule, alertId: string) {
  console.log(`🤖 Executing auto-actions for alert ${alertId}`);

  if (rule.auto_actions.pause_payouts) {
    console.log('  - Pausing payouts (not implemented)');
  }

  if (rule.auto_actions.flag_merchant) {
    console.log('  - Flagging merchant (not implemented)');
  }

  // Mark auto-action as taken
  await query(
    'UPDATE analytics_alerts SET auto_action_taken = true WHERE id = $1',
    [alertId]
  );
}

// Run continuously
async function start() {
  console.log('🚀 Starting alerts evaluator job...');
  console.log(`Check interval: ${CHECK_INTERVAL}ms`);

  // Run immediately
  await evaluateAlertRules();

  // Schedule periodic checks
  setInterval(async () => {
    await evaluateAlertRules();
  }, CHECK_INTERVAL);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await getPool().end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await getPool().end();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start alerts evaluator:', error);
    process.exit(1);
  });
}

export { evaluateAlertRules };
