import { pool } from '../utils/db';

interface CreateSubscriptionPayload {
  merchantId: string;
  payload: {
    plan_id: string;
    customer_id?: string;
    billing_currency?: string;
    payment_method?: any;
    trial_end?: string;
    actor?: string;
  };
  idempotency: string;
}

interface ChangePlanOptions {
  effectiveImmediately?: boolean;
}

interface CancelOptions {
  cancel_at_period_end?: boolean;
  reason?: string;
}

interface UsageRecord {
  period_start: string;
  period_end: string;
  unit_count: number;
  description?: string;
  unit_price?: number;
}

/**
 * Create a new subscription for a merchant
 */
export async function createSubscriptionForMerchant({
  merchantId,
  payload,
  idempotency,
}: CreateSubscriptionPayload) {
  // Idempotency check
  const existing = await pool.query(
    `SELECT * FROM subscriptions WHERE metadata->>'idempotency' = $1`,
    [idempotency]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0];
  }

  // Load plan
  const { rows: planRows } = await pool.query(`SELECT * FROM plans WHERE id = $1`, [
    payload.plan_id,
  ]);

  if (planRows.length === 0) {
    throw new Error('plan_not_found');
  }

  const plan = planRows[0];

  if (!plan.is_active) {
    throw new Error('plan_inactive');
  }

  // Compute period dates
  const start = new Date();
  const periodEnd = new Date(start);

  // Calculate end date based on billing interval
  if (plan.billing_interval === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + (plan.interval_count || 1));
  } else if (plan.billing_interval === 'weekly') {
    periodEnd.setDate(periodEnd.getDate() + 7 * (plan.interval_count || 1));
  } else if (plan.billing_interval === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + (plan.interval_count || 1));
  }

  // Create plan snapshot
  const planSnapshot = {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    unit_amount: String(plan.unit_amount),
    billing_interval: plan.billing_interval,
    interval_count: plan.interval_count,
    currency: plan.currency,
    is_metered: plan.is_metered,
  };

  const billingCurrency = payload.billing_currency || plan.currency || 'USD';

  // Determine initial status
  const initialStatus = payload.trial_end ? 'trialing' : 'active';

  // Insert subscription
  const { rows } = await pool.query(
    `INSERT INTO subscriptions(
      merchant_id, customer_id, plan_id, plan_snapshot,
      status, current_period_start, current_period_end,
      trial_end, billing_currency, payment_method, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      merchantId,
      payload.customer_id || null,
      plan.id,
      JSON.stringify(planSnapshot),
      initialStatus,
      start,
      periodEnd,
      payload.trial_end || null,
      billingCurrency,
      payload.payment_method ? JSON.stringify(payload.payment_method) : null,
      JSON.stringify({ idempotency }),
    ]
  );

  const subscription = rows[0];

  // Create dunning record
  await pool.query(
    `INSERT INTO subscription_dunning(subscription_id, dunning_state, retry_schedule, max_attempts)
     VALUES ($1, 'ok', $2, $3)`,
    [subscription.id, JSON.stringify([3600, 21600, 86400, 259200]), 4]
  );

  // Log creation
  await pool.query(
    `INSERT INTO subscription_logs(subscription_id, actor, action, details)
     VALUES ($1, $2, 'created', $3)`,
    [subscription.id, payload.actor || null, JSON.stringify({ plan: plan.id })]
  );

  // Publish event (webhook integration point)
  await publishEvent('merchant', merchantId, 'subscription.created', {
    subscription_id: subscription.id,
    plan: planSnapshot,
  });

  return subscription;
}

/**
 * Change subscription plan
 */
export async function changePlan(
  subscriptionId: string,
  actor: string,
  newPlanId: string,
  opts: ChangePlanOptions
) {
  // Load subscription
  const { rows: subRows } = await pool.query(`SELECT * FROM subscriptions WHERE id = $1`, [
    subscriptionId,
  ]);

  if (subRows.length === 0) {
    throw new Error('subscription_not_found');
  }

  const sub = subRows[0];

  // Load new plan
  const { rows: planRows } = await pool.query(`SELECT * FROM plans WHERE id = $1`, [newPlanId]);

  if (planRows.length === 0) {
    throw new Error('plan_not_found');
  }

  const plan = planRows[0];

  if (opts.effectiveImmediately) {
    // Proration logic
    const now = new Date();
    const periodStart = new Date(sub.current_period_start);
    const periodEnd = new Date(sub.current_period_end);
    const totalMs = +periodEnd - +periodStart;
    const remainingMs = Math.max(0, +periodEnd - +now);
    const creditRatio = totalMs > 0 ? remainingMs / totalMs : 0;

    const oldPrice = Number(sub.plan_snapshot.unit_amount);
    const credit = Math.round(oldPrice * creditRatio * 100) / 100;

    const newUnit = Number(plan.unit_amount);
    const chargeAmount = Math.round(Math.max(0, newUnit - credit) * 100) / 100;

    // Update plan snapshot
    const planSnapshot = {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      unit_amount: String(plan.unit_amount),
      billing_interval: plan.billing_interval,
      interval_count: plan.interval_count,
      currency: plan.currency,
      is_metered: plan.is_metered,
    };

    await pool.query(
      `UPDATE subscriptions
       SET plan_id = $2, plan_snapshot = $3, updated_at = now()
       WHERE id = $1`,
      [subscriptionId, plan.id, JSON.stringify(planSnapshot)]
    );

    // Log change
    await pool.query(
      `INSERT INTO subscription_logs(subscription_id, actor, action, details)
       VALUES ($1, $2, 'plan_changed_immediate', $3)`,
      [
        subscriptionId,
        actor,
        JSON.stringify({ newPlan: plan.id, chargeAmount, credit }),
      ]
    );

    // Publish event for billing to create proration invoice
    await publishEvent('merchant', sub.merchant_id, 'subscription.plan_changed', {
      subscription_id: subscriptionId,
      new_plan_id: plan.id,
      charge_amount: chargeAmount,
      credit,
      immediate: true,
    });

    return { subscriptionId, chargeAmount, credit, immediate: true };
  } else {
    // Schedule for next period
    await pool.query(
      `INSERT INTO subscription_schedules(subscription_id, scheduled_action, scheduled_at, new_plan_id)
       VALUES ($1, 'plan_change', $2, $3)`,
      [subscriptionId, sub.current_period_end, plan.id]
    );

    await pool.query(
      `INSERT INTO subscription_logs(subscription_id, actor, action, details)
       VALUES ($1, $2, 'plan_change_scheduled', $3)`,
      [subscriptionId, actor, JSON.stringify({ newPlan: plan.id })]
    );

    return { subscriptionId, scheduled: true, effective_at: sub.current_period_end };
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  actor: string,
  opts: CancelOptions
) {
  const cancelAtPeriodEnd = opts.cancel_at_period_end ?? true;
  const now = new Date();

  const { rows } = await pool.query(
    `UPDATE subscriptions
     SET cancel_at_period_end = $2,
         canceled_at = CASE WHEN $2 = false THEN $3 ELSE canceled_at END,
         status = CASE WHEN $2 = false THEN 'canceled' ELSE status END,
         cancel_reason = $4,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [subscriptionId, cancelAtPeriodEnd, now, opts.reason || null]
  );

  if (rows.length === 0) {
    throw new Error('subscription_not_found');
  }

  const sub = rows[0];

  await pool.query(
    `INSERT INTO subscription_logs(subscription_id, actor, action, details)
     VALUES ($1, $2, 'cancel', $3)`,
    [subscriptionId, actor, JSON.stringify(opts)]
  );

  await publishEvent('merchant', sub.merchant_id, 'subscription.canceled', {
    subscription_id: subscriptionId,
    cancel_at_period_end: cancelAtPeriodEnd,
    immediate: !cancelAtPeriodEnd,
  });

  return sub;
}

