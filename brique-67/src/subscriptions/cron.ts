import { pool } from '../utils/db';

/**
 * Process subscriptions that are due for billing
 * Runs periodically (e.g., every 5 minutes or daily cron)
 */
export async function processDueSubscriptions() {
  console.log('[CRON] Processing due subscriptions...');

  try {
    // Find subscriptions with current_period_end <= now and status active/trialing
    const { rows: subscriptions } = await pool.query(
      `SELECT * FROM subscriptions
       WHERE current_period_end <= now()
         AND status IN ('active', 'trialing')
       ORDER BY current_period_end ASC
       LIMIT 100`
    );

    console.log(`[CRON] Found ${subscriptions.length} due subscriptions`);

    for (const sub of subscriptions) {
      try {
        await processSubscriptionRenewal(sub);
      } catch (err: any) {
        console.error(`[CRON] Error processing subscription ${sub.id}:`, err);

        // Log error event
        await pool.query(
          `INSERT INTO subscription_logs(subscription_id, actor, action, details)
           VALUES ($1, 'system', 'renewal_error', $2)`,
          [sub.id, JSON.stringify({ error: err.message })]
        );

        // Publish error event for ops monitoring
        await publishEvent('ops', 'billing', 'subscription.process_error', {
          subscription_id: sub.id,
          error: err.message,
        });
      }
    }

    console.log('[CRON] Finished processing due subscriptions');
  } catch (err: any) {
    console.error('[CRON] Fatal error in processDueSubscriptions:', err);
  }
}

/**
 * Process individual subscription renewal
 */
async function processSubscriptionRenewal(sub: any) {
  console.log(`[CRON] Processing renewal for subscription ${sub.id}`);

  // 1. Check if subscription should be canceled
  if (sub.cancel_at_period_end) {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'canceled', canceled_at = now(), updated_at = now()
       WHERE id = $1`,
      [sub.id]
    );

    await pool.query(
      `INSERT INTO subscription_logs(subscription_id, actor, action, details)
       VALUES ($1, 'system', 'canceled_at_period_end', '{}')`,
      [sub.id]
    );

    await publishEvent('merchant', sub.merchant_id, 'subscription.canceled', {
      subscription_id: sub.id,
      reason: 'end_of_period',
    });

    console.log(`[CRON] Canceled subscription ${sub.id} at period end`);
    return;
  }

  // 2. Check for scheduled plan changes
  await applyScheduledChanges(sub);

  // 3. Collect usage records for metered plans
  const usageRows = await collectUsageForPeriod(sub);

  // 4. Generate invoice (integration point with Billing B46)
  const invoiceResult = await generateInvoiceForSubscription(sub, usageRows);

  // 5. Mark usage as posted
  if (usageRows.length > 0) {
    await pool.query(
      `UPDATE usage_records
       SET posted = true, posted_at = now()
       WHERE subscription_id = $1
         AND period_start = $2
         AND period_end = $3
         AND posted = false`,
      [
        sub.id,
        formatDate(sub.current_period_start),
        formatDate(sub.current_period_end),
      ]
    );
  }

  // 6. Publish invoice generated event
  await publishEvent('merchant', sub.merchant_id, 'subscription.invoice_generated', {
    subscription_id: sub.id,
    invoice_id: invoiceResult.invoice_id,
    amount: invoiceResult.amount,
  });

  // 7. Attempt payment collection (integration point with Billing)
  const collectionResult = await attemptCollection(sub, invoiceResult);

  if (collectionResult.success) {
    // 8. Advance subscription to next period
    await advanceSubscriptionPeriod(sub);

    await pool.query(
      `INSERT INTO subscription_logs(subscription_id, actor, action, details)
       VALUES ($1, 'system', 'renewed', $2)`,
      [
        sub.id,
        JSON.stringify({
          invoice_id: invoiceResult.invoice_id,
          amount: invoiceResult.amount,
        }),
      ]
    );

    await publishEvent('merchant', sub.merchant_id, 'subscription.renewed', {
      subscription_id: sub.id,
      new_period_start: sub.current_period_end,
    });

    console.log(`[CRON] Successfully renewed subscription ${sub.id}`);
  } else {
    // Payment failed - initiate dunning
    await initiateDunning(sub, collectionResult.error || 'unknown_error');
    console.log(`[CRON] Payment failed for subscription ${sub.id}, dunning initiated`);
  }
}

/**
 * Apply any scheduled changes (plan changes, price changes)
 */
async function applyScheduledChanges(sub: any) {
  const { rows: schedules } = await pool.query(
    `SELECT * FROM subscription_schedules
     WHERE subscription_id = $1
       AND executed = false
       AND scheduled_at <= now()
     ORDER BY scheduled_at ASC`,
    [sub.id]
  );

  for (const schedule of schedules) {
    if (schedule.scheduled_action === 'plan_change' && schedule.new_plan_id) {
      // Load new plan
      const { rows: planRows } = await pool.query(`SELECT * FROM plans WHERE id = $1`, [
        schedule.new_plan_id,
      ]);

      if (planRows.length > 0) {
        const plan = planRows[0];
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
          [sub.id, plan.id, JSON.stringify(planSnapshot)]
        );

        console.log(`[CRON] Applied scheduled plan change for subscription ${sub.id}`);
      }
    }

    // Mark schedule as executed
    await pool.query(
      `UPDATE subscription_schedules
       SET executed = true, executed_at = now()
       WHERE id = $1`,
      [schedule.id]
    );
  }
}

/**
 * Collect usage records for the billing period
 */
async function collectUsageForPeriod(sub: any) {
  const { rows } = await pool.query(
    `SELECT * FROM usage_records
     WHERE subscription_id = $1
       AND period_start >= $2
       AND period_end <= $3
       AND posted = false`,
    [sub.id, formatDate(sub.current_period_start), formatDate(sub.current_period_end)]
  );

  return rows;
}

/**
 * Generate invoice for subscription (integration with Billing B46)
 */
async function generateInvoiceForSubscription(sub: any, usageRows: any[]) {
  // In production: call Billing module API
  // For now, we'll create a simple invoice record

  const planAmount = Number(sub.plan_snapshot.unit_amount);

  // Calculate usage amount for metered plans
  let usageAmount = 0;
  for (const usage of usageRows) {
    const unitPrice = usage.unit_price || 0;
    usageAmount += Number(usage.unit_count) * unitPrice;
  }

  const totalAmount = planAmount + usageAmount;

  // Create invoice ID (in production: call to billing module)
  const invoiceId = `inv_${Date.now()}_${sub.id.slice(0, 8)}`;

  // Link invoice to subscription
  await pool.query(
    `INSERT INTO subscription_invoices(
      subscription_id, invoice_id, amount, currency,
      billing_period_start, billing_period_end
    )
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sub.id,
      invoiceId,
      totalAmount,
      sub.billing_currency,
      sub.current_period_start,
      sub.current_period_end,
    ]
  );

  return {
    invoice_id: invoiceId,
    amount: totalAmount,
    currency: sub.billing_currency,
    line_items: [
      { description: `${sub.plan_snapshot.name} subscription`, amount: planAmount },
      ...usageRows.map((u) => ({
        description: u.description || 'Usage charges',
        amount: Number(u.unit_count) * (u.unit_price || 0),
      })),
    ],
  };
}

