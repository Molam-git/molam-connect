import { pool } from '../db/pool';
import { addDays, addMonths, addWeeks, addYears } from 'date-fns';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionInvoice,
  Coupon,
} from '../types/marketing';

/**
 * Create a new subscription for a customer
 */
export async function createSubscription(params: {
  planId: string;
  customerId: string;
  merchantId: string;
  couponId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, any>;
}): Promise<Subscription> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get plan details
    const planResult = await client.query<SubscriptionPlan>(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [params.planId]
    );

    if (planResult.rows.length === 0) {
      throw new Error('Subscription plan not found or inactive');
    }

    const plan = planResult.rows[0];

    // Verify merchant
    if (plan.merchant_id !== params.merchantId) {
      throw new Error('Plan does not belong to this merchant');
    }

    // Calculate trial and billing periods
    const now = new Date();
    let trialStart: Date | undefined;
    let trialEnd: Date | undefined;
    let currentPeriodStart: Date;
    let currentPeriodEnd: Date;
    let status: Subscription['status'] = 'active';

    if (plan.trial_period_days > 0) {
      trialStart = now;
      trialEnd = addDays(now, plan.trial_period_days);
      currentPeriodStart = trialEnd;
      status = 'trialing';
    } else {
      currentPeriodStart = now;
    }

    // Calculate first period end based on interval
    currentPeriodEnd = calculateNextPeriodEnd(currentPeriodStart, plan);

    // Validate coupon if provided
    let coupon: Coupon | undefined;
    let discountEndAt: Date | undefined;

    if (params.couponId) {
      const couponResult = await client.query<Coupon>(
        'SELECT * FROM coupons WHERE id = $1 AND is_active = true',
        [params.couponId]
      );

      if (couponResult.rows.length === 0) {
        throw new Error('Coupon not found or inactive');
      }

      coupon = couponResult.rows[0];

      // Calculate discount end date
      if (coupon.duration === 'once') {
        discountEndAt = currentPeriodEnd;
      } else if (coupon.duration === 'repeating' && coupon.duration_months) {
        discountEndAt = addMonths(currentPeriodStart, coupon.duration_months);
      }
      // For 'forever', discountEndAt remains undefined
    }

    // Create subscription
    const subscriptionResult = await client.query<Subscription>(
      `INSERT INTO subscriptions (
        plan_id, customer_id, merchant_id, status,
        current_period_start, current_period_end,
        trial_start, trial_end,
        default_payment_method_id, coupon_id, discount_end_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        params.planId,
        params.customerId,
        params.merchantId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        trialStart,
        trialEnd,
        params.paymentMethodId,
        params.couponId,
        discountEndAt,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );

    await client.query('COMMIT');
    return subscriptionResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating subscription:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate the next period end date based on plan interval
 */
function calculateNextPeriodEnd(startDate: Date, plan: SubscriptionPlan): Date {
  switch (plan.interval) {
    case 'day':
      return addDays(startDate, plan.interval_count);
    case 'week':
      return addWeeks(startDate, plan.interval_count);
    case 'month':
      return addMonths(startDate, plan.interval_count);
    case 'year':
      return addYears(startDate, plan.interval_count);
    default:
      throw new Error(`Invalid interval: ${plan.interval}`);
  }
}

/**
 * Create an invoice for a subscription
 */
export async function createSubscriptionInvoice(
  subscriptionId: string
): Promise<SubscriptionInvoice> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get subscription with plan and coupon
    const subResult = await client.query(
      `SELECT
        s.*,
        sp.amount as plan_amount,
        sp.currency as plan_currency,
        c.discount_type as coupon_discount_type,
        c.discount_value as coupon_discount_value
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN coupons c ON c.id = s.coupon_id
      WHERE s.id = $1`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    const subscription = subResult.rows[0];
    const baseAmount = parseFloat(subscription.plan_amount);
    let discountAmount = 0;

    // Apply coupon discount if active
    if (
      subscription.coupon_id &&
      (!subscription.discount_end_at ||
        new Date(subscription.discount_end_at) > new Date())
    ) {
      if (subscription.coupon_discount_type === 'percentage') {
        discountAmount = (baseAmount * subscription.coupon_discount_value) / 100;
      } else if (subscription.coupon_discount_type === 'fixed') {
        discountAmount = subscription.coupon_discount_value;
      }
    }

    const taxAmount = 0; // Tax calculation would be integrated here
    const totalAmount = baseAmount - discountAmount + taxAmount;

    // Create invoice
    const invoiceResult = await client.query<SubscriptionInvoice>(
      `INSERT INTO subscription_invoices (
        subscription_id, customer_id,
        amount, currency, discount_amount, tax_amount, total_amount,
        period_start, period_end, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
      RETURNING *`,
      [
        subscriptionId,
        subscription.customer_id,
        baseAmount,
        subscription.plan_currency,
        discountAmount,
        taxAmount,
        totalAmount,
        subscription.current_period_start,
        subscription.current_period_end,
      ]
    );

    const invoice = invoiceResult.rows[0];

    // Update subscription with latest invoice
    await client.query(
      'UPDATE subscriptions SET latest_invoice_id = $1, updated_at = now() WHERE id = $2',
      [invoice.id, subscriptionId]
    );

    await client.query('COMMIT');
    return invoice;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating invoice:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Renew a subscription (move to next billing period)
 */
export async function renewSubscription(subscriptionId: string): Promise<Subscription> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get subscription and plan
    const subResult = await client.query(
      `SELECT s.*, sp.* as plan
      FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.id = $1`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      throw new Error('Subscription not found');
    }

    const subscription = subResult.rows[0];
    const plan = subscription.plan;

    // Calculate new period
    const newPeriodStart = subscription.current_period_end;
    const newPeriodEnd = calculateNextPeriodEnd(newPeriodStart, plan);

    // Update subscription
    const updatedResult = await client.query<Subscription>(
      `UPDATE subscriptions SET
        current_period_start = $1,
        current_period_end = $2,
        status = 'active',
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [newPeriodStart, newPeriodEnd, subscriptionId]
    );

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error renewing subscription:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true,
  reason?: string
): Promise<Subscription> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const now = new Date();

    if (cancelAtPeriodEnd) {
      // Cancel at period end - subscription remains active until then
      const result = await client.query<Subscription>(
        `UPDATE subscriptions SET
          cancel_at_period_end = true,
          canceled_at = $1,
          cancellation_reason = $2,
          updated_at = now()
        WHERE id = $3
        RETURNING *`,
        [now, reason, subscriptionId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } else {
      // Cancel immediately
      const result = await client.query<Subscription>(
        `UPDATE subscriptions SET
          status = 'canceled',
          cancel_at_period_end = false,
          canceled_at = $1,
          cancellation_reason = $2,
          updated_at = now()
        WHERE id = $3
        RETURNING *`,
        [now, reason, subscriptionId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error canceling subscription:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription(
  subscriptionId: string
): Promise<Subscription> {
  const result = await pool.query<Subscription>(
    `UPDATE subscriptions SET
      status = 'active',
      cancel_at_period_end = false,
      canceled_at = NULL,
      cancellation_reason = NULL,
      updated_at = now()
    WHERE id = $1 AND status = 'canceled'
    RETURNING *`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    throw new Error('Subscription not found or not canceled');
  }

  return result.rows[0];
}

/**
 * Get subscriptions due for renewal
 */
export async function getSubscriptionsDueForRenewal(
  lookAheadHours: number = 24
): Promise<Subscription[]> {
  const lookAheadDate = addDays(new Date(), lookAheadHours / 24);

  const result = await pool.query<Subscription>(
    `SELECT * FROM subscriptions
    WHERE status IN ('active', 'trialing')
    AND current_period_end <= $1
    AND cancel_at_period_end = false
    ORDER BY current_period_end ASC`,
    [lookAheadDate]
  );

  return result.rows;
}

/**
 * Mark invoice as paid
 */
export async function markInvoicePaid(
  invoiceId: string,
  paymentIntentId: string
): Promise<SubscriptionInvoice> {
  const result = await pool.query<SubscriptionInvoice>(
    `UPDATE subscription_invoices SET
      status = 'paid',
      paid_at = now(),
      payment_intent_id = $1,
      updated_at = now()
    WHERE id = $2
    RETURNING *`,
    [paymentIntentId, invoiceId]
  );

  if (result.rows.length === 0) {
    throw new Error('Invoice not found');
  }

  return result.rows[0];
}

/**
 * Handle failed invoice payment
 */
export async function handleFailedInvoicePayment(
  invoiceId: string,
  maxAttempts: number = 3,
  retryDelayHours: number = 24
): Promise<SubscriptionInvoice> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get invoice
    const invoiceResult = await client.query(
      'SELECT * FROM subscription_invoices WHERE id = $1',
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoiceResult.rows[0];
    const newAttemptCount = invoice.attempt_count + 1;

    let newStatus = 'open';
    let nextAttemptAt: Date | null = null;

    if (newAttemptCount >= maxAttempts) {
      newStatus = 'uncollectible';
      // Mark subscription as past_due
      await client.query(
        'UPDATE subscriptions SET status = $1, updated_at = now() WHERE id = $2',
        ['past_due', invoice.subscription_id]
      );
    } else {
      nextAttemptAt = addDays(new Date(), retryDelayHours / 24);
    }

    // Update invoice
    const updatedInvoice = await client.query<SubscriptionInvoice>(
      `UPDATE subscription_invoices SET
        attempt_count = $1,
        next_attempt_at = $2,
        status = $3,
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [newAttemptCount, nextAttemptAt, newStatus, invoiceId]
    );

    await client.query('COMMIT');
    return updatedInvoice.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error handling failed payment:', error);
    throw error;
  } finally {
    client.release();
  }
}
