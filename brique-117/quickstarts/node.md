# Quickstart Node.js — Molam Connect

## Installation

```bash
npm install molam-sdk
```

## Configuration

```javascript
import Molam from 'molam-sdk';

const molam = new Molam('sk_test_your_api_key');
```

## Créer un paiement

```javascript
async function createPayment() {
  try {
    const payment = await molam.payments.create({
      amount: 5000,      // 5000 FCFA (50.00 XOF)
      currency: 'XOF',
      method: 'wallet',
      customer: {
        phone: '+221771234567',
        name: 'Amadou Diallo'
      }
    });

    console.log('Paiement créé:', payment.id);
    console.log('Status:', payment.status);
  } catch (error) {
    console.error('Erreur:', error.message);
  }
}

createPayment();
```

## Récupérer un paiement

```javascript
async function getPayment(paymentId) {
  const payment = await molam.payments.retrieve(paymentId);
  console.log('Paiement:', payment);
}

getPayment('pay_1234567890');
```

## Créer un remboursement

```javascript
async function createRefund(paymentId) {
  const refund = await molam.refunds.create({
    payment_id: paymentId,
    reason: 'Demande du client'
  });

  console.log('Remboursement créé:', refund.id);
}
```

## Gérer les webhooks

```javascript
import express from 'express';
import crypto from 'crypto';

const app = express();

// Endpoint webhook
app.post('/webhooks/molam', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['molam-signature'];
  const payload = req.body;

  // Vérifier la signature
  const isValid = molam.webhooks.verifySignature(
    payload,
    signature,
    'whsec_your_webhook_secret'
  );

  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(payload);

  // Traiter l'événement
  switch (event.type) {
    case 'payment.succeeded':
      console.log('Paiement réussi:', event.data.id);
      break;
    case 'payment.failed':
      console.log('Paiement échoué:', event.data.id);
      break;
  }

  res.json({ received: true });
});

app.listen(3000);
```

## Exemple complet avec Express

```javascript
import express from 'express';
import Molam from 'molam-sdk';

const app = express();
const molam = new Molam(process.env.MOLAM_SECRET_KEY);

app.use(express.json());

// Route pour créer un paiement
app.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency, phone } = req.body;

    const payment = await molam.payments.create({
      amount,
      currency,
      method: 'wallet',
      customer: { phone }
    });

    res.json({ payment_id: payment.id, status: payment.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route pour vérifier le statut
app.get('/payment-status/:id', async (req, res) => {
  try {
    const payment = await molam.payments.retrieve(req.params.id);
    res.json({ status: payment.status });
  } catch (error) {
    res.status(404).json({ error: 'Payment not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Variables d'environnement

```env
MOLAM_SECRET_KEY=sk_test_your_api_key_here
MOLAM_WEBHOOK_SECRET=whsec_your_webhook_secret_here
PORT=3000
```

## Prochaines étapes

- [Documentation complète](https://docs.molam.com)
- [Exemples avancés](https://github.com/molam/examples)
- [SDK Reference](https://docs.molam.com/sdk/node)
