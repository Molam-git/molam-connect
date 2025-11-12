/**
 * Dunning worker - handles failed payment retries
 */
import { pool } from "../utils/db.js";
import { publishEvent } from "../webhooks/publisher.js";
import { enqueueJob } from "./jobQueue.js";

export async function startDunningWorker(): Promise<void> {
  console.log("Dunning worker started");

  setInterval(async () => {
    await runDunning();
  }, 60000); // Run every minute
}

async function runDunning(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT si.*, s.merchant_id, s.customer_id
     FROM subscription_invoices si
     JOIN subscriptions s ON s.id = si.subscription_id
     WHERE si.status = 'failed'
       AND si.next_attempt_at <= now()
     LIMIT 100`
  );

  for (const invoice of rows) {
    try {
      await processDunning(invoice);
    } catch (err) {
      console.error(`Failed to process dunning for invoice ${invoice.id}:`, err);
    }
  }
}

async function processDunning(invoice: any): Promise<void> {
  // Get dunning policy for merchant
  const { rows: policyRows } = await pool.query(
    "SELECT * FROM dunning_policies WHERE merchant_id = $1 OR is_default = true ORDER BY is_default LIMIT 1",
    [invoice.merchant_id]
  );

  const policy = policyRows[0];
  if (!policy) {
    console.error(`No dunning policy found for merchant ${invoice.merchant_id}`);
    return;
  }

  const retries = policy.retries as any[];
  const attemptIndex = invoice.attempts;

  if (attemptIndex >= retries.length) {
    // Max retries reached - final action
    console.log(`Max retries reached for invoice ${invoice.id}, marking subscription past_due`);

    await pool.query("UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1", [
      invoice.subscription_id,
    ]);

    await pool.query(
      "UPDATE subscription_invoices SET status = 'voided', updated_at = now() WHERE id = $1",
      [invoice.id]
    );

    await publishEvent("merchant", invoice.merchant_id, "subscription.past_due", {
      subscription_id: invoice.subscription_id,
      invoice_id: invoice.invoice_id,
      reason: "max_dunning_retries_exceeded",
    });

    // Could auto-cancel here based on merchant policy
    const finalAction = retries[retries.length - 1]?.action;
    if (finalAction === "cancel") {
      await pool.query(
        "UPDATE subscriptions SET status = 'canceled', canceled_at = now() WHERE id = $1",
        [invoice.subscription_id]
      );

      await publishEvent("merchant", invoice.merchant_id, "subscription.canceled", {
        subscription_id: invoice.subscription_id,
        reason: "dunning_failed",
      });
    }

    return;
  }

  // Schedule next retry
  const retryConfig = retries[attemptIndex];
  const days = retryConfig.days || 1;
  const nextAttempt = new Date(Date.now() + days * 24 * 3600 * 1000);

  await pool.query(
    "UPDATE subscription_invoices SET next_attempt_at = $1, updated_at = now() WHERE id = $2",
    [nextAttempt, invoice.id]
  );

  // Send notification (email/SMS) based on policy actions
  if (policy.actions?.email_template) {
    console.log(`Sending dunning email for invoice ${invoice.id}`);
    // TODO: Integrate with email service
  }

  // Enqueue retry job
  await enqueueJob("subscription.attempt_collect", {
    subscriptionInvoiceId: invoice.id,
    billingInvoiceId: invoice.invoice_id,
    merchantId: invoice.merchant_id,
    customerId: invoice.customer_id,
  });

  console.log(
    `Scheduled retry ${attemptIndex + 1}/${retries.length} for invoice ${invoice.id} at ${nextAttempt.toISOString()}`
  );
}
