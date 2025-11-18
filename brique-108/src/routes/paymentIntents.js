// src/routes/paymentIntents.js
const express = require('express');
const { getSiraDecision } = require('../sira/client');
const { publishEvent } = require('../webhooks/publisher');
const { start3DS2Session, isCard } = require('../3ds/utils');
const { createInternalCharge, createOtpForPayment, providerChargeCapture, providerCapture } = require('../charge/processor');
const { finalizeSuccess, finalizeFailure } = require('../charge/finalizer');

// Factory function to create router with dependencies
function createPaymentIntentRouter(pool) {
  const router = express.Router();

  // Create PaymentIntent
  router.post("/", async (req, res) => {
    const idempotency = req.headers["idempotency-key"] || req.body.external_id;
    if (!idempotency) return res.status(400).json({ error: "idempotency_required" });

    // check existing
    const existing = await pool.query("SELECT * FROM payment_intents WHERE external_id=$1", [idempotency]);
    if (existing.rowCount) return res.json(existing.rows[0]);

    const { merchant_id, payer_user_id, amount, currency, payment_method_types, capture_method = 'automatic' } = req.body;

    // Generate client_secret
    const client_secret = `pi_${require('crypto').randomBytes(16).toString('hex')}_secret_${require('crypto').randomBytes(16).toString('hex')}`;

    const { rows } = await pool.query(
      `INSERT INTO payment_intents (external_id, merchant_id, payer_user_id, amount, currency, payment_method_types, capture_method, client_secret)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [idempotency, merchant_id, payer_user_id, amount, currency, payment_method_types, capture_method, client_secret]
    );

    const pi = rows[0];
    await publishEvent("merchant", merchant_id, "payment_intent.created", { payment_intent_id: pi.id, amount, currency });
    res.status(201).json(pi);
  });

  // Retrieve PaymentIntent
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM payment_intents WHERE id=$1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  });

  // Confirm PaymentIntent → decision + 3DS orchestration
  router.post("/:id/confirm", async (req, res) => {
    const { id } = req.params;
    const { payment_method } = req.body; // token, wallet ref etc.

    // load PI
    const { rows: [pi] } = await pool.query("SELECT * FROM payment_intents WHERE id=$1", [id]);
    if (!pi) return res.status(404).json({ error: "not_found" });

    // save selected payment method
    await pool.query("UPDATE payment_intents SET selected_payment_method=$2, status='requires_action', updated_at=now() WHERE id=$1", [id, payment_method]);

    // call SIRA
    const sira = await getSiraDecision({ payment_intent: pi, payment_method });
    await pool.query("INSERT INTO auth_decisions(payment_intent_id,recommended_method,risk_score,sira_payload) VALUES($1,$2,$3,$4)", [id, sira.recommended, sira.risk_score, sira]);

    if (sira.recommended === '3ds2' && isCard(payment_method)) {
      // start 3DS2 flow: create 3ds session and provide client with data for SDK
      const dsInfo = await start3DS2Session(payment_method, pi);
      await pool.query("INSERT INTO three_ds_sessions(payment_intent_id,method,ds_provider,status,client_data) VALUES($1,'3ds2',$2,'challenge_required',$3) RETURNING *", [id, dsInfo.provider, dsInfo.client_data]);
      await publishEvent("merchant", pi.merchant_id, "payment_intent.requires_action", { payment_intent_id: id, action: { type: "3ds2", client_data: dsInfo.client_data } });
      return res.json({ status: "requires_action", action: { type: "3ds2", client_data: dsInfo.client_data } });
    }

    // fallback to OTP or immediate charge for wallet
    if (sira.recommended === 'otp' || payment_method.type === 'wallet') {
      // for wallet: attempt immediate debit (internal)
      if (payment_method.type === 'wallet') {
        const chargeRes = await createInternalCharge(pi, payment_method);
        if (chargeRes.status === 'captured') {
          await finalizeSuccess(pi.id, chargeRes);
          return res.json({ status: "succeeded" });
        }
      }
      // OTP path
      const otp = await createOtpForPayment(pi.payer_user_id, pi.amount, pi.currency);
      await publishEvent("merchant", pi.merchant_id, "payment_intent.requires_action", { payment_intent_id: id, action: { type: "otp", channel: otp.method } });
      return res.json({ status: "requires_action", action: { type: "otp", channel: otp.method } });
    }

    // default: attempt immediate capture (cards with no 3DS)
    const charge = await providerChargeCapture(payment_method, pi);
    if (charge.status === 'captured') {
      await finalizeSuccess(pi.id, charge);
      return res.json({ status: 'succeeded' });
    } else {
      await finalizeFailure(pi.id, charge);
      return res.status(400).json({ status: 'failed' });
    }
  });

  // Capture
  router.post("/:id/capture", async (req, res) => {
    const { id } = req.params;
    const { rows: [pi] } = await pool.query("SELECT * FROM payment_intents WHERE id=$1", [id]);
    if (!pi) return res.status(404).json({ error: 'not_found' });
    if (pi.status !== 'requires_capture') return res.status(400).json({ error: 'invalid_state' });

    // find related charge pending
    const { rows: [ch] } = await pool.query("SELECT * FROM charges WHERE payment_intent_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [id]);
    if (!ch) return res.status(500).json({ error: 'no_charge_found' });

    const result = await providerCapture(ch.provider_ref);
    if (result.status === 'captured') {
      await pool.query("UPDATE charges SET status='captured' WHERE id=$1", [ch.id]);
      await pool.query("UPDATE payment_intents SET status='succeeded', updated_at=now() WHERE id=$1", [id]);
      await publishEvent("merchant", pi.merchant_id, "payment_intent.succeeded", { payment_intent_id: id, charge_id: ch.id });
      return res.json({ ok: true });
    } else {
      await pool.query("UPDATE charges SET status='failed' WHERE id=$1", [ch.id]);
      await pool.query("UPDATE payment_intents SET status='failed', updated_at=now() WHERE id=$1", [id]);
      return res.status(500).json({ error: 'capture_failed' });
    }
  });

  // Cancel
  router.post("/:id/cancel", async (req, res) => {
    const { id } = req.params;
    const { rows: [pi] } = await pool.query("SELECT * FROM payment_intents WHERE id=$1", [id]);
    if (!pi) return res.status(404).json({ error: 'not_found' });

    await pool.query("UPDATE payment_intents SET status='canceled', updated_at=now() WHERE id=$1", [id]);
    await publishEvent("merchant", pi.merchant_id, "payment_intent.canceled", { payment_intent_id: id });

    res.json({ ok: true });
  });

  // Refund
  router.post("/:id/refund", async (req, res) => {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const { rows: [pi] } = await pool.query("SELECT * FROM payment_intents WHERE id=$1", [id]);
    if (!pi) return res.status(404).json({ error: 'not_found' });
    if (pi.status !== 'succeeded') return res.status(400).json({ error: 'cannot_refund' });

    // Find captured charge
    const { rows: [ch] } = await pool.query("SELECT * FROM charges WHERE payment_intent_id=$1 AND status='captured' ORDER BY created_at DESC LIMIT 1", [id]);
    if (!ch) return res.status(404).json({ error: 'no_charge_found' });

    // Create refund
    const { rows: [refund] } = await pool.query(
      "INSERT INTO refunds(charge_id, payment_intent_id, amount, currency, reason, status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING *",
      [ch.id, id, amount || ch.amount, ch.currency, reason || 'requested_by_customer']
    );

    await publishEvent("merchant", pi.merchant_id, "charge.refunded", { refund_id: refund.id, charge_id: ch.id, amount: refund.amount });

    res.status(201).json(refund);
  });

  return router;
}

module.exports = createPaymentIntentRouter;
