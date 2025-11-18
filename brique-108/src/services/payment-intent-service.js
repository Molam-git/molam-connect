/**
 * Brique 108 - PaymentIntent Service
 *
 * Industrial-grade PaymentIntent orchestration with:
 * - State machine (FSM) for payment flow
 * - Idempotency via external_id
 * - 3DS2 integration
 * - SIRA-driven auth decisions
 * - Webhook emissions
 * - Audit trail
 */

const crypto = require('crypto');

class PaymentIntentService {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = {
      defaultCurrency: config.defaultCurrency || 'XOF',
      captureMethod: config.captureMethod || 'automatic',
      ...config
    };
  }

  /**
   * Create PaymentIntent with idempotency
   */
  async createPaymentIntent({
    external_id,
    merchant_id,
    payer_user_id,
    amount,
    currency,
    payment_method_types,
    capture_method,
    description,
    metadata = {}
  }) {
    // Check idempotency - return existing if found
    if (external_id) {
      const existing = await this.pool.query(
        'SELECT * FROM payment_intents WHERE external_id = $1',
        [external_id]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }

    // Generate client secret for client-side operations
    const client_secret = `pi_${crypto.randomBytes(16).toString('hex')}_secret_${crypto.randomBytes(16).toString('hex')}`;

    // Insert new PaymentIntent
    const result = await this.pool.query(
      `INSERT INTO payment_intents (
        external_id, merchant_id, payer_user_id, amount, currency,
        payment_method_types, capture_method, description, metadata, client_secret, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requires_payment_method')
      RETURNING *`,
      [
        external_id || `ext_${crypto.randomBytes(8).toString('hex')}`,
        merchant_id,
        payer_user_id,
        amount,
        currency || this.config.defaultCurrency,
        payment_method_types || ['card', 'wallet', 'bank'],
        capture_method || this.config.captureMethod,
        description,
        JSON.stringify(metadata),
        client_secret
      ]
    );

    const paymentIntent = result.rows[0];

    // Record state transition
    await this.recordStateTransition(paymentIntent.id, null, 'requires_payment_method', 'created', 'system');

    // Emit webhook
    await this.emitWebhook(merchant_id, 'payment_intent.created', paymentIntent);

    // Record metric
    await this.recordMetric('intent_created', paymentIntent.id, merchant_id, amount, currency);

    return paymentIntent;
  }

  /**
   * Get PaymentIntent by ID
   */
  async getPaymentIntent(id) {
    const result = await this.pool.query(
      'SELECT * FROM payment_intents WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error('Payment intent not found');
    }

    return result.rows[0];
  }

  /**
   * Update PaymentIntent status
   */
  async updatePaymentIntentStatus(id, newStatus, reason = 'automatic', actorType = 'system', actorId = null, error = null) {
    const pi = await this.getPaymentIntent(id);
    const oldStatus = pi.status;

    // Update status
    const updateData = error
      ? { status: newStatus, last_payment_error: JSON.stringify(error) }
      : { status: newStatus };

    await this.pool.query(
      `UPDATE payment_intents
       SET status = $2, last_payment_error = $3, updated_at = now()
       WHERE id = $1`,
      [id, newStatus, error ? JSON.stringify(error) : null]
    );

    // Record transition
    await this.recordStateTransition(id, oldStatus, newStatus, reason, actorType, actorId);

    // Emit webhook for status change
    const eventType = `payment_intent.${newStatus}`;
    await this.emitWebhook(pi.merchant_id, eventType, { id, status: newStatus, amount: pi.amount, currency: pi.currency });

    return await this.getPaymentIntent(id);
  }

  /**
   * Confirm PaymentIntent - triggers authentication decision
   */
  async confirmPaymentIntent(id, paymentMethod, clientInfo = {}) {
    const pi = await this.getPaymentIntent(id);

    // Validate state
    if (pi.status !== 'requires_payment_method' && pi.status !== 'requires_action') {
      throw new Error(`Cannot confirm payment intent in status: ${pi.status}`);
    }

    // Save selected payment method
    await this.pool.query(
      `UPDATE payment_intents
       SET selected_payment_method = $2, status = 'processing', updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(paymentMethod)]
    );

    await this.recordStateTransition(id, pi.status, 'processing', 'confirm', 'user', pi.payer_user_id);

    // Get SIRA auth decision
    const authDecision = await this.getSiraAuthDecision(pi, paymentMethod, clientInfo);

    // Save auth decision
    await this.pool.query(
      `INSERT INTO auth_decisions (
        payment_intent_id, recommended_method, risk_score, risk_level,
        sira_payload, rules_triggered, exemption_applied, sca_required, fallback_chain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        authDecision.recommended_method,
        authDecision.risk_score,
        authDecision.risk_level,
        JSON.stringify(authDecision),
        authDecision.rules_triggered || [],
        authDecision.exemption_applied,
        authDecision.sca_required !== false,
        authDecision.fallback_chain || ['3ds2', 'otp_sms', 'otp_voice']
      ]
    );

    // Route based on recommended method
    return await this.routeAuthentication(pi, paymentMethod, authDecision);
  }

  /**
   * Route authentication based on SIRA decision
   */
  async routeAuthentication(pi, paymentMethod, authDecision) {
    const { recommended_method } = authDecision;

    // 3DS2 for card payments
    if (recommended_method === '3ds2' && paymentMethod.type === 'card') {
      // Update status to requires_action
      await this.updatePaymentIntentStatus(pi.id, 'requires_action', '3ds2_required', 'system');

      // Return action required
      return {
        status: 'requires_action',
        payment_intent_id: pi.id,
        action: {
          type: '3ds2',
          message: '3D Secure authentication required'
        }
      };
    }

    // OTP for high-risk or wallet
    if (recommended_method.startsWith('otp_') || (paymentMethod.type === 'wallet' && authDecision.sca_required)) {
      await this.updatePaymentIntentStatus(pi.id, 'requires_action', 'otp_required', 'system');

      return {
        status: 'requires_action',
        payment_intent_id: pi.id,
        action: {
          type: 'otp',
          channel: recommended_method.replace('otp_', '') || 'sms'
        }
      };
    }

    // No authentication required (low-risk, exemption, or wallet internal)
    if (recommended_method === 'none' || paymentMethod.type === 'wallet') {
      // Proceed directly to charge
      return await this.createAndCaptureCharge(pi, paymentMethod);
    }

    // Default: proceed with charge
    return await this.createAndCaptureCharge(pi, paymentMethod);
  }

  /**
   * Create and capture charge (for automatic capture)
   */
  async createAndCaptureCharge(pi, paymentMethod) {
    try {
      // Create charge record
      const charge = await this.pool.query(
        `INSERT INTO charges (
          payment_intent_id, amount, currency, status, provider, metadata
        ) VALUES ($1, $2, $3, 'pending', $4, $5)
        RETURNING *`,
        [
          pi.id,
          pi.amount,
          pi.currency,
          paymentMethod.provider || 'internal',
          JSON.stringify({ payment_method: paymentMethod })
        ]
      );

      const chargeId = charge.rows[0].id;

      // Simulate charge processing (in production: call actual provider)
      const chargeResult = await this.processCharge(paymentMethod, pi);

      if (chargeResult.success) {
        // Update charge as captured
        await this.pool.query(
          `UPDATE charges
           SET status = 'captured', provider_ref = $2, provider_response = $3,
               net_amount = $4, captured_at = now(), updated_at = now()
           WHERE id = $1`,
          [
            chargeId,
            chargeResult.provider_ref,
            JSON.stringify(chargeResult.response),
            pi.amount - (chargeResult.fee_molam || 0) - (chargeResult.fee_provider || 0)
          ]
        );

        // Update PaymentIntent to succeeded
        await this.updatePaymentIntentStatus(pi.id, 'succeeded', 'charge_captured', 'system');

        // Emit charge webhook
        await this.emitWebhook(pi.merchant_id, 'charge.captured', { charge_id: chargeId, amount: pi.amount });

        // Record metric
        await this.recordMetric('capture_succeeded', pi.id, pi.merchant_id, pi.amount, pi.currency);

        return {
          status: 'succeeded',
          payment_intent_id: pi.id,
          charge_id: chargeId
        };
      } else {
        // Charge failed
        await this.pool.query(
          `UPDATE charges
           SET status = 'failed', failure_code = $2, failure_message = $3, updated_at = now()
           WHERE id = $1`,
          [chargeId, chargeResult.error_code, chargeResult.error_message]
        );

        await this.updatePaymentIntentStatus(
          pi.id,
          'failed',
          'charge_failed',
          'system',
          null,
          { code: chargeResult.error_code, message: chargeResult.error_message }
        );

        return {
          status: 'failed',
          payment_intent_id: pi.id,
          error: { code: chargeResult.error_code, message: chargeResult.error_message }
        };
      }
    } catch (error) {
      console.error('Charge error:', error);
      await this.updatePaymentIntentStatus(pi.id, 'failed', 'charge_exception', 'system', null, { message: error.message });

      return {
        status: 'failed',
        payment_intent_id: pi.id,
        error: { message: error.message }
      };
    }
  }

  /**
   * Capture authorized payment (for manual capture)
   */
  async capturePaymentIntent(id, amount = null) {
    const pi = await this.getPaymentIntent(id);

    if (pi.status !== 'requires_capture') {
      throw new Error(`Cannot capture payment intent in status: ${pi.status}`);
    }

    // Find pending charge
    const chargeResult = await this.pool.query(
      `SELECT * FROM charges
       WHERE payment_intent_id = $1 AND status IN ('pending', 'authorized')
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    if (chargeResult.rows.length === 0) {
      throw new Error('No authorized charge found');
    }

    const charge = chargeResult.rows[0];
    const captureAmount = amount || charge.amount;

    // Process capture (in production: call provider API)
    const captureResult = await this.processCaptureWithProvider(charge.provider_ref, captureAmount);

    if (captureResult.success) {
      await this.pool.query(
        `UPDATE charges
         SET status = 'captured', captured_at = now(), updated_at = now()
         WHERE id = $1`,
        [charge.id]
      );

      await this.updatePaymentIntentStatus(id, 'succeeded', 'manually_captured', 'merchant', pi.merchant_id);

      await this.emitWebhook(pi.merchant_id, 'charge.captured', { charge_id: charge.id, amount: captureAmount });

      return { success: true, charge_id: charge.id };
    } else {
      await this.pool.query(
        `UPDATE charges
         SET status = 'failed', failure_code = $2, failure_message = $3
         WHERE id = $1`,
        [charge.id, captureResult.error_code, captureResult.error_message]
      );

      throw new Error(`Capture failed: ${captureResult.error_message}`);
    }
  }

  /**
   * Cancel PaymentIntent
   */
  async cancelPaymentIntent(id, reason = 'requested_by_customer') {
    const pi = await this.getPaymentIntent(id);

    if (!['requires_payment_method', 'requires_action', 'requires_capture'].includes(pi.status)) {
      throw new Error(`Cannot cancel payment intent in status: ${pi.status}`);
    }

    await this.updatePaymentIntentStatus(id, 'canceled', reason, 'merchant', pi.merchant_id);

    return await this.getPaymentIntent(id);
  }

  /**
   * Get SIRA auth decision (mock implementation)
   */
  async getSiraAuthDecision(pi, paymentMethod, clientInfo) {
    // Mock SIRA decision based on amount and risk factors
    let riskScore = 30; // Base score

    // Increase risk for high amounts
    if (pi.amount > 100000) riskScore += 30;
    if (pi.amount > 500000) riskScore += 20;

    // Increase risk for new users
    if (!pi.payer_user_id) riskScore += 15;

    // Decrease risk for known payment methods
    if (paymentMethod.fingerprint) riskScore -= 10;

    // Ensure score is in bounds
    riskScore = Math.max(0, Math.min(100, riskScore));

    // Determine recommended method
    let recommended_method = 'none';
    let risk_level = 'low';

    if (riskScore >= 70) {
      recommended_method = '3ds2';
      risk_level = 'high';
    } else if (riskScore >= 40) {
      recommended_method = 'otp_sms';
      risk_level = 'medium';
    }

    return {
      recommended_method,
      risk_score: riskScore,
      risk_level,
      sca_required: riskScore >= 40,
      exemption_applied: riskScore < 30 ? 'low_value' : null,
      rules_triggered: [],
      fallback_chain: ['3ds2', 'otp_sms', 'otp_voice']
    };
  }

  /**
   * Process charge (mock - would call actual payment provider)
   */
  async processCharge(paymentMethod, pi) {
    // Mock success for demo
    // In production: integrate with Stripe, Paystack, Wave, etc.

    return {
      success: true,
      provider_ref: `ch_${crypto.randomBytes(12).toString('hex')}`,
      response: { status: 'succeeded' },
      fee_molam: pi.amount * 0.01, // 1% fee
      fee_provider: pi.amount * 0.015 // 1.5% provider fee
    };
  }

  /**
   * Process capture with provider (mock)
   */
  async processCaptureWithProvider(providerRef, amount) {
    // Mock implementation
    return {
      success: true,
      provider_ref: providerRef,
      captured_amount: amount
    };
  }

  /**
   * Record state transition for audit
   */
  async recordStateTransition(paymentIntentId, fromStatus, toStatus, reason, actorType, actorId = null) {
    try {
      await this.pool.query(
        `INSERT INTO payment_state_transitions (
          payment_intent_id, from_status, to_status, reason, actor_type, actor_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [paymentIntentId, fromStatus, toStatus, reason, actorType, actorId]
      );
    } catch (error) {
      console.error('Failed to record state transition:', error);
    }
  }

  /**
   * Emit webhook to merchant
   */
  async emitWebhook(merchantId, eventType, payload) {
    try {
      await this.pool.query(
        `INSERT INTO payment_webhooks_queue (
          merchant_id, event_type, payment_intent_id, payload, status, next_retry_at
        ) VALUES ($1, $2, $3, $4, 'pending', now() + interval '1 minute')`,
        [merchantId, eventType, payload.id || payload.payment_intent_id, JSON.stringify(payload)]
      );
    } catch (error) {
      console.error('Failed to emit webhook:', error);
    }
  }

  /**
   * Record metric
   */
  async recordMetric(metricType, paymentIntentId, merchantId, value, currency) {
    try {
      await this.pool.query(
        `INSERT INTO payment_metrics (
          metric_type, payment_intent_id, merchant_id, value, currency
        ) VALUES ($1, $2, $3, $4, $5)`,
        [metricType, paymentIntentId, merchantId, value, currency]
      );
    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * List payment intents with filters
   */
  async listPaymentIntents({ merchant_id, payer_user_id, status, limit = 20, offset = 0 }) {
    let query = 'SELECT * FROM payment_intents WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (merchant_id) {
      params.push(merchant_id);
      query += ` AND merchant_id = $${paramIndex++}`;
    }

    if (payer_user_id) {
      params.push(payer_user_id);
      query += ` AND payer_user_id = $${paramIndex++}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${paramIndex++}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }
}

module.exports = PaymentIntentService;
