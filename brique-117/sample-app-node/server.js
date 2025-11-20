import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Simuler Molam SDK (à remplacer par vrai SDK en production)
class MolamClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  payments = {
    create: async (data) => {
      // Simuler appel API
      return {
        id: `pay_${Date.now()}`,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        status: 'succeeded',
        customer: data.customer,
        created_at: new Date().toISOString()
      };
    },

    retrieve: async (id) => {
      return {
        id,
        amount: 5000,
        currency: 'XOF',
        status: 'succeeded',
        created_at: new Date().toISOString()
      };
    }
  };

  refunds = {
    create: async (data) => {
      return {
        id: `ref_${Date.now()}`,
        payment_id: data.payment_id,
        amount: data.amount,
        status: 'succeeded',
        created_at: new Date().toISOString()
      };
    }
  };

  webhooks = {
    verifySignature: (payload, signature, secret) => {
      // Simuler vérification
      return true;
    }
  };
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const molam = new MolamClient(process.env.MOLAM_SECRET_KEY || 'sk_test_demo');

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Routes

// Créer un paiement
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency, method, phone, email, name } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: 'Amount and currency are required' });
    }

    const payment = await molam.payments.create({
      amount: parseInt(amount),
      currency,
      method: method || 'wallet',
      customer: {
        phone,
        email,
        name
      }
    });

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer le statut d'un paiement
app.get('/payment-status/:id', async (req, res) => {
  try {
    const payment = await molam.payments.retrieve(req.params.id);
    res.json({
      success: true,
      payment
    });
  } catch (error) {
    res.status(404).json({ error: 'Payment not found' });
  }
});

// Créer un remboursement
app.post('/create-refund', async (req, res) => {
  try {
    const { payment_id, amount, reason } = req.body;

    if (!payment_id) {
      return res.status(400).json({ error: 'Payment ID is required' });
    }

    const refund = await molam.refunds.create({
      payment_id,
      amount: amount ? parseInt(amount) : undefined,
      reason
    });

    res.json({
      success: true,
      refund
    });
  } catch (error) {
    console.error('Error creating refund:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint
app.post('/webhooks/molam', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['molam-signature'] || '';
  const payload = req.body;

  // Vérifier la signature
  const isValid = molam.webhooks.verifySignature(
    payload,
    signature,
    process.env.MOLAM_WEBHOOK_SECRET || 'whsec_test'
  );

  if (!isValid) {
    console.error('Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(payload.toString());
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Traiter l'événement
  console.log('Webhook event received:', event.type);

  switch (event.type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.id);
      // Mettre à jour votre base de données
      break;

    case 'payment.failed':
      console.log('Payment failed:', event.data.id);
      // Notifier le client
      break;

    case 'refund.created':
      console.log('Refund created:', event.data.id);
      break;

    default:
      console.log('Unhandled event type:', event.type);
  }

  res.json({ received: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  Molam Sample App Running              ║
║  http://localhost:${PORT}                ║
╚════════════════════════════════════════╝

📌 Endpoints:
  POST   /create-payment
  GET    /payment-status/:id
  POST   /create-refund
  POST   /webhooks/molam
  GET    /health

🌐 Frontend:
  http://localhost:${PORT}/

🔑 API Key: ${process.env.MOLAM_SECRET_KEY || 'sk_test_demo'}
  `);
});
