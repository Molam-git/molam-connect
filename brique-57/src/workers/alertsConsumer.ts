import { pool } from '../utils/db';
import * as notificationsService from '../services/notificationsService';
import * as cache from '../utils/cache';
import { Counter } from 'prom-client';

const alertsProcessedCounter = new Counter({
  name: 'molam_merchant_alerts_processed_total',
  help: 'Total merchant fraud alerts processed',
  labelNames: ['merchant_id', 'event_type'],
});

/**
 * Alerts Consumer Worker
 * Listens to payment_signals and radar_actions to send real-time fraud alerts
 */

const POLL_INTERVAL = 5000; // 5 seconds

interface PaymentSignal {
  id: string;
  merchant_id: string;
  payment_id: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  sira_score: any;
  velocity: any;
  device_fingerprint: string | null;
  created_at: string;
}

interface RadarAction {
  id: string;
  merchant_id: string;
  payment_signal_id: string;
  rule_id: string;
  action: any;
  created_at: string;
}

let lastProcessedSignalId: string | null = null;
let lastProcessedActionId: string | null = null;

/**
 * Process high-risk payment signals
 */
async function processHighRiskSignals(): Promise<void> {
  const query = lastProcessedSignalId
    ? `SELECT * FROM payment_signals
       WHERE (sira_score->>'risk_level')::text IN ('high', 'critical')
         AND id > $1
       ORDER BY id ASC LIMIT 100`
    : `SELECT * FROM payment_signals
       WHERE (sira_score->>'risk_level')::text IN ('high', 'critical')
       ORDER BY id ASC LIMIT 100`;

  const params = lastProcessedSignalId ? [lastProcessedSignalId] : [];
  const { rows } = await pool.query<PaymentSignal>(query, params);

  for (const signal of rows) {
    try {
      // Send high_risk_payment alert
      await notificationsService.sendAlert(signal.merchant_id, 'high_risk_payment', {
        payment_id: signal.payment_id,
        customer_id: signal.customer_id,
        amount: signal.amount,
        currency: signal.currency,
        sira_score: signal.sira_score,
        risk_level: signal.sira_score?.risk_level,
        reasons: signal.sira_score?.reasons,
        timestamp: signal.created_at,
      });

      // Increment alert count
      await cache.incrementAlertCount(signal.merchant_id);

      alertsProcessedCounter.inc({ merchant_id: signal.merchant_id, event_type: 'high_risk_payment' });

      lastProcessedSignalId = signal.id;
    } catch (error) {
      console.error(`[AlertsConsumer] Error processing signal ${signal.id}:`, error);
    }
  }
}

/**
 * Process radar actions (blocks, challenges)
 */
async function processRadarActions(): Promise<void> {
  const query = lastProcessedActionId
    ? `SELECT * FROM radar_actions WHERE id > $1 ORDER BY id ASC LIMIT 100`
    : `SELECT * FROM radar_actions ORDER BY id ASC LIMIT 100`;

  const params = lastProcessedActionId ? [lastProcessedActionId] : [];
  const { rows } = await pool.query<RadarAction>(query, params);

  for (const action of rows) {
    try {
      const actionType = action.action?.type;

      // Send alert for blacklist hits
      if (actionType === 'block' && action.action?.reason === 'blacklist_hit') {
        await notificationsService.sendAlert(action.merchant_id, 'blacklist_hit', {
          payment_signal_id: action.payment_signal_id,
          rule_id: action.rule_id,
          action: action.action,
          timestamp: action.created_at,
        });

        await cache.incrementAlertCount(action.merchant_id);
        alertsProcessedCounter.inc({ merchant_id: action.merchant_id, event_type: 'blacklist_hit' });
      }

      // Send alert for velocity exceeded
      if (actionType === 'block' && action.action?.reason === 'velocity_exceeded') {
        await notificationsService.sendAlert(action.merchant_id, 'velocity_exceeded', {
          payment_signal_id: action.payment_signal_id,
          rule_id: action.rule_id,
          action: action.action,
          timestamp: action.created_at,
        });

        await cache.incrementAlertCount(action.merchant_id);
        alertsProcessedCounter.inc({ merchant_id: action.merchant_id, event_type: 'velocity_exceeded' });
      }

      lastProcessedActionId = action.id;
    } catch (error) {
      console.error(`[AlertsConsumer] Error processing action ${action.id}:`, error);
    }
  }
}

/**
 * Check for disputes with approaching evidence deadlines
 */
async function checkDisputeDeadlines(): Promise<void> {
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `SELECT * FROM disputes
     WHERE status IN ('pending', 'under_review')
       AND response_due_date <= $1
       AND response_due_date > NOW()`,
    [threeDaysFromNow]
  );

  for (const dispute of rows) {
    try {
      await notificationsService.sendAlert(dispute.merchant_id, 'evidence_due_soon', {
        dispute_id: dispute.id,
        reason_code: dispute.reason_code,
        amount: dispute.amount,
        currency: dispute.currency,
        response_due_date: dispute.response_due_date,
        days_remaining: Math.ceil(
          (new Date(dispute.response_due_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        ),
      });

      alertsProcessedCounter.inc({ merchant_id: dispute.merchant_id, event_type: 'evidence_due_soon' });
    } catch (error) {
      console.error(`[AlertsConsumer] Error processing dispute deadline ${dispute.id}:`, error);
    }
  }
}

/**
 * Main worker loop
 */
async function run(): Promise<void> {
  console.log('[AlertsConsumer] Worker started');

  setInterval(async () => {
    try {
      await processHighRiskSignals();
      await processRadarActions();
      await checkDisputeDeadlines();
    } catch (error) {
      console.error('[AlertsConsumer] Error in worker loop:', error);
    }
  }, POLL_INTERVAL);
}

run().catch((error) => {
  console.error('[AlertsConsumer] Fatal error:', error);
  process.exit(1);
});
