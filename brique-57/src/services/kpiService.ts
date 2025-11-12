import { pool } from '../utils/db';
import * as cache from '../utils/cache';

interface FraudSnapshot {
  id: string;
  merchant_id: string;
  period_start: string;
  period_end: string;
  metrics: any;
  created_at: string;
}

interface FraudKPI {
  total_payments: number;
  total_volume: number;
  fraud_payments: number;
  fraud_volume: number;
  fraud_rate: number;
  chargeback_count: number;
  chargeback_rate: number;
  blocked_payments: number;
  blocked_volume: number;
  challenged_payments: number;
  whitelist_hits: number;
  blacklist_hits: number;
  avg_sira_score: number;
}

/**
 * Calculate fraud KPIs for merchant in time range
 */
export async function calculateKPIs(
  merchantId: string,
  startDate: Date,
  endDate: Date
): Promise<FraudKPI> {
  // Get payment stats from B56 payment_signals
  const { rows: signalStats } = await pool.query(
    `SELECT
       COUNT(*) as total_payments,
       COALESCE(SUM(amount), 0) as total_volume,
       COALESCE(AVG(sira_score->>'score'), 0) as avg_sira_score
     FROM payment_signals
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
    [merchantId, startDate, endDate]
  );

  // Get fraud payments (high risk)
  const { rows: fraudStats } = await pool.query(
    `SELECT
       COUNT(*) as fraud_payments,
       COALESCE(SUM(amount), 0) as fraud_volume
     FROM payment_signals
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3
       AND (sira_score->>'risk_level')::text IN ('high', 'critical')`,
    [merchantId, startDate, endDate]
  );

  // Get chargeback count from B55 disputes
  const { rows: cbStats } = await pool.query(
    `SELECT COUNT(*) as chargeback_count
     FROM disputes
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
    [merchantId, startDate, endDate]
  );

  // Get blocked/challenged actions from B56 radar_actions
  const { rows: actionStats } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE action->>'type' = 'block') as blocked_payments,
       COALESCE(SUM((action->>'amount')::numeric) FILTER (WHERE action->>'type' = 'block'), 0) as blocked_volume,
       COUNT(*) FILTER (WHERE action->>'type' = 'challenge') as challenged_payments
     FROM radar_actions
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
    [merchantId, startDate, endDate]
  );

  // Get whitelist/blacklist hits from B57 merchant_lists
  const { rows: listStats } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE list_type = 'whitelist') as whitelist_hits,
       COUNT(*) FILTER (WHERE list_type = 'blacklist') as blacklist_hits
     FROM merchant_lists
     WHERE merchant_id = $1 AND created_at BETWEEN $2 AND $3`,
    [merchantId, startDate, endDate]
  );

  const totalPayments = parseInt(signalStats[0]?.total_payments || '0', 10);
  const totalVolume = parseFloat(signalStats[0]?.total_volume || '0');
  const fraudPayments = parseInt(fraudStats[0]?.fraud_payments || '0', 10);
  const fraudVolume = parseFloat(fraudStats[0]?.fraud_volume || '0');
  const chargebackCount = parseInt(cbStats[0]?.chargeback_count || '0', 10);
  const blockedPayments = parseInt(actionStats[0]?.blocked_payments || '0', 10);
  const blockedVolume = parseFloat(actionStats[0]?.blocked_volume || '0');
  const challengedPayments = parseInt(actionStats[0]?.challenged_payments || '0', 10);
  const whitelistHits = parseInt(listStats[0]?.whitelist_hits || '0', 10);
  const blacklistHits = parseInt(listStats[0]?.blacklist_hits || '0', 10);
  const avgSiraScore = parseFloat(signalStats[0]?.avg_sira_score || '0');

  const fraudRate = totalPayments > 0 ? (fraudPayments / totalPayments) * 100 : 0;
  const chargebackRate = totalPayments > 0 ? (chargebackCount / totalPayments) * 100 : 0;

  return {
    total_payments: totalPayments,
    total_volume: totalVolume,
    fraud_payments: fraudPayments,
    fraud_volume: fraudVolume,
    fraud_rate: fraudRate,
    chargeback_count: chargebackCount,
    chargeback_rate: chargebackRate,
    blocked_payments: blockedPayments,
    blocked_volume: blockedVolume,
    challenged_payments: challengedPayments,
    whitelist_hits: whitelistHits,
    blacklist_hits: blacklistHits,
    avg_sira_score: avgSiraScore,
  };
}

/**
 * Create daily fraud snapshot for merchant
 */
export async function createSnapshot(
  merchantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<FraudSnapshot> {
  const kpis = await calculateKPIs(merchantId, periodStart, periodEnd);

  const { rows } = await pool.query<FraudSnapshot>(
    `INSERT INTO merchant_fraud_snapshots (merchant_id, period_start, period_end, metrics)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [merchantId, periodStart, periodEnd, JSON.stringify(kpis)]
  );

  return rows[0];
}

