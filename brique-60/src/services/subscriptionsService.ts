import { pool } from '../utils/db';

export interface Plan {
  id: string;
  merchant_id: string;
  sku: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  frequency: string;
  trial_days: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  merchant_id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  trial_end: Date | null;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePlanInput {
  merchant_id: string;
  sku: string;
  name: string;
  amount: number;
  currency: string;
  frequency: string;
  trial_days?: number;
  description?: string;
}

export interface CreateSubscriptionInput {
  merchant_id: string;
  customer_id: string;
  plan_id: string;
  quantity?: number;
  start_now?: boolean;
}

/**
 * Create a new plan
 */
export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Plan>(
      `INSERT INTO plans (merchant_id, sku, name, description, amount, currency, frequency, trial_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (merchant_id, sku) DO UPDATE SET
         name = EXCLUDED.name,
         amount = EXCLUDED.amount,
         updated_at = NOW()
       RETURNING *`,
      [
        input.merchant_id,
        input.sku,
        input.name,
        input.description || null,
        input.amount,
        input.currency,
        input.frequency,
        input.trial_days || 0,
      ]
    );

    const plan = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      ['plan', plan.id, 'created', input.merchant_id, JSON.stringify(input)]
    );

    await client.query('COMMIT');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List plans for a merchant
 */
export async function listPlans(merchantId: string): Promise<Plan[]> {
  const { rows } = await pool.query<Plan>(
    `SELECT * FROM plans
     WHERE merchant_id = $1 AND status = 'active'
     ORDER BY created_at DESC`,
    [merchantId]
  );
  return rows;
}

/**
 * Get a specific plan
 */
export async function getPlan(planId: string): Promise<Plan | null> {
  const { rows } = await pool.query<Plan>('SELECT * FROM plans WHERE id = $1', [planId]);
  return rows[0] || null;
}

/**
 * Create a new subscription
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get plan details
    const { rows: planRows } = await client.query('SELECT * FROM plans WHERE id = $1', [input.plan_id]);
    if (planRows.length === 0) {
      throw new Error('Plan not found');
    }
    const plan = planRows[0];

    // Calculate period
    const now = new Date();
    const trialDays = plan.trial_days || 0;
    const trialEnd = trialDays > 0 ? new Date(now.getTime() + trialDays * 24 * 3600 * 1000) : null;
    const status = trialEnd ? 'trialing' : 'active';

    // Calculate period end based on frequency
    const periodEnd = calculatePeriodEnd(now, plan.frequency);

    const { rows } = await client.query<Subscription>(
      `INSERT INTO subscriptions (
        merchant_id, customer_id, plan_id, status,
        current_period_start, current_period_end, trial_end, quantity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [input.merchant_id, input.customer_id, input.plan_id, status, now, periodEnd, trialEnd, input.quantity || 1]
    );

    const subscription = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      ['subscription', subscription.id, 'created', input.merchant_id, JSON.stringify(input)]
    );

    await client.query('COMMIT');
    return subscription;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * List subscriptions for a merchant
 */
export async function listSubscriptions(merchantId: string): Promise<Subscription[]> {
  const { rows } = await pool.query<Subscription>(
    `SELECT * FROM subscriptions
     WHERE merchant_id = $1
     ORDER BY created_at DESC`,
    [merchantId]
  );
  return rows;
}

/**
 * Get a specific subscription
 */
export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const { rows } = await pool.query<Subscription>('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
  return rows[0] || null;
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false,
  reason?: string
): Promise<Subscription> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<Subscription>(
      `UPDATE subscriptions
       SET status = CASE
                      WHEN $2 = true THEN 'cancelled'
                      ELSE status
                    END,
           cancel_at_period_end = CASE
                                    WHEN $2 = false THEN true
                                    ELSE cancel_at_period_end
                                  END,
           cancel_at = CASE
                         WHEN $2 = true THEN NOW()
                         ELSE current_period_end
                       END,
           cancel_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [subscriptionId, immediately, reason]
    );

    const subscription = rows[0];

    // Audit log
    await client.query(
      `INSERT INTO molam_audit_logs (entity_type, entity_id, action, actor_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      ['subscription', subscriptionId, 'cancelled', 'system', JSON.stringify({ immediately, reason })]
    );

    await client.query('COMMIT');
    return subscription;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Helper: Calculate period end based on frequency
 */
function calculatePeriodEnd(start: Date, frequency: string): Date {
  const end = new Date(start);
  switch (frequency) {
    case 'daily':
      end.setDate(end.getDate() + 1);
      break;
    case 'weekly':
      end.setDate(end.getDate() + 7);
      break;
    case 'monthly':
      end.setMonth(end.getMonth() + 1);
      break;
    case 'yearly':
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 1); // default to monthly
  }
  return end;
}
