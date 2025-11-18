// src/webhooks/publisher.js
// Webhook event publisher - queues events for merchant notification

let pool; // Initialized by setPool()

/**
 * Publish webhook event to merchant
 * @param {string} target_type - 'merchant' | 'user'
 * @param {string} target_id - Merchant or user ID
 * @param {string} event_type - Event type (e.g., 'payment_intent.created')
 * @param {Object} payload - Event payload
 * @returns {Promise<Object>} Created webhook queue entry
 */
async function publishEvent(target_type, target_id, event_type, payload) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO payment_webhooks_queue
       (merchant_id, event_type, payment_intent_id, payload, status, next_retry_at)
       VALUES ($1, $2, $3, $4, 'pending', now() + interval '5 seconds')
       RETURNING *`,
      [
        target_id,
        event_type,
        payload.payment_intent_id || null,
        JSON.stringify(payload)
      ]
    );

    console.log(`[WEBHOOK] Queued event: ${event_type} for ${target_type}:${target_id}`);
    return rows[0];
  } catch (error) {
    console.error(`[WEBHOOK] Failed to queue event: ${error.message}`);
    // Don't throw - webhook failures shouldn't block payment flow
    return null;
  }
}

/**
 * Process pending webhooks (called by background worker)
 * @returns {Promise<number>} Number of webhooks processed
 */
async function processPendingWebhooks() {
  const { rows: webhooks } = await pool.query(
    `SELECT * FROM payment_webhooks_queue
     WHERE status = 'pending'
     AND (next_retry_at IS NULL OR next_retry_at <= now())
     AND attempts < max_attempts
     ORDER BY created_at ASC
     LIMIT 100`
  );

  let processed = 0;
  for (const webhook of webhooks) {
    try {
      // Mock webhook delivery - replace with actual HTTP POST to merchant endpoint
      console.log(`[WEBHOOK] Delivering: ${webhook.event_type} to merchant:${webhook.merchant_id}`);

      // Update as sent
      await pool.query(
        `UPDATE payment_webhooks_queue
         SET status = 'sent', attempts = attempts + 1, updated_at = now()
         WHERE id = $1`,
        [webhook.id]
      );

      processed++;
    } catch (error) {
      // Update retry
      const nextRetry = new Date(Date.now() + Math.pow(2, webhook.attempts + 1) * 1000); // Exponential backoff
      await pool.query(
        `UPDATE payment_webhooks_queue
         SET attempts = attempts + 1,
             last_error = $2,
             next_retry_at = $3,
             status = CASE WHEN attempts + 1 >= max_attempts THEN 'abandoned' ELSE 'pending' END,
             updated_at = now()
         WHERE id = $1`,
        [webhook.id, error.message, nextRetry]
      );
    }
  }

  return processed;
}

/**
 * Set database pool (must be called before using other functions)
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  publishEvent,
  processPendingWebhooks
};
