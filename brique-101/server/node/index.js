/**
 * Molam Form - Node.js Webhook Server Example
 *
 * A production-ready Express.js server for handling Molam webhooks.
 *
 * Features:
 * - HMAC signature verification
 * - Idempotency handling
 * - Event routing
 * - Error handling and retries
 * - Database integration example
 * - Logging
 *
 * Setup:
 * ```bash
 * npm install express body-parser
 * export MOLAM_WEBHOOK_SECRET=whsec_xxxxx
 * node index.js
 * ```
 *
 * @license MIT
 */

const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');

// =====================================================================
// Configuration
// =====================================================================

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.MOLAM_WEBHOOK_SECRET;
const WEBHOOK_PATH = process.env.MOLAM_WEBHOOK_PATH || '/molam/webhook';

if (!WEBHOOK_SECRET) {
  console.error('ERROR: MOLAM_WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

// =====================================================================
// Initialize Express App
// =====================================================================

const app = express();

// Parse raw body for signature verification
app.use(bodyParser.raw({ type: 'application/json' }));

// =====================================================================
// Webhook Signature Verification
// =====================================================================

/**
 * Verify Molam webhook signature
 *
 * @param {string} sigHeader - Molam-Signature header value
 * @param {string} payload - Raw request body
 * @param {string} secret - Webhook secret
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(sigHeader, payload, secret) {
  if (!sigHeader) {
    return false;
  }

  try {
    // Parse signature header: "t=timestamp,v1=hmac_hex,kid=version"
    const parts = sigHeader.split(',');
    const signatureMap = {};

    for (const part of parts) {
      const [key, value] = part.split('=');
      signatureMap[key] = value;
    }

    const timestamp = signatureMap.t;
    const signature = signatureMap.v1;
    const keyId = signatureMap.kid || 'v1';

    if (!timestamp || !signature) {
      console.error('Invalid signature format');
      return false;
    }

    // Check timestamp (5-minute tolerance)
    const now = Date.now();
    const signatureAge = now - parseInt(timestamp, 10);
    const fiveMinutes = 5 * 60 * 1000;

    if (signatureAge > fiveMinutes) {
      console.error(`Signature timestamp too old: ${signatureAge}ms`);
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// =====================================================================
// Idempotency Store (In-Memory Example)
// =====================================================================

// In production, use Redis or database
const processedEvents = new Set();

/**
 * Check if event has been processed
 *
 * @param {string} eventId - Event ID
 * @returns {boolean} True if event already processed
 */
function isEventProcessed(eventId) {
  return processedEvents.has(eventId);
}

/**
 * Mark event as processed
 *
 * @param {string} eventId - Event ID
 */
function markEventProcessed(eventId) {
  processedEvents.add(eventId);

  // Clean up old events after 24 hours
  setTimeout(() => {
    processedEvents.delete(eventId);
  }, 24 * 60 * 60 * 1000);
}

// =====================================================================
// Event Handlers
// =====================================================================

/**
 * Handle payment.succeeded event
 *
 * @param {Object} event - Webhook event data
 */
async function handlePaymentSucceeded(event) {
  const payment = event.data;

  console.log('Payment succeeded:', {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status
  });

  // TODO: Update your database
  // Example:
  // await db.orders.update({
  //   where: { id: payment.metadata.order_id },
  //   data: { status: 'paid', payment_id: payment.id }
  // });

  // TODO: Send confirmation email
  // await sendOrderConfirmationEmail(payment.metadata.order_id);

  // TODO: Fulfill order
  // await fulfillOrder(payment.metadata.order_id);
}

/**
 * Handle payment.failed event
 *
 * @param {Object} event - Webhook event data
 */
async function handlePaymentFailed(event) {
  const payment = event.data;

  console.log('Payment failed:', {
    id: payment.id,
    error: payment.error
  });

  // TODO: Update order status
  // TODO: Notify customer of failed payment
}

/**
 * Handle refund.succeeded event
 *
 * @param {Object} event - Webhook event data
 */
async function handleRefundSucceeded(event) {
  const refund = event.data;

  console.log('Refund succeeded:', {
    id: refund.id,
    amount: refund.amount,
    payment_id: refund.payment_id
  });

  // TODO: Update order status
  // TODO: Send refund confirmation email
}

/**
 * Handle refund.failed event
 *
 * @param {Object} event - Webhook event data
 */
async function handleRefundFailed(event) {
  const refund = event.data;

  console.log('Refund failed:', {
    id: refund.id,
    error: refund.error
  });

  // TODO: Alert admin of failed refund
}

/**
 * Route webhook events to appropriate handlers
 *
 * @param {Object} event - Webhook event
 */
async function routeEvent(event) {
  const handlers = {
    'payment.succeeded': handlePaymentSucceeded,
    'payment.failed': handlePaymentFailed,
    'refund.succeeded': handleRefundSucceeded,
    'refund.failed': handleRefundFailed,
  };

  const handler = handlers[event.type];

  if (handler) {
    await handler(event);
  } else {
    console.log('Unhandled event type:', event.type);
  }
}

// =====================================================================
// Webhook Endpoint
// =====================================================================

app.post(WEBHOOK_PATH, async (req, res) => {
  const signature = req.headers['molam-signature'];
  const rawBody = req.body.toString('utf8');

  // 1. Verify signature
  if (!verifyWebhookSignature(signature, rawBody, WEBHOOK_SECRET)) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  // 2. Parse event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    console.error('Invalid JSON payload');
    return res.status(400).send('Invalid JSON');
  }

  // 3. Check idempotency
  if (isEventProcessed(event.id)) {
    console.log('Event already processed:', event.id);
    return res.status(200).send('ok'); // Return 200 to acknowledge
  }

  // 4. Process event
  try {
    await routeEvent(event);
    markEventProcessed(event.id);
    res.status(200).send('ok');
  } catch (error) {
    console.error('Error processing event:', error);
    // Return 500 to trigger Molam retry
    res.status(500).send('Processing error');
  }
});

// =====================================================================
// Health Check Endpoint
// =====================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'molam-webhook-server',
    timestamp: new Date().toISOString()
  });
});

// =====================================================================
// Start Server
// =====================================================================

app.listen(PORT, () => {
  console.log(`✓ Molam webhook server listening on port ${PORT}`);
  console.log(`✓ Webhook endpoint: POST ${WEBHOOK_PATH}`);
  console.log(`✓ Health check: GET /health`);
});

// =====================================================================
// Graceful Shutdown
// =====================================================================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// =====================================================================
// Module Exports
// =====================================================================

module.exports = {
  verifyWebhookSignature,
  isEventProcessed,
  markEventProcessed
};
