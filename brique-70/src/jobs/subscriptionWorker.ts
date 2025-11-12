import { CronJob } from 'cron';
import { config } from '../config';
import { pool } from '../db/pool';
import {
  getSubscriptionsDueForRenewal,
  createSubscriptionInvoice,
  renewSubscription,
  markInvoicePaid,
  handleFailedInvoicePayment,
} from '../services/subscriptions';

/**
 * Process subscriptions that are due for renewal
 */
async function processSubscriptionRenewals() {
  console.log('[SubscriptionWorker] Starting subscription renewal process...');

  try {
    // Get subscriptions due for renewal in next 24 hours
    const subscriptions = await getSubscriptionsDueForRenewal(24);

    console.log(`[SubscriptionWorker] Found ${subscriptions.length} subscriptions due for renewal`);

    for (const subscription of subscriptions) {
      try {
        // Check if subscription is trialing and trial ended
        if (subscription.status === 'trialing' && subscription.trial_end) {
          const now = new Date();
          if (now >= subscription.trial_end) {
            console.log(`[SubscriptionWorker] Trial ended for subscription ${subscription.id}`);
            // Create first invoice for trial-ended subscription
            const invoice = await createSubscriptionInvoice(subscription.id);
            console.log(`[SubscriptionWorker] Created invoice ${invoice.id} for ${subscription.id}`);

            // Attempt to charge payment method
            const paymentSuccess = await processPayment(subscription, invoice);

            if (paymentSuccess) {
              await markInvoicePaid(invoice.id, `payment_intent_${Date.now()}`);
              await renewSubscription(subscription.id);
              console.log(`[SubscriptionWorker] Successfully renewed subscription ${subscription.id}`);
            } else {
              await handleFailedInvoicePayment(invoice.id);
              console.log(`[SubscriptionWorker] Payment failed for subscription ${subscription.id}`);
            }
          }
        }
        // Check if active subscription is at period end
        else if (subscription.status === 'active') {
          const now = new Date();
          if (now >= subscription.current_period_end) {
            console.log(`[SubscriptionWorker] Renewing subscription ${subscription.id}`);

            // Create invoice for new period
            const invoice = await createSubscriptionInvoice(subscription.id);
            console.log(`[SubscriptionWorker] Created invoice ${invoice.id} for ${subscription.id}`);

            // Attempt to charge payment method
            const paymentSuccess = await processPayment(subscription, invoice);

            if (paymentSuccess) {
              await markInvoicePaid(invoice.id, `payment_intent_${Date.now()}`);
              await renewSubscription(subscription.id);
              console.log(`[SubscriptionWorker] Successfully renewed subscription ${subscription.id}`);
            } else {
              await handleFailedInvoicePayment(invoice.id);
              console.log(`[SubscriptionWorker] Payment failed for subscription ${subscription.id}`);
            }
          }
        }
      } catch (error) {
        console.error(`[SubscriptionWorker] Error processing subscription ${subscription.id}:`, error);
        // Continue with next subscription
      }
    }

    console.log('[SubscriptionWorker] Renewal process completed');
  } catch (error) {
    console.error('[SubscriptionWorker] Error in renewal process:', error);
  }
}

/**
 * Retry failed invoice payments
 */
async function retryFailedPayments() {
  console.log('[SubscriptionWorker] Starting retry process for failed payments...');

  try {
    const now = new Date();

    // Get invoices that need retry
    const result = await pool.query(
      `SELECT * FROM subscription_invoices
      WHERE status = 'open'
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= $1
      AND attempt_count < 3`,
      [now]
    );

    const invoices = result.rows;
    console.log(`[SubscriptionWorker] Found ${invoices.length} invoices to retry`);

    for (const invoice of invoices) {
      try {
        // Get subscription
        const subResult = await pool.query(
          'SELECT * FROM subscriptions WHERE id = $1',
          [invoice.subscription_id]
        );

        if (subResult.rows.length === 0) {
          console.error(`[SubscriptionWorker] Subscription not found for invoice ${invoice.id}`);
          continue;
        }

        const subscription = subResult.rows[0];

        // Attempt payment
        const paymentSuccess = await processPayment(subscription, invoice);

        if (paymentSuccess) {
          await markInvoicePaid(invoice.id, `payment_intent_${Date.now()}`);
          console.log(`[SubscriptionWorker] Payment retry successful for invoice ${invoice.id}`);

          // Update subscription status back to active
          await pool.query(
            'UPDATE subscriptions SET status = $1, updated_at = now() WHERE id = $2',
            ['active', subscription.id]
          );
        } else {
          await handleFailedInvoicePayment(invoice.id);
          console.log(`[SubscriptionWorker] Payment retry failed for invoice ${invoice.id}`);
        }
      } catch (error) {
        console.error(`[SubscriptionWorker] Error retrying invoice ${invoice.id}:`, error);
      }
    }

    console.log('[SubscriptionWorker] Retry process completed');
  } catch (error) {
    console.error('[SubscriptionWorker] Error in retry process:', error);
  }
}

