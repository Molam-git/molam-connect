/**
 * Subscription Service - core subscription management logic
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { enqueueJob } from "../workers/jobQueue.js";

export interface CreateSubscriptionInput {
  idempotencyKey: string;
  merchantId: string;
  customerId: string;
  planId: string;
  quantity?: number;
  paymentMethodId?: string;
  billingCurrency?: string;
  trialDays?: number;
}

export interface ChangePlanInput {
  subscriptionId: string;
  newPlanId: string;
  quantity?: number;
  effective?: "now" | "period_end";
  idempotencyKey: string;
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<any> {
  const {
    idempotencyKey,
    merchantId,
    customerId,
    planId,
    quantity = 1,
    paymentMethodId,
    billingCurrency,
    trialDays,
  } = input;

  // Idempotency check
  const { rows: existed } = await pool.query(
    "SELECT * FROM subscriptions WHERE external_id = $1",
    [idempotencyKey]
  );
  if (existed.length) return existed[0];

  // Fetch plan
  const { rows: planRows } = await pool.query(
    "SELECT * FROM plans WHERE id = $1 AND active = true",
    [planId]
  );
  if (!planRows.length) throw new Error("plan_not_found");
  const plan = planRows[0];

  // Verify merchant owns plan
  if (plan.merchant_id !== merchantId) {
    throw new Error("plan_not_owned_by_merchant");
  }

  // Compute periods
  const now = new Date();
  let trialEnd: Date | null = null;
  let periodStart = now;
  let periodEnd = new Date(now);

  // Trial period
  if (trialDays || plan.trial_period_days) {
    const days = trialDays ?? plan.trial_period_days;
    trialEnd = new Date(now.getTime() + days * 24 * 3600 * 1000);
    periodStart = trialEnd;
  }

  // Calculate period end based on interval
  if (plan.interval === "monthly") {
    periodEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth() + plan.interval_count,
      periodStart.getDate()
    );
  } else if (plan.interval === "annual") {
    periodEnd = new Date(
      periodStart.getFullYear() + plan.interval_count,
      periodStart.getMonth(),
      periodStart.getDate()
    );
  } else if (plan.interval === "weekly") {
    periodEnd = new Date(periodStart.getTime() + plan.interval_count * 7 * 24 * 3600 * 1000);
  } else {
    // custom interval in days
    periodEnd = new Date(periodStart.getTime() + plan.interval_count * 24 * 3600 * 1000);
  }

  // Create subscription
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (
      external_id, merchant_id, customer_id, status,
      current_period_start, current_period_end, trial_end,
      billing_currency, default_payment_method_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      idempotencyKey,
      merchantId,
      customerId,
      trialEnd ? "trialing" : "active",
      periodStart,
      periodEnd,
      trialEnd,
      billingCurrency || plan.billing_currency,
      paymentMethodId || null,
    ]
  );

  const subscription = rows[0];

  // Add subscription item
  await pool.query(
    `INSERT INTO subscription_items (subscription_id, plan_id, quantity, unit_amount)
     VALUES ($1, $2, $3, $4)`,
    [subscription.id, plan.id, quantity, plan.amount]
  );

  // Log event
  await logSubscriptionEvent(subscription.id, "subscription.created", {
    merchant_id: merchantId,
    customer_id: customerId,
    plan_id: planId,
  });

  // Emit webhook
  await publishEvent("merchant", merchantId, "subscription.created", {
    subscription_id: subscription.id,
    customer_id: customerId,
  });

  // Schedule billing
  if (!trialEnd) {
    // No trial - generate invoice immediately
    await enqueueJob("subscription.generate_invoice", { subscriptionId: subscription.id });
  } else {
    // Schedule invoice generation at trial end
    await enqueueJob("subscription.schedule_invoice_at", {
      subscriptionId: subscription.id,
      runAt: trialEnd.toISOString(),
    });
  }

  return subscription;
}

export async function changePlan(input: ChangePlanInput): Promise<any> {
  const { subscriptionId, newPlanId, quantity = 1, effective = "now", idempotencyKey } = input;

  // Idempotency check via event
  const { rows: eventCheck } = await pool.query(
    "SELECT * FROM subscription_events WHERE subscription_id = $1 AND event_type = 'plan.changed' AND payload->>'idempotency_key' = $2",
    [subscriptionId, idempotencyKey]
  );
  if (eventCheck.length) {
    const { rows: sub } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
      subscriptionId,
    ]);
    return sub[0];
  }

  // Get current subscription
  const { rows: subRows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
    subscriptionId,
  ]);
  if (!subRows.length) throw new Error("subscription_not_found");
  const subscription = subRows[0];

  // Get new plan
  const { rows: planRows } = await pool.query(
    "SELECT * FROM plans WHERE id = $1 AND active = true",
    [newPlanId]
  );
  if (!planRows.length) throw new Error("plan_not_found");
  const newPlan = planRows[0];

  if (effective === "now") {
    // Apply proration
    const { rows: currentItems } = await pool.query(
      "SELECT si.*, p.* FROM subscription_items si JOIN plans p ON p.id = si.plan_id WHERE si.subscription_id = $1",
      [subscriptionId]
    );

    // Calculate proration credit/charge
    const now = new Date();
    const periodStart = new Date(subscription.current_period_start);
    const periodEnd = new Date(subscription.current_period_end);
    const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
    const remainingMs = periodEnd.getTime() - now.getTime();
    const usedMs = now.getTime() - periodStart.getTime();

    if (remainingMs > 0 && totalPeriodMs > 0) {
      const usedRatio = usedMs / totalPeriodMs;
      const remainingRatio = remainingMs / totalPeriodMs;

      // Credit for old plan unused portion
      const oldPlanAmount = currentItems.reduce(
        (sum: number, item: any) => sum + Number(item.amount) * Number(item.quantity),
        0
      );
      const credit = oldPlanAmount * remainingRatio;

      // Charge for new plan prorated
      const newCharge = Number(newPlan.amount) * quantity * remainingRatio;

      // Handle proration based on plan behavior
      if (newPlan.proration_behavior === "invoice_now") {
        // Create immediate proration invoice
        await enqueueJob("subscription.create_proration_invoice", {
          subscriptionId,
          credit,
          charge: newCharge,
          description: `Plan change from ${currentItems[0].name} to ${newPlan.name}`,
        });
      } else if (newPlan.proration_behavior === "credit") {
        // Apply credit to next invoice (store in metadata)
        await pool.query(
          "UPDATE subscriptions SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{proration_credit}', to_jsonb($1::numeric)) WHERE id = $2",
          [credit - newCharge, subscriptionId]
        );
      }
    }

    // Delete old items
    await pool.query("DELETE FROM subscription_items WHERE subscription_id = $1", [subscriptionId]);

    // Add new item
    await pool.query(
      "INSERT INTO subscription_items (subscription_id, plan_id, quantity, unit_amount) VALUES ($1, $2, $3, $4)",
      [subscriptionId, newPlan.id, quantity, newPlan.amount]
    );
  } else {
    // Schedule change at period end
    await pool.query(
      "UPDATE subscriptions SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{scheduled_plan_change}', to_jsonb($1::jsonb)) WHERE id = $2",
      [{ plan_id: newPlanId, quantity, effective_at: subscription.current_period_end }, subscriptionId]
    );
  }

  // Log event
  await logSubscriptionEvent(subscriptionId, "plan.changed", {
    new_plan_id: newPlanId,
    effective,
    idempotency_key: idempotencyKey,
  });

  // Emit webhook
  await publishEvent("merchant", subscription.merchant_id, "subscription.updated", {
    subscription_id: subscriptionId,
    changes: ["plan"],
  });

  const { rows: updated } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
    subscriptionId,
  ]);
  return updated[0];
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true,
  canceledBy?: string
): Promise<any> {
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId]);
  if (!rows.length) throw new Error("subscription_not_found");
  const subscription = rows[0];

  if (cancelAtPeriodEnd) {
    await pool.query(
      "UPDATE subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = $1",
      [subscriptionId]
    );

    await logSubscriptionEvent(subscriptionId, "subscription.cancel_scheduled", {
      cancel_at: subscription.current_period_end,
      canceled_by: canceledBy,
    });
  } else {
    // Cancel immediately
    await pool.query(
      "UPDATE subscriptions SET status = 'canceled', canceled_at = now(), updated_at = now() WHERE id = $1",
      [subscriptionId]
    );

    await logSubscriptionEvent(subscriptionId, "subscription.canceled", {
      canceled_by: canceledBy,
    });
  }

  await publishEvent("merchant", subscription.merchant_id, "subscription.canceled", {
    subscription_id: subscriptionId,
    cancel_at_period_end: cancelAtPeriodEnd,
  });

  const { rows: updated } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
    subscriptionId,
  ]);
  return updated[0];
}

export async function reactivateSubscription(subscriptionId: string): Promise<any> {
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId]);
  if (!rows.length) throw new Error("subscription_not_found");
  const subscription = rows[0];

  if (subscription.status !== "canceled" && !subscription.cancel_at_period_end) {
    throw new Error("subscription_not_canceled");
  }

  await pool.query(
    "UPDATE subscriptions SET status = 'active', cancel_at_period_end = false, canceled_at = null, updated_at = now() WHERE id = $1",
    [subscriptionId]
  );

  await logSubscriptionEvent(subscriptionId, "subscription.reactivated", {});

  await publishEvent("merchant", subscription.merchant_id, "subscription.updated", {
    subscription_id: subscriptionId,
    changes: ["status"],
  });

  const { rows: updated } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
    subscriptionId,
  ]);
  return updated[0];
}

export async function logSubscriptionEvent(
  subscriptionId: string,
  eventType: string,
  payload: any,
  actor?: string
): Promise<void> {
  await pool.query(
    "INSERT INTO subscription_events (subscription_id, event_type, actor, payload) VALUES ($1, $2, $3, $4)",
    [subscriptionId, eventType, actor || "system", payload]
  );
}
