// src/charge/finalizer.js
// Payment finalization - updates PaymentIntent status after charge
const { publishEvent } = require('../webhooks/publisher');

let pool; // Initialized by setPool()

/**
 * Finalize successful payment
 * @param {string} payment_intent_id - PaymentIntent ID
 * @param {Object} charge_result - Charge result
 * @returns {Promise<void>}
 */
async function finalizeSuccess(payment_intent_id, charge_result) {
  try {
    // Get payment intent
    const { rows: [pi] } = await pool.query(
      'SELECT * FROM payment_intents WHERE id = $1',
      [payment_intent_id]
    );

    if (!pi) {
      throw new Error('PaymentIntent not found');
    }

    // Update payment intent to succeeded
    await pool.query(
      `UPDATE payment_intents
       SET status = 'succeeded', updated_at = now()
       WHERE id = $1`,
      [payment_intent_id]
    );

    // Record state transition
    await pool.query(
      `INSERT INTO payment_state_transitions
       (payment_intent_id, from_status, to_status, reason, actor_type, metadata)
       VALUES ($1, $2, 'succeeded', 'charge_captured', 'system', $3)`,
      [payment_intent_id, pi.status, JSON.stringify({ charge_id: charge_result.charge?.id })]
    );

    // Publish webhook
    await publishEvent(
      'merchant',
      pi.merchant_id,
      'payment_intent.succeeded',
      {
        payment_intent_id,
        charge_id: charge_result.charge?.id,
        amount: pi.amount,
        currency: pi.currency
      }
    );

    console.log(`[FINALIZER] Payment succeeded: ${payment_intent_id}`);
  } catch (error) {
    console.error(`[FINALIZER] Failed to finalize success: ${error.message}`);
    throw error;
  }
}

/**
 * Finalize failed payment
 * @param {string} payment_intent_id - PaymentIntent ID
 * @param {Object} charge_result - Charge result with error
 * @returns {Promise<void>}
 */
async function finalizeFailure(payment_intent_id, charge_result) {
  try {
    // Get payment intent
    const { rows: [pi] } = await pool.query(
      'SELECT * FROM payment_intents WHERE id = $1',
      [payment_intent_id]
    );

    if (!pi) {
      throw new Error('PaymentIntent not found');
    }

    // Build error object
    const error = {
      code: charge_result.charge?.failure_code || 'payment_failed',
      message: charge_result.charge?.failure_message || charge_result.error || 'Payment failed',
      charge_id: charge_result.charge?.id
    };

    // Update payment intent to failed
    await pool.query(
      `UPDATE payment_intents
       SET status = 'failed',
           last_payment_error = $2,
           updated_at = now()
       WHERE id = $1`,
      [payment_intent_id, JSON.stringify(error)]
    );

    // Record state transition
    await pool.query(
      `INSERT INTO payment_state_transitions
       (payment_intent_id, from_status, to_status, reason, actor_type, metadata)
       VALUES ($1, $2, 'failed', 'charge_failed', 'system', $3)`,
      [payment_intent_id, pi.status, JSON.stringify(error)]
    );

    // Publish webhook
    await publishEvent(
      'merchant',
      pi.merchant_id,
      'payment_intent.payment_failed',
      {
        payment_intent_id,
        error,
        amount: pi.amount,
        currency: pi.currency
      }
    );

    console.log(`[FINALIZER] Payment failed: ${payment_intent_id} - ${error.message}`);
  } catch (error) {
    console.error(`[FINALIZER] Failed to finalize failure: ${error.message}`);
    throw error;
  }
}

/**
 * Set database pool (must be called before using other functions)
 */
function setPool(dbPool) {
  pool = dbPool;
}

module.exports = {
  setPool,
  finalizeSuccess,
  finalizeFailure
};
