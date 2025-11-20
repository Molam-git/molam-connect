/**
 * Brique 118: Mock Sandbox Server
 * Serveur de test déterministe pour E2E
 */

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Simuler des délais réseau (optionnel)
app.use((req, res, next) => {
  const delay = parseInt(process.env.MOCK_DELAY || '0');
  setTimeout(next, delay);
});

/**
 * POST /v1/payments - Créer un paiement
 */
app.post('/v1/payments', (req, res) => {
  const { amount, currency, method } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] || 'none';

  // Réponse déterministe
  const payment = {
    id: `pay_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'succeeded',
    amount: amount || 0,
    currency: currency || 'XOF',
    method: method || 'wallet',
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString()
  };

  console.log('✅ Payment created:', payment.id);
  res.json(payment);
});

/**
 * GET /v1/payments/:id - Récupérer un paiement
 */
app.get('/v1/payments/:id', (req, res) => {
  const payment = {
    id: req.params.id,
    status: 'succeeded',
    amount: 5000,
    currency: 'XOF',
    created_at: new Date().toISOString()
  };

  res.json(payment);
});

/**
 * POST /v1/refunds - Créer un remboursement
 */
app.post('/v1/refunds', (req, res) => {
  const { payment_id, amount } = req.body;

  const refund = {
    id: `ref_test_${Date.now()}`,
    payment_id,
    amount: amount || 5000,
    status: 'succeeded',
    created_at: new Date().toISOString()
  };

  console.log('✅ Refund created:', refund.id);
  res.json(refund);
});

/**
 * GET /healthz - Health check
 */
app.get('/healthz', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * POST /webhooks/test - Simuler un webhook
 */
app.post('/webhooks/test', (req, res) => {
  res.json({ sent: true });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.MOCK_PORT || 4001;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════╗
║  Mock Sandbox Server Running      ║
║  http://localhost:${PORT}           ║
╚═══════════════════════════════════╝

Endpoints:
  POST   /v1/payments
  GET    /v1/payments/:id
  POST   /v1/refunds
  POST   /webhooks/test
  GET    /healthz
  `);
});

module.exports = app;
