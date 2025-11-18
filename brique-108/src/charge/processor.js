// src/charge/processor.js
// Charge processing - handles actual money movement

let pool; // Initialized by setPool()

/**
 * Create internal charge for wallet payments
 * @param {Object} payment_intent - PaymentIntent object
 * @param {Object} payment_method - Wallet payment method
 * @returns {Promise<Object>} Charge result
 */
async function createInternalCharge(payment_intent, payment_method) {
  try {
    // Mock wallet debit - in production, this would call wallet provider API
    const walletId = payment_method.wallet_id;
    const amount = parseFloat(payment_intent.amount);

    console.log(`[CHARGE] Creating internal wallet charge: ${walletId} for ${amount} ${payment_intent.currency}`);

    // Create charge record
    const { rows } = await pool.query(
      `INSERT INTO charges
       (payment_intent_id, amount, currency, status, provider, provider_ref, fee_molam, fee_provider, net_amount, captured_at)
       VALUES ($1, $2, $3, 'captured', 'wallet_internal', $4, $5, 0, $6, now())
       RETURNING *`,
      [
        payment_intent.id,
        amount,
        payment_intent.currency,
        `wallet_${walletId}_${Date.now()}`,
        amount * 0.02, // 2% Molam fee
        amount * 0.98 // Net amount
      ]
    );

    return {
      status: 'captured',
      charge: rows[0]
    };
  } catch (error) {
    console.error(`[CHARGE] Internal charge failed: ${error.message}`);

    // Create failed charge record
    const { rows } = await pool.query(
      `INSERT INTO charges
       (payment_intent_id, amount, currency, status, provider, failure_code, failure_message)
       VALUES ($1, $2, $3, 'failed', 'wallet_internal', 'wallet_debit_failed', $4)
       RETURNING *`,
      [
        payment_intent.id,
        payment_intent.amount,
        payment_intent.currency,
        error.message
      ]
    );

    return {
      status: 'failed',
      charge: rows[0],
      error: error.message
    };
  }
}

/**
 * Create OTP for payment authentication
 * @param {string} user_id - User ID
 * @param {number} amount - Payment amount
 * @param {string} currency - Currency
 * @returns {Promise<Object>} OTP details
 */
async function createOtpForPayment(user_id, amount, currency) {
  // Generate 6-digit OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  console.log(`[OTP] Generated OTP for user ${user_id}: ${code} (Mock - would send via SMS)`);

  // In production, this would:
  // 1. Store OTP in database
  // 2. Send SMS via Twilio/SMS provider

  return {
    method: 'sms',
    code, // Only for testing - never return in production!
    expires_at: expires,
    message: `Your Molam payment code is: ${code}. Valid for 10 minutes.`
  };
}

/**
 * Provider charge and capture (card payments)
 * @param {Object} payment_method - Card payment method
 * @param {Object} payment_intent - PaymentIntent object
 * @returns {Promise<Object>} Charge result
 */
async function providerChargeCapture(payment_method, payment_intent) {
  try {
    const amount = parseFloat(payment_intent.amount);
    const provider = payment_method.provider || 'stripe'; // Default to Stripe

    console.log(`[CHARGE] Processing card charge via ${provider}: ${amount} ${payment_intent.currency}`);

    // Mock provider API call - in production, this would call Stripe/PayStack API
    const providerRef = `ch_${require('crypto').randomBytes(16).toString('hex')}`;

    // Simulate success/failure based on card number (testing)
    const cardLast4 = payment_method.last4 || '0000';
    const shouldFail = cardLast4.endsWith('0001'); // Card ending in 0001 always fails

    if (shouldFail) {
      throw new Error('card_declined');
    }

    // Create captured charge
    const { rows } = await pool.query(
      `INSERT INTO charges
       (payment_intent_id, amount, currency, status, provider, provider_ref, fee_molam, fee_provider, net_amount, captured_at)
       VALUES ($1, $2, $3, 'captured', $4, $5, $6, $7, $8, now())
       RETURNING *`,
      [
        payment_intent.id,
        amount,
        payment_intent.currency,
        provider,
        providerRef,
        amount * 0.025, // 2.5% Molam fee
        amount * 0.029 + 100, // 2.9% + 100 XOF provider fee (Stripe-like)
        amount * 0.946 - 100 // Net amount
      ]
    );

    return {
      status: 'captured',
      charge: rows[0]
    };
  } catch (error) {
    console.error(`[CHARGE] Provider charge failed: ${error.message}`);

    // Create failed charge
    const { rows } = await pool.query(
      `INSERT INTO charges
       (payment_intent_id, amount, currency, status, provider, failure_code, failure_message)
       VALUES ($1, $2, $3, 'failed', $4, $5, $6)
       RETURNING *`,
      [
        payment_intent.id,
        payment_intent.amount,
        payment_intent.currency,
        payment_method.provider || 'stripe',
        error.message === 'card_declined' ? 'card_declined' : 'processing_error',
        error.message
      ]
    );

    return {
      status: 'failed',
      charge: rows[0],
      error: error.message
    };
  }
}

/**
 * Provider capture (for manual capture mode)
 * @param {string} provider_ref - Provider charge reference
 * @returns {Promise<Object>} Capture result
 */
async function providerCapture(provider_ref) {
  try {
    console.log(`[CHARGE] Capturing charge: ${provider_ref}`);

    // Mock provider API call - in production, this would call provider capture endpoint
    // Stripe: stripe.charges.capture(chargeId)
    // PayStack: paystack.charge.capture(reference)

    return {
      status: 'captured',
      captured_at: new Date()
    };
  } catch (error) {
    console.error(`[CHARGE] Capture failed: ${error.message}`);
    return {
      status: 'failed',
      error: error.message
    };
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
  createInternalCharge,
  createOtpForPayment,
  providerChargeCapture,
  providerCapture
};