/**
 * Handle subscriptions with cancel_at_period_end = true
 */
async function processPendingCancellations() {
  console.log('[SubscriptionWorker] Processing pending cancellations...');

  try {
    const now = new Date();

    // Get subscriptions marked for cancellation that have reached period end
    const result = await pool.query(
      `SELECT * FROM subscriptions
      WHERE cancel_at_period_end = true
      AND current_period_end <= $1
      AND status != 'canceled'`,
      [now]
    );

    const subscriptions = result.rows;
    console.log(`[SubscriptionWorker] Found ${subscriptions.length} subscriptions to cancel`);

    for (const subscription of subscriptions) {
      try {
        await pool.query(
          `UPDATE subscriptions SET
            status = 'canceled',
            updated_at = now()
          WHERE id = $1`,
          [subscription.id]
        );

        console.log(`[SubscriptionWorker] Canceled subscription ${subscription.id}`);

        // Here you could trigger webhooks, send emails, etc.
      } catch (error) {
        console.error(`[SubscriptionWorker] Error canceling subscription ${subscription.id}:`, error);
      }
    }

    console.log('[SubscriptionWorker] Cancellation process completed');
  } catch (error) {
    console.error('[SubscriptionWorker] Error in cancellation process:', error);
  }
}

/**
 * Process payment for subscription invoice
 * This is a placeholder - integrate with actual payment processor
 */
async function processPayment(subscription: any, invoice: any): Promise<boolean> {
  // TODO: Integrate with payment processor (Stripe, Paystack, etc.)
  // For now, simulate payment processing

  console.log(`[SubscriptionWorker] Processing payment for invoice ${invoice.id}`);

  // Check if payment method exists
  if (!subscription.default_payment_method_id) {
    console.log(`[SubscriptionWorker] No payment method for subscription ${subscription.id}`);
    return false;
  }

  // Simulate payment - in production, call payment processor
  // Example: const result = await paymentProcessor.charge({
  //   amount: invoice.total_amount,
  //   currency: invoice.currency,
  //   paymentMethodId: subscription.default_payment_method_id,
  //   customerId: subscription.customer_id,
  // });

  // Simulate 90% success rate
  const success = Math.random() > 0.1;

  if (success) {
    console.log(`[SubscriptionWorker] Payment successful for invoice ${invoice.id}`);
  } else {
    console.log(`[SubscriptionWorker] Payment failed for invoice ${invoice.id}`);
  }

  return success;
}

/**
 * Main worker function
 */
export async function startSubscriptionWorker() {
  console.log('[SubscriptionWorker] Starting subscription worker...');

  // Run immediately on start
  await processSubscriptionRenewals();
  await retryFailedPayments();
  await processPendingCancellations();

  // Schedule periodic runs (every hour)
  const job = new CronJob('0 * * * *', async () => {
    console.log('[SubscriptionWorker] Running scheduled tasks...');
    await processSubscriptionRenewals();
    await retryFailedPayments();
    await processPendingCancellations();
  });

  job.start();
  console.log('[SubscriptionWorker] Worker started. Running every hour.');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[SubscriptionWorker] Stopping worker...');
    job.stop();
    pool.end();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[SubscriptionWorker] Stopping worker...');
    job.stop();
    pool.end();
    process.exit(0);
  });
}

// Run if called directly
if (require.main === module) {
  startSubscriptionWorker().catch((error) => {
    console.error('[SubscriptionWorker] Fatal error:', error);
    process.exit(1);
  });
}
