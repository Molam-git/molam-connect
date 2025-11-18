// src/routes/checkout.js
// Checkout API endpoints - Session management and payment confirmation

const express = require('express');
const crypto = require('crypto');

// Factory function to create router with dependencies
function createCheckoutRouter(pool, tokenService) {
  const router = express.Router();

  /**
   * Create checkout session
   * POST /api/v1/checkout/create_session
   */
  router.post('/create_session', async (req, res) => {
    try {
      const {
        external_id,
        merchant_id,
        amount,
        currency = 'XOF',
        locale = 'en',
        allowed_methods = ['wallet', 'card', 'bank'],
        success_url,
        cancel_url,
        meta = {}
      } = req.body;

      if (!external_id) {
        return res.status(400).json({ error: 'external_id_required' });
      }

      if (!merchant_id) {
        return res.status(400).json({ error: 'merchant_id_required' });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'invalid_amount' });
      }

      // Check for existing session (idempotency)
      const existing = await pool.query(
        'SELECT * FROM checkout_sessions WHERE external_id = $1',
        [external_id]
      );

      if (existing.rowCount > 0) {
        return res.json(existing.rows[0]);
      }

      // Get merchant details
      const { rows: [merchant] } = await pool.query(
        'SELECT * FROM merchants WHERE id = $1',
        [merchant_id]
      );

      if (!merchant) {
        return res.status(404).json({ error: 'merchant_not_found' });
      }

      // Generate SIRA hints (simplified - call actual SIRA service in production)
      const sira_hints = {
        risk_score: amount > 50000 ? 60 : amount > 10000 ? 40 : 20,
        recommended_methods: amount > 50000 ? ['3ds2', 'otp'] : ['otp', 'none']
      };

      // Set expiration (15 minutes)
      const expires_at = new Date(Date.now() + 15 * 60 * 1000);

      // Create session
      const { rows } = await pool.query(
        `INSERT INTO checkout_sessions
         (external_id, merchant_id, amount, currency, locale, allowed_methods,
          sira_hints, merchant_name, merchant_logo, success_url, cancel_url,
          meta, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'created')
         RETURNING *`,
        [
          external_id,
          merchant_id,
          amount,
          currency,
          locale,
          allowed_methods,
          JSON.stringify(sira_hints),
          merchant.business_name || 'Merchant',
          merchant.logo_url || null,
          success_url,
          cancel_url,
          JSON.stringify(meta),
          expires_at
        ]
      );

      const session = rows[0];

      // Track analytics
      await pool.query(
        `INSERT INTO widget_analytics
         (merchant_id, session_id, metric_type, value, recorded_at)
         VALUES ($1, $2, 'session_created', $3, now())`,
        [merchant_id, session.id, amount]
      );

      console.log(`✅ Checkout session created: ${session.id} - ${amount} ${currency}`);

      res.status(201).json({
        id: session.id,
        external_id: session.external_id,
        amount: session.amount,
        currency: session.currency,
        locale: session.locale,
        allowed_methods: session.allowed_methods,
        merchant_name: session.merchant_name,
        merchant_logo: session.merchant_logo,
        sira_hints: session.sira_hints,
        expires_at: session.expires_at,
        status: session.status
      });
    } catch (error) {
      console.error('❌ Checkout session creation failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Get checkout session
   * GET /api/v1/checkout/session/:id
   */
  router.get('/session/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        'SELECT * FROM checkout_sessions WHERE id = $1',
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'session_not_found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('❌ Checkout session retrieval failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Confirm checkout (create PaymentIntent)
   * POST /api/v1/checkout/confirm
   */
  router.post('/confirm', async (req, res) => {
    try {
      const {
        session_id,
        payment_method_token,
        payment_method
      } = req.body;

      if (!session_id) {
        return res.status(400).json({ error: 'session_id_required' });
      }

      // Get session
      const { rows: [session] } = await pool.query(
        'SELECT * FROM checkout_sessions WHERE id = $1',
        [session_id]
      );

      if (!session) {
        return res.status(404).json({ error: 'session_not_found' });
      }

      if (session.status !== 'created') {
        return res.status(400).json({ error: 'session_already_processed' });
      }

      if (new Date(session.expires_at) < new Date()) {
        await pool.query(
          'UPDATE checkout_sessions SET status = $1 WHERE id = $2',
          ['expired', session_id]
        );
        return res.status(410).json({ error: 'session_expired' });
      }

      // Create PaymentIntent (using Brique 108 schema)
      const piExternalId = `checkout_${session.external_id}`;
      const clientSecret = `pi_${crypto.randomBytes(16).toString('hex')}_secret_${crypto.randomBytes(16).toString('hex')}`;

      const { rows: piRows } = await pool.query(
        `INSERT INTO payment_intents
         (external_id, merchant_id, payer_user_id, amount, currency,
          payment_method_types, capture_method, client_secret, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'automatic', $7, 'requires_payment_method')
         RETURNING *`,
        [
          piExternalId,
          session.merchant_id,
          null, // TODO: Get from authenticated user
          session.amount,
          session.currency,
          session.allowed_methods
        ]
      );

      const paymentIntent = piRows[0];

      // Handle payment method
      let result;

      if (payment_method_token) {
        // Card payment with token
        result = await processCardPayment(pool, tokenService, paymentIntent, payment_method_token);
      } else if (payment_method) {
        // Wallet or bank payment
        result = await processDirectPayment(pool, paymentIntent, payment_method);
      } else {
        return res.status(400).json({ error: 'no_payment_method_provided' });
      }

      // Update session status
      if (result.status === 'succeeded') {
        await pool.query(
          'UPDATE checkout_sessions SET status = $1, completed_at = now() WHERE id = $2',
          ['completed', session_id]
        );
      }

      // Track analytics
      await pool.query(
        `INSERT INTO widget_analytics
         (merchant_id, session_id, metric_type, value, payment_method, recorded_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          session.merchant_id,
          session_id,
          result.status === 'succeeded' ? 'confirm_success' : 'confirm_failed',
          session.amount,
          payment_method_token ? 'card' : payment_method?.type
        ]
      );

      console.log(`✅ Checkout confirmed: ${session_id} - ${result.status}`);

      res.json(result);
    } catch (error) {
      console.error('❌ Checkout confirm failed:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Get checkout session QR code
   * GET /api/v1/checkout/session/:id/qr
   */
  router.get('/session/:id/qr', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        'SELECT * FROM checkout_sessions WHERE id = $1',
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'session_not_found' });
      }

      const session = rows[0];

      // Generate QR code for offline payment
      const QRCode = require('qrcode');
      const qrUrl = `${process.env.PAY_URL || 'http://localhost:3000'}/pay/${session.id}`;

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        errorCorrectionLevel: 'H',
        width: 300
      });

      res.json({
        session_id: session.id,
        qr_url: qrUrl,
        qr_data_url: qrDataUrl,
        amount: session.amount,
        currency: session.currency,
        expires_at: session.expires_at
      });
    } catch (error) {
      console.error('❌ QR generation failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Cancel checkout session
   * POST /api/v1/checkout/session/:id/cancel
   */
  router.post('/session/:id/cancel', async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(
        `UPDATE checkout_sessions
         SET status = 'canceled'
         WHERE id = $1 AND status = 'created'
         RETURNING *`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'session_not_found_or_already_processed' });
      }

      res.json({ ok: true, session: rows[0] });
    } catch (error) {
      console.error('❌ Session cancellation failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * Process card payment with token
 */
async function processCardPayment(pool, tokenService, paymentIntent, token) {
  // Get token details
  const tokenRecord = await tokenService.getToken(token);

  // Mark token as used
  await tokenService.markTokenUsed(token);

  // Mock charge creation (replace with actual provider integration)
  const chargeAmount = parseFloat(paymentIntent.amount);

  const { rows } = await pool.query(
    `INSERT INTO charges
     (payment_intent_id, amount, currency, status, provider, provider_ref, fee_molam, fee_provider, net_amount, captured_at)
     VALUES ($1, $2, $3, 'captured', 'stripe', $4, $5, $6, $7, now())
     RETURNING *`,
    [
      paymentIntent.id,
      chargeAmount,
      paymentIntent.currency,
      `ch_${crypto.randomBytes(16).toString('hex')}`,
      chargeAmount * 0.025, // 2.5% Molam fee
      chargeAmount * 0.029 + 100, // 2.9% + 100 provider fee
      chargeAmount * 0.946 - 100 // Net amount
    ]
  );

  // Update PaymentIntent status
  await pool.query(
    `UPDATE payment_intents SET status = 'succeeded', updated_at = now() WHERE id = $1`,
    [paymentIntent.id]
  );

  return {
    status: 'succeeded',
    payment_intent_id: paymentIntent.id,
    charge_id: rows[0].id
  };
}

/**
 * Process direct payment (wallet/bank)
 */
async function processDirectPayment(pool, paymentIntent, paymentMethod) {
  if (paymentMethod.type === 'wallet') {
    // Mock wallet charge
    const chargeAmount = parseFloat(paymentIntent.amount);

    const { rows } = await pool.query(
      `INSERT INTO charges
       (payment_intent_id, amount, currency, status, provider, provider_ref, fee_molam, net_amount, captured_at)
       VALUES ($1, $2, $3, 'captured', 'wallet_internal', $4, $5, $6, now())
       RETURNING *`,
      [
        paymentIntent.id,
        chargeAmount,
        paymentIntent.currency,
        `wallet_${Date.now()}`,
        chargeAmount * 0.02, // 2% fee
        chargeAmount * 0.98 // Net amount
      ]
    );

    await pool.query(
      `UPDATE payment_intents SET status = 'succeeded', updated_at = now() WHERE id = $1`,
      [paymentIntent.id]
    );

    return {
      status: 'succeeded',
      payment_intent_id: paymentIntent.id,
      charge_id: rows[0].id
    };
  }

  throw new Error('unsupported_payment_method');
}

module.exports = createCheckoutRouter;
