/**
 * Subscription billing worker
 * Processes invoice generation and collection jobs
 */
import { pool } from "../utils/db.js";
import { createInvoiceForSubscription, collectInvoice } from "../billing/integrations.js";
import { publishEvent } from "../webhooks/publisher.js";
import { pickSiraScore } from "../services/sira.js";
import { getReadyJobs, markJobCompleted, markJobFailed, enqueueJob } from "./jobQueue.js";

export async function startSubscriptionWorker(): Promise<void> {
  console.log("Subscription billing worker started");

  setInterval(async () => {
    const jobs = getReadyJobs();
    for (const job of jobs) {
      if (job.type === "subscription.generate_invoice") {
        try {
          await processGenerateInvoice(job.data);
          markJobCompleted(job.id);
        } catch (err) {
          console.error("Failed to process invoice generation:", err);
          markJobFailed(job.id);
        }
      } else if (job.type === "subscription.attempt_collect") {
        try {
          await processAttemptCollect(job.data);
          markJobCompleted(job.id);
        } catch (err) {
          console.error("Failed to attempt collection:", err);
          markJobFailed(job.id);
        }
      } else if (job.type === "subscription.schedule_invoice_at") {
        // This job type waits for runAt - handled by queue filter
        try {
          await processGenerateInvoice(job.data);
          markJobCompleted(job.id);
        } catch (err) {
          console.error("Failed to process scheduled invoice:", err);
          markJobFailed(job.id);
        }
      } else if (job.type === "subscription.bump_period") {
        try {
          await bumpSubscriptionPeriod(job.data.subscriptionId);
          markJobCompleted(job.id);
        } catch (err) {
          console.error("Failed to bump subscription period:", err);
          markJobFailed(job.id);
        }
      }
    }
  }, 5000); // Process every 5 seconds
}