/**
 * Record usage for metered billing
 */
export async function recordUsage(subscriptionId: string, usage: UsageRecord) {
  // Verify subscription exists and is metered
  const { rows: subRows } = await pool.query(
    `SELECT * FROM subscriptions WHERE id = $1`,
    [subscriptionId]
  );

  if (subRows.length === 0) {
    throw new Error('subscription_not_found');
  }

  const sub = subRows[0];
  const planSnapshot = sub.plan_snapshot;

  if (!planSnapshot.is_metered) {
    throw new Error('subscription_not_metered');
  }

  // Insert usage record
  const { rows } = await pool.query(
    `INSERT INTO usage_records(subscription_id, period_start, period_end, unit_count, unit_price, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      subscriptionId,
      usage.period_start,
      usage.period_end,
      usage.unit_count,
      usage.unit_price || null,
      usage.description || null,
    ]
  );

  return rows[0];
}

/**
 * Get subscription by ID
 */
export async function getSubscriptionById(subscriptionId: string) {
  const { rows } = await pool.query(`SELECT * FROM subscriptions WHERE id = $1`, [
    subscriptionId,
  ]);

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

/**
 * List subscriptions for merchant
 */
export async function listSubscriptionsByMerchant(
  merchantId: string,
  filters?: {
    status?: string;
    customer_id?: string;
    limit?: number;
    offset?: number;
  }
) {
  let query = `SELECT * FROM subscriptions WHERE merchant_id = $1`;
  const params: any[] = [merchantId];
  let paramIndex = 2;

  if (filters?.status) {
    query += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.customer_id) {
    query += ` AND customer_id = $${paramIndex}`;
    params.push(filters.customer_id);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;

  if (filters?.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(filters.limit);
    paramIndex++;
  }

  if (filters?.offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(filters.offset);
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get subscription statistics for merchant
 */
export async function getSubscriptionStats(merchantId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM merchant_subscription_stats WHERE merchant_id = $1`,
    [merchantId]
  );

  if (rows.length === 0) {
    return {
      total_subscriptions: 0,
      active_count: 0,
      trial_count: 0,
      past_due_count: 0,
      canceled_count: 0,
      mrr_total: 0,
    };
  }

  return rows[0];
}

/**
 * Publish event (webhook integration point)
 * In production, this would publish to message queue (Kafka)
 */
async function publishEvent(
  target: string,
  targetId: string,
  eventType: string,
  data: any
) {
  console.log(`[EVENT] ${target}:${targetId} -> ${eventType}`, data);

  // In production: publish to Kafka/Redis/webhook queue
  // await kafka.send({
  //   topic: 'subscription.events',
  //   messages: [{ key: targetId, value: JSON.stringify({ eventType, data }) }]
  // });
}