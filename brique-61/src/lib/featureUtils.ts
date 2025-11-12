import { PoolClient } from 'pg';

interface SubscriptionEvent {
  id: string;
  merchant_id: string;
  user_id: string;
  type: string;
  payload: any;
  occurred_at: string;
}

interface Features {
  // Payment features
  failed_payment_count_30d?: number;
  successful_payment_count_30d?: number;
  payment_success_rate?: number;
  days_since_last_payment?: number;

  // Usage features
  login_count_7d?: number;
  login_count_30d?: number;
  days_since_last_login?: number;
  avg_session_duration?: number;

  // Subscription features
  plan_age_days?: number;
  subscription_changes_count?: number;
  days_to_next_billing?: number;

  // Card/Payment method features
  card_expiry_delta_days?: number;

  // Metadata
  event_type?: string;
  event_count_7d?: number;
}

/**
 * Compute features from a subscription event
 * This aggregates historical data from the database to build feature vector
 */
export async function computeFeatures(event: SubscriptionEvent, client: PoolClient): Promise<Features> {
  const features: Features = {};

  const now = new Date(event.occurred_at);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // Payment features (last 30 days)
  const { rows: paymentStats } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'payment_failed') as failed_count,
       COUNT(*) FILTER (WHERE event_type = 'payment_succeeded') as success_count
     FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2
       AND occurred_at >= $3 AND occurred_at <= $4`,
    [event.user_id, event.merchant_id, thirtyDaysAgo.toISOString(), now.toISOString()]
  );

  if (paymentStats.length > 0) {
    const failed = parseInt(paymentStats[0].failed_count || '0', 10);
    const success = parseInt(paymentStats[0].success_count || '0', 10);

    features.failed_payment_count_30d = failed;
    features.successful_payment_count_30d = success;
    features.payment_success_rate = success + failed > 0 ? success / (success + failed) : 1.0;
  }

  // Days since last payment
  const { rows: lastPayment } = await client.query(
    `SELECT occurred_at FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2 AND event_type LIKE 'payment_%'
     ORDER BY occurred_at DESC LIMIT 1`,
    [event.user_id, event.merchant_id]
  );

  if (lastPayment.length > 0) {
    const lastPaymentDate = new Date(lastPayment[0].occurred_at);
    features.days_since_last_payment = Math.floor((now.getTime() - lastPaymentDate.getTime()) / (1000 * 3600 * 24));
  }

  // Login/usage features (last 7 and 30 days)
  const { rows: loginStats } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE occurred_at >= $3) as login_7d,
       COUNT(*) as login_30d
     FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2
       AND event_type = 'login'
       AND occurred_at >= $4`,
    [event.user_id, event.merchant_id, sevenDaysAgo.toISOString(), thirtyDaysAgo.toISOString()]
  );

  if (loginStats.length > 0) {
    features.login_count_7d = parseInt(loginStats[0].login_7d || '0', 10);
    features.login_count_30d = parseInt(loginStats[0].login_30d || '0', 10);
  }

  // Days since last login
  const { rows: lastLogin } = await client.query(
    `SELECT occurred_at FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2 AND event_type = 'login'
     ORDER BY occurred_at DESC LIMIT 1`,
    [event.user_id, event.merchant_id]
  );

  if (lastLogin.length > 0) {
    const lastLoginDate = new Date(lastLogin[0].occurred_at);
    features.days_since_last_login = Math.floor((now.getTime() - lastLoginDate.getTime()) / (1000 * 3600 * 24));
  }

  // Subscription age (from first event)
  const { rows: firstEvent } = await client.query(
    `SELECT occurred_at FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2
     ORDER BY occurred_at ASC LIMIT 1`,
    [event.user_id, event.merchant_id]
  );

  if (firstEvent.length > 0) {
    const firstEventDate = new Date(firstEvent[0].occurred_at);
    features.plan_age_days = Math.floor((now.getTime() - firstEventDate.getTime()) / (1000 * 3600 * 24));
  }

  // Subscription changes (plan upgrades/downgrades)
  const { rows: changeStats } = await client.query(
    `SELECT COUNT(*) as change_count FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2 AND event_type = 'plan_change'`,
    [event.user_id, event.merchant_id]
  );

  if (changeStats.length > 0) {
    features.subscription_changes_count = parseInt(changeStats[0].change_count || '0', 10);
  }

  // Event metadata
  features.event_type = event.type;

  const { rows: recentEvents } = await client.query(
    `SELECT COUNT(*) as event_count FROM subscription_events_raw
     WHERE user_id = $1 AND merchant_id = $2 AND occurred_at >= $3`,
    [event.user_id, event.merchant_id, sevenDaysAgo.toISOString()]
  );

  if (recentEvents.length > 0) {
    features.event_count_7d = parseInt(recentEvents[0].event_count || '0', 10);
  }

  return features;
}

/**
 * Flatten features object into simple key-value pairs for JSONB storage
 * Ensures all values are numeric primitives for ML
 */
export function flattenFeatures(features: Features): Record<string, number> {
  const flattened: Record<string, number> = {};

  for (const [key, value] of Object.entries(features)) {
    if (typeof value === 'number') {
      flattened[key] = value;
    } else if (typeof value === 'string') {
      // One-hot encode string features
      flattened[`${key}_${value}`] = 1;
    } else if (typeof value === 'boolean') {
      flattened[key] = value ? 1 : 0;
    }
  }

  return flattened;
}

/**
 * Normalize features to [0, 1] range for better ML performance
 * This is a simple min-max scaling - in production use stored statistics
 */
export function normalizeFeatures(features: Record<string, number>): Record<string, number> {
  const normalized: Record<string, number> = {};

  // Define expected ranges for normalization (these should come from training data statistics)
  const ranges: Record<string, { min: number; max: number }> = {
    failed_payment_count_30d: { min: 0, max: 10 },
    successful_payment_count_30d: { min: 0, max: 30 },
    payment_success_rate: { min: 0, max: 1 },
    days_since_last_payment: { min: 0, max: 90 },
    login_count_7d: { min: 0, max: 50 },
    login_count_30d: { min: 0, max: 200 },
    days_since_last_login: { min: 0, max: 90 },
    plan_age_days: { min: 0, max: 730 },
    subscription_changes_count: { min: 0, max: 10 },
    event_count_7d: { min: 0, max: 100 },
  };

  for (const [key, value] of Object.entries(features)) {
    const range = ranges[key];
    if (range) {
      // Min-max normalization
      normalized[key] = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
    } else {
      // Pass through if no range defined
      normalized[key] = value;
    }
  }

  return normalized;
}