/**
 * Get fraud trend (daily snapshots) for date range
 */
export async function getFraudTrend(
  merchantId: string,
  startDate: Date,
  endDate: Date
): Promise<FraudSnapshot[]> {
  const { rows } = await pool.query<FraudSnapshot>(
    `SELECT * FROM merchant_fraud_snapshots
     WHERE merchant_id = $1 AND period_start >= $2 AND period_end <= $3
     ORDER BY period_start ASC`,
    [merchantId, startDate, endDate]
  );

  return rows;
}

/**
 * Get real-time fraud alerts (last 24h)
 */
export async function getRecentAlerts(merchantId: string, limit: number = 50): Promise<any[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get recent high-risk signals
  const { rows } = await pool.query(
    `SELECT
       ps.id,
       ps.payment_id,
       ps.merchant_id,
       ps.customer_id,
       ps.amount,
       ps.currency,
       ps.sira_score,
       ps.velocity,
       ps.created_at,
       ra.action
     FROM payment_signals ps
     LEFT JOIN radar_actions ra ON ra.payment_signal_id = ps.id
     WHERE ps.merchant_id = $1
       AND ps.created_at >= $2
       AND (ps.sira_score->>'risk_level')::text IN ('high', 'critical')
     ORDER BY ps.created_at DESC
     LIMIT $3`,
    [merchantId, oneDayAgo, limit]
  );

  return rows;
}

/**
 * Get protection level status for merchant
 */
export async function getProtectionStatus(merchantId: string): Promise<any> {
  const { rows } = await pool.query(
    `SELECT * FROM merchant_protections WHERE merchant_id = $1`,
    [merchantId]
  );

  if (rows.length === 0) {
    return {
      level: 'basic',
      features: ['basic_fraud_detection'],
      chargeback_protection: false,
      guaranteed_coverage: false,
    };
  }

  const protection = rows[0];
  return {
    level: protection.level,
    features: protection.features,
    chargeback_protection: protection.chargeback_protection,
    guaranteed_coverage: protection.guaranteed_coverage,
    activated_at: protection.activated_at,
  };
}

/**
 * Subscribe merchant to protection level
 */
export async function subscribeToProtection(
  merchantId: string,
  level: 'basic' | 'premium' | 'guaranteed',
  actorId?: string
): Promise<any> {
  const features: Record<string, string[]> = {
    basic: ['basic_fraud_detection', 'whitelist_blacklist'],
    premium: ['basic_fraud_detection', 'whitelist_blacklist', 'advanced_radar_rules', 'velocity_checks', 'email_alerts'],
    guaranteed: ['basic_fraud_detection', 'whitelist_blacklist', 'advanced_radar_rules', 'velocity_checks', 'email_alerts', 'chargeback_guarantee', 'priority_support', 'custom_rules'],
  };

  const chargebackProtection = level === 'premium' || level === 'guaranteed';
  const guaranteedCoverage = level === 'guaranteed';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO merchant_protections (merchant_id, level, features, chargeback_protection, guaranteed_coverage, activated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (merchant_id)
       DO UPDATE SET level = EXCLUDED.level, features = EXCLUDED.features,
                     chargeback_protection = EXCLUDED.chargeback_protection,
                     guaranteed_coverage = EXCLUDED.guaranteed_coverage,
                     activated_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [merchantId, level, JSON.stringify(features[level]), chargebackProtection, guaranteedCoverage]
    );

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes, merchant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['merchant_protection', rows[0].id, 'subscribe_protection', actorId, JSON.stringify({ level }), merchantId]
    );

    await client.query('COMMIT');

    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get alert count (cached)
 */
export async function getAlertCount(merchantId: string): Promise<number> {
  return await cache.getAlertCount(merchantId);
}
