# Molam SDK - Node.js/TypeScript

Official server-side SDK for Molam payments platform.

**Version**: 2.0.0
**Status**: Production Ready

---

## 🚀 Installation

```bash
npm install @molam/sdk-node
```

---

## 📖 Quick Start

```typescript
import { MolamClient } from "@molam/sdk-node";

const client = new MolamClient({
  baseUrl: "https://api.molam.com",
  apiKey: process.env.MOLAM_API_KEY!
});

// Create payment intent
const intent = await client.payments.create({
  amount: 5000,
  currency: "XOF",
  merchantId: "m_123",
  description: "Order #1234",
  metadata: { orderId: "1234" }
});

console.log("Payment Intent:", intent.id);

// Confirm payment
const confirmed = await client.payments.confirm(intent.id);
console.log("Status:", confirmed.status); // "succeeded"
```

---

## 📚 API Reference

### Initialize Client

```typescript
const client = new MolamClient({
  baseUrl: string,        // Required: API base URL
  apiKey: string,         // Required: API secret key
  timeoutMs?: number,     // Optional: Request timeout (default: 8000ms)
  maxRetries?: number     // Optional: Max retries (default: 3)
});
```

### Payment Intents

#### Create

```typescript
const intent = await client.payments.create({
  amount: number,         // Required: Amount in smallest unit (cents)
  currency: string,       // Required: ISO currency code (XOF, USD, etc.)
  merchantId: string,     // Required: Merchant ID
  description?: string,   // Optional: Payment description
  metadata?: object,      // Optional: Custom metadata
  customerId?: string     // Optional: Customer ID
});
```

#### Retrieve

```typescript
const intent = await client.payments.retrieve("pi_123");
```

#### Confirm

```typescript
const confirmed = await client.payments.confirm("pi_123");
```

#### Cancel

```typescript
const canceled = await client.payments.cancel("pi_123");
```

#### List

```typescript
const intents = await client.payments.list({
  limit: 10,
  starting_after: "pi_123"
});
```

### Refunds

#### Create

```typescript
const refund = await client.refunds.create(
  {
    paymentId: "pi_123",
    amount: 5000,
    reason: "customer_request",
    metadata: { note: "Duplicate payment" }
  },
  "ik_refund_123"  // Optional idempotency key
);
```

#### Retrieve

```typescript
const refund = await client.refunds.retrieve("re_123");
```

#### List

```typescript
const refunds = await client.refunds.list({
  limit: 10
});
```

### Webhooks

#### Verify Signature

```typescript
const isValid = await MolamClient.verifyWebhook(
  rawBody: Buffer | string,      // Raw request body
  signatureHeader: string,        // Molam-Signature header
  getSecret: (kid: string) => string  // Function to get secret by key ID
);
```

**Example with Express**:

```typescript
import express from "express";
import bodyParser from "body-parser";

const app = express();

// Use raw body parser for webhook signature verification
app.use(bodyParser.raw({ type: "application/json" }));

app.post("/webhooks/molam", async (req, res) => {
  const signature = req.headers["molam-signature"] as string;

  try {
    const isValid = await MolamClient.verifyWebhook(
      req.body,
      signature,
      (kid) => process.env.MOLAM_WEBHOOK_SECRET!
    );

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString());

    // Handle event
    switch (event.type) {
      case "payment.succeeded":
        // Handle successful payment
        console.log("Payment succeeded:", event.data);
        break;
      // ... other event types
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(400).send("Webhook error");
  }
});
```

#### Create Endpoint

```typescript
const endpoint = await client.webhooks.createEndpoint(
  "merchant",            // Tenant type
  "m_123",              // Tenant ID
  "https://mysite.com/webhooks",  // Webhook URL
  ["payment.succeeded", "refund.created"]  // Events to subscribe to
);
```

---

## 🔒 Security

### API Keys

```typescript
// ❌ NEVER hardcode keys
const client = new MolamClient({
  baseUrl: "https://api.molam.com",
  apiKey: "sk_live_xxxxx" // ❌ BAD!
});

// ✅ Use environment variables
const client = new MolamClient({
  baseUrl: "https://api.molam.com",
  apiKey: process.env.MOLAM_API_KEY! // ✅ GOOD!
});
```

### Webhook Signature Verification

Always verify webhook signatures to prevent spoofing:

```typescript
// Verify before processing
const isValid = await MolamClient.verifyWebhook(rawBody, signature, getSecret);
if (!isValid) {
  throw new Error("Invalid signature");
}
```

---

## 🧪 Testing

```bash
npm test
```

**With coverage**:
```bash
npm test -- --coverage
```

---

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration
MOLAM_API_KEY=sk_test_xxxxx
MOLAM_BASE_URL=https://api.molam.com

# Webhook Configuration
MOLAM_WEBHOOK_SECRET=whsec_xxxxx

# Logging
MOLAM_LOG_LEVEL=info  # error, warn, info
```

### Error Handling

```typescript
import { MolamError } from "@molam/sdk-node";

try {
  const intent = await client.payments.create({...});
} catch (error) {
  if (error instanceof MolamError) {
    console.error("Error code:", error.code);
    console.error("Status:", error.status);
    console.error("Request ID:", error.requestId);
    console.error("Details:", error.details);
  }
}
```

---

## 📊 Observability

### Logging

```typescript
// Set log level via environment variable
process.env.MOLAM_LOG_LEVEL = "info";

// Logs will output:
// [molam:info] HTTP POST /v1/payment_intents attempt=1
// [molam:warn] HTTP error POST /v1/payment_intents status=429 attempt=1
```

### Request IDs

All errors include request IDs for debugging:

```typescript
catch (error) {
  console.log("Request ID:", error.requestId); // For support tickets
}
```

---

## 💡 Examples

See [`src/examples/`](src/examples/) for complete examples:

- [Webhook Receiver](src/examples/webhook_receiver.ts) - Express webhook handler with signature verification

---

## 🤝 Support

- **Documentation**: https://docs.molam.com
- **API Reference**: https://docs.molam.com/api
- **Support Email**: support@molam.co

---

## 📝 License

UNLICENSED - Proprietary

Copyright © 2025 Molam Labs