async function processGenerateInvoice(jobData: { subscriptionId: string }): Promise<void> {
  const { subscriptionId } = jobData;

  const { rows: subRows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [
    subscriptionId,
  ]);
  if (!subRows.length) throw new Error("subscription_not_found");
  const subscription = subRows[0];

  // Build invoice lines from subscription_items
  const { rows: items } = await pool.query(
    `SELECT si.*, p.* FROM subscription_items si
     JOIN plans p ON p.id = si.plan_id
     WHERE si.subscription_id = $1`,
    [subscriptionId]
  );

  let total = 0;
  const lines = items.map((item: any) => {
    const amount = Number(item.unit_amount) * Number(item.quantity);
    total += amount;
    return {
      description: item.name || "Subscription charge",
      amount,
      currency: item.billing_currency || subscription.billing_currency,
      quantity: item.quantity,
    };
  });

  // Apply proration credit if exists
  const prorationCredit = subscription.metadata?.proration_credit;
  if (prorationCredit && Number(prorationCredit) !== 0) {
    lines.push({
      description: "Proration credit",
      amount: -Math.abs(Number(prorationCredit)),
      currency: subscription.billing_currency,
      quantity: 1,
    });
    total -= Math.abs(Number(prorationCredit));

    // Clear the credit
    await pool.query(
      "UPDATE subscriptions SET metadata = metadata - 'proration_credit' WHERE id = $1",
      [subscriptionId]
    );
  }

  // Create billing invoice via B46
  const billingInvoice = await createInvoiceForSubscription({
    subscriptionId,
    merchantId: subscription.merchant_id,
    customerId: subscription.customer_id,
    lines,
    currency: subscription.billing_currency,
    periodStart: new Date(subscription.current_period_start),
    periodEnd: new Date(subscription.current_period_end),
  });

  // Insert subscription_invoices record
  const { rows } = await pool.query(
    `INSERT INTO subscription_invoices (
      subscription_id, invoice_id, period_start, period_end,
      amount_due, currency, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [
      subscriptionId,
      billingInvoice.id,
      subscription.current_period_start,
      subscription.current_period_end,
      total,
      subscription.billing_currency,
    ]
  );

  const subscriptionInvoice = rows[0];

  // Emit event
  await publishEvent("merchant", subscription.merchant_id, "invoice.generated", {
    subscription_id: subscriptionId,
    invoice_id: billingInvoice.id,
  });

  // Attempt collection
  await attemptCollectInvoice(
    subscriptionInvoice.id,
    billingInvoice.id,
    subscription.merchant_id,
    subscription.customer_id,
    subscription.default_payment_method_id
  );
}

async function attemptCollectInvoice(
  subscriptionInvoiceId: string,
  billingInvoiceId: string,
  merchantId: string,
  customerId: string,
  paymentMethodId?: string
): Promise<void> {
  // Get SIRA score before attempting collection
  const siraScore = await pickSiraScore(customerId, {
    type: "subscription_payment",
    invoice_id: billingInvoiceId,
  });

  if (siraScore.risk_level === "high") {
    console.warn(`High risk subscription payment detected: ${siraScore.score}`);
    // Could require ops approval here
  }

  try {
    const result = await collectInvoice(billingInvoiceId, paymentMethodId);

    if (result.status === "paid" || result.status === "succeeded") {
      // Success
      await pool.query(
        "UPDATE subscription_invoices SET status = 'succeeded', updated_at = now() WHERE id = $1",
        [subscriptionInvoiceId]
      );

      await publishEvent("merchant", merchantId, "invoice.payment_succeeded", {
        invoice_id: billingInvoiceId,
        subscription_invoice_id: subscriptionInvoiceId,
      });

      // Get subscription ID
      const { rows } = await pool.query(
        "SELECT subscription_id FROM subscription_invoices WHERE id = $1",
        [subscriptionInvoiceId]
      );
      if (rows.length) {
        await enqueueJob("subscription.bump_period", { subscriptionId: rows[0].subscription_id });
      }
    } else {
      // Failed
      throw new Error("Payment failed");
    }
  } catch (err) {
    console.error("Collection failed:", err);

    await pool.query(
      `UPDATE subscription_invoices SET
        status = 'failed',
        attempts = attempts + 1,
        last_attempt_at = now(),
        next_attempt_at = now() + interval '1 day'
       WHERE id = $1`,
      [subscriptionInvoiceId]
    );

    await publishEvent("merchant", merchantId, "invoice.payment_failed", {
      invoice_id: billingInvoiceId,
      subscription_invoice_id: subscriptionInvoiceId,
    });
  }
}

async function processAttemptCollect(jobData: {
  subscriptionInvoiceId: string;
  billingInvoiceId: string;
  merchantId: string;
  customerId: string;
  paymentMethodId?: string;
}): Promise<void> {
  await attemptCollectInvoice(
    jobData.subscriptionInvoiceId,
    jobData.billingInvoiceId,
    jobData.merchantId,
    jobData.customerId,
    jobData.paymentMethodId
  );
}

async function bumpSubscriptionPeriod(subscriptionId: string): Promise<void> {
  const { rows } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId]);
  if (!rows.length) return;

  const subscription = rows[0];

  // Get associated plan to determine interval
  const { rows: items } = await pool.query(
    `SELECT p.* FROM subscription_items si
     JOIN plans p ON p.id = si.plan_id
     WHERE si.subscription_id = $1
     LIMIT 1`,
    [subscriptionId]
  );

  if (!items.length) return;
  const plan = items[0];

  const start = new Date(subscription.current_period_end);
  let end: Date;

  if (plan.interval === "monthly") {
    end = new Date(start.getFullYear(), start.getMonth() + plan.interval_count, start.getDate());
  } else if (plan.interval === "annual") {
    end = new Date(start.getFullYear() + plan.interval_count, start.getMonth(), start.getDate());
  } else if (plan.interval === "weekly") {
    end = new Date(start.getTime() + plan.interval_count * 7 * 24 * 3600 * 1000);
  } else {
    end = new Date(start.getTime() + plan.interval_count * 24 * 3600 * 1000);
  }

  await pool.query(
    "UPDATE subscriptions SET current_period_start = $1, current_period_end = $2, updated_at = now() WHERE id = $3",
    [start, end, subscriptionId]
  );

  // Check if subscription should be canceled at period end
  if (subscription.cancel_at_period_end) {
    await pool.query(
      "UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = $1",
      [subscriptionId]
    );
    return;
  }

  // Schedule next invoice
  await enqueueJob("subscription.generate_invoice", { subscriptionId });
}