/**
 * Attempt to collect payment (integration with Billing/Treasury)
 */
async function attemptCollection(_sub: any, _invoice: any) {
  // In production: call Billing module to charge payment method
  // This would trigger Treasury flows for actual payment processing

  // Simulate payment attempt
  const success = Math.random() > 0.1; // 90% success rate for demo

  if (success) {
    return { success: true };
  } else {
    return {
      success: false,
      error: 'payment_failed',
      details: 'Card declined',
    };
  }
}

/**
 * Advance subscription to next billing period
 */
async function advanceSubscriptionPeriod(sub: any) {
  const nextStart = new Date(sub.current_period_end);
  const nextEnd = new Date(nextStart);

  const interval = sub.plan_snapshot.billing_interval;
  const count = sub.plan_snapshot.interval_count || 1;

  if (interval === 'monthly') {
    nextEnd.setMonth(nextEnd.getMonth() + count);
  } else if (interval === 'weekly') {
    nextEnd.setDate(nextEnd.getDate() + 7 * count);
  } else if (interval === 'annual') {
    nextEnd.setFullYear(nextEnd.getFullYear() + count);
  }

  // If was trialing, move to active
  const newStatus = sub.status === 'trialing' ? 'active' : sub.status;

  await pool.query(
    `UPDATE subscriptions
     SET current_period_start = $1,
         current_period_end = $2,
         status = $3,
         updated_at = now()
     WHERE id = $4`,
    [nextStart, nextEnd, newStatus, sub.id]
  );
}

/**
 * Initiate dunning process for failed payment
 */
async function initiateDunning(sub: any, error: string) {
  // Get or create dunning record
  const { rows: dunningRows } = await pool.query(
    `SELECT * FROM subscription_dunning WHERE subscription_id = $1`,
    [sub.id]
  );

  let dunning;
  if (dunningRows.length === 0) {
    // Create dunning record
    const { rows } = await pool.query(
      `INSERT INTO subscription_dunning(
        subscription_id, dunning_state, attempts, retry_schedule, max_attempts, last_error
      )
      VALUES ($1, 'retrying', 1, $2, 4, $3)
      RETURNING *`,
      [sub.id, JSON.stringify([3600, 21600, 86400, 259200]), error]
    );
    dunning = rows[0];
  } else {
    dunning = dunningRows[0];
    const newAttempts = dunning.attempts + 1;

    if (newAttempts >= dunning.max_attempts) {
      // Suspend subscription
      await pool.query(
        `UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1`,
        [sub.id]
      );

      await pool.query(
        `UPDATE subscription_dunning
         SET dunning_state = 'suspended', attempts = $2, last_error = $3, updated_at = now()
         WHERE subscription_id = $1`,
        [sub.id, newAttempts, error]
      );

      await publishEvent('merchant', sub.merchant_id, 'subscription.suspended', {
        subscription_id: sub.id,
        reason: 'max_retry_attempts_reached',
      });
    } else {
      // Schedule retry
      const retrySchedule = dunning.retry_schedule || [3600, 21600, 86400, 259200];
      const nextRetryDelay = retrySchedule[newAttempts - 1] || 86400;
      const nextRetryAt = new Date(Date.now() + nextRetryDelay * 1000);

      await pool.query(
        `UPDATE subscription_dunning
         SET attempts = $2, next_retry_at = $3, last_attempt_at = now(),
             last_error = $4, updated_at = now()
         WHERE subscription_id = $1`,
        [sub.id, newAttempts, nextRetryAt, error]
      );

      await publishEvent('merchant', sub.merchant_id, 'subscription.payment_retry_scheduled', {
        subscription_id: sub.id,
        retry_at: nextRetryAt,
        attempt: newAttempts,
      });
    }
  }
}

/**
 * Process dunning retries
 */
export async function processDunningRetries() {
  console.log('[CRON] Processing dunning retries...');

  const { rows: dunningRecords } = await pool.query(
    `SELECT d.*, s.*
     FROM subscription_dunning d
     JOIN subscriptions s ON s.id = d.subscription_id
     WHERE d.dunning_state = 'retrying'
       AND d.next_retry_at <= now()
     LIMIT 50`
  );

  console.log(`[CRON] Found ${dunningRecords.length} subscriptions to retry`);

  for (const record of dunningRecords) {
    try {
      // Re-attempt collection
      const latestInvoice = await getLatestInvoice(record.subscription_id);

      if (latestInvoice) {
        const collectionResult = await attemptCollection(record, latestInvoice);

        if (collectionResult.success) {
          // Payment succeeded - clear dunning
          await pool.query(
            `UPDATE subscription_dunning
             SET dunning_state = 'ok', attempts = 0, next_retry_at = NULL,
                 last_error = NULL, updated_at = now()
             WHERE subscription_id = $1`,
            [record.subscription_id]
          );

          await pool.query(
            `UPDATE subscriptions SET status = 'active', updated_at = now()
             WHERE id = $1`,
            [record.subscription_id]
          );

          await publishEvent('merchant', record.merchant_id, 'subscription.payment_recovered', {
            subscription_id: record.subscription_id,
          });

          console.log(`[CRON] Payment recovered for subscription ${record.subscription_id}`);
        } else {
          // Still failing - continue dunning
          await initiateDunning(record, collectionResult.error || 'payment_retry_failed');
        }
      }
    } catch (err: any) {
      console.error(`[CRON] Error processing dunning for ${record.subscription_id}:`, err);
    }
  }
}

/**
 * Get latest invoice for subscription
 */
async function getLatestInvoice(subscriptionId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM subscription_invoices
     WHERE subscription_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [subscriptionId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Publish event helper
 */
async function publishEvent(target: string, targetId: string, eventType: string, data: any) {
  console.log(`[EVENT] ${target}:${targetId} -> ${eventType}`, data);
  // In production: publish to Kafka/Redis/webhook queue
}

/**
 * Format date helper
 */
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Main worker entry point
 */
export async function runSubscriptionWorker() {
  console.log('[WORKER] Subscription worker started');

  // Run immediately on startup
  await processDueSubscriptions();
  await processDunningRetries();

  // Schedule periodic runs
  setInterval(
    async () => {
      await processDueSubscriptions();
    },
    5 * 60 * 1000
  ); // Every 5 minutes

  setInterval(
    async () => {
      await processDunningRetries();
    },
    15 * 60 * 1000
  ); // Every 15 minutes

  console.log('[WORKER] Periodic tasks scheduled');
}

// Run worker if executed directly
if (require.main === module) {
  runSubscriptionWorker().catch((e) => {
    console.error('[WORKER] Fatal error:', e);
    process.exit(1);
  });
}