# Molam UI Integration Guide

Complete guide for integrating `@molam/ui` into your application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Backend Integration](#backend-integration)
5. [Advanced Configuration](#advanced-configuration)
6. [Production Checklist](#production-checklist)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required
- **Node.js**: 16.x or higher
- **React**: 18.0.0 or higher
- **TypeScript**: 4.9 or higher (recommended)

### Backend Requirements
- Payment API endpoint to process payments
- JWT authentication (optional, for Molam ID)
- SIRA API integration (optional, for smart routing)
- PCI tokenization server (for card payments)

---

## Installation

### 1. Install the package

```bash
npm install @molam/ui
# or
yarn add @molam/ui
# or
pnpm add @molam/ui
```

### 2. Install peer dependencies (if not already installed)

```bash
npm install react react-dom
```

### 3. Import styles in your app

```tsx
// In your main App.tsx or index.tsx
import '@molam/ui/styles';
```

---

## Quick Start

### Basic Checkout Component

```tsx
import React from 'react';
import { CheckoutInline } from '@molam/ui';
import type { PaymentPayload, PaymentResult } from '@molam/ui';
import '@molam/ui/styles';

export function CheckoutPage() {
  const handlePayment = async (payload: PaymentPayload): Promise<PaymentResult> => {
    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Payment failed');
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Payment failed',
        errorCode: 'PAYMENT_ERROR',
      };
    }
  };

  return (
    <div className="container">
      <h1>Checkout</h1>
      <CheckoutInline
        amount={5000} // Amount in minor units (e.g., 5000 = 50.00 XOF)
        currency="XOF"
        locale="fr"
        country="SN"
        onSubmit={handlePayment}
      />
    </div>
  );
}
```

---

## Backend Integration

### Payment API Endpoint

Create a backend endpoint to process payments:

```typescript
// /api/payments/create (Node.js/Express example)
import express from 'express';
import { MolamConnect } from '@molam/connect';

const app = express();
const molam = new MolamConnect({
  apiKey: process.env.MOLAM_API_KEY!,
  environment: 'production',
});

app.post('/api/payments/create', async (req, res) => {
  try {
    const { amount, currency, method, cardToken, walletId, metadata } = req.body;

    // Create payment with Molam Connect
    const payment = await molam.payments.create({
      amount,
      currency,
      method,
      cardToken, // For card payments
      walletId, // For wallet payments
      metadata: {
        orderId: metadata?.orderId,
        customerId: metadata?.customerId,
      },
      idempotencyKey: req.headers['idempotency-key'],
    });

    if (payment.status === 'succeeded') {
      res.json({
        success: true,
        transactionId: payment.id,
      });
    } else if (payment.status === 'requires_action') {
      res.json({
        success: false,
        requiresAction: true,
        redirectUrl: payment.nextAction.redirectUrl,
      });
    } else {
      res.status(400).json({
        success: false,
        error: payment.failureReason || 'Payment failed',
        errorCode: payment.failureCode,
      });
    }
  } catch (error: any) {
    console.error('Payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      errorCode: 'SERVER_ERROR',
    });
  }
});
```

### SIRA Hints Endpoint (Optional)

If using SIRA AI for smart routing:

```typescript
// /api/sira/hints
app.get('/api/sira/hints', async (req, res) => {
  const { user_id, amount, currency, country } = req.query;

  try {
    const hints = await molam.sira.getRoutingHints({
      userId: user_id as string,
      amount: parseInt(amount as string),
      currency: currency as string,
      country: country as string,
    });

    res.json({
      preferredMethod: hints.preferredMethod,
      fraudScore: hints.fraudScore,
      confidence: hints.confidence,
      reasons: hints.reasons,
    });
  } catch (error) {
    console.error('SIRA error:', error);
    res.json({}); // Return empty hints on error (graceful degradation)
  }
});
```

### Hosted Fields Token Endpoint (For Card Payments)

```typescript
// /api/payments/token
app.post('/api/payments/token', async (req, res) => {
  try {
    // Generate client token for hosted fields
    const clientToken = await molam.tokens.create({
      type: 'client',
      expiresIn: 3600, // 1 hour
    });

    res.json({ clientToken: clientToken.token });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});
```

---

## Advanced Configuration

### With Molam ID (User Prefill)

```tsx
import { CheckoutInline } from '@molam/ui';
import { useState, useEffect } from 'react';

export function CheckoutWithMolamID() {
  const [molamIdToken, setMolamIdToken] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Molam ID SDK
    if (typeof window !== 'undefined' && (window as any).MolamID) {
      (window as any).MolamID.onAuthChange((token: string | null) => {
        setMolamIdToken(token);
      });
    }
  }, []);

  return (
    <CheckoutInline
      amount={10000}
      currency="XOF"
      locale="fr"
      molamIdToken={molamIdToken || undefined}
      onSubmit={async (payload) => {
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: molamIdToken ? `Bearer ${molamIdToken}` : '',
          },
          body: JSON.stringify(payload),
        });
        return await response.json();
      }}
    />
  );
}
```

### With SIRA AI Hints

```tsx
import { CheckoutInline } from '@molam/ui';
import { useState, useEffect } from 'react';
import type { SiraHints } from '@molam/ui';

export function SmartCheckout({ userId, amount }: { userId: string; amount: number }) {
  const [siraHints, setSiraHints] = useState<SiraHints | null>(null);

  useEffect(() => {
    // Fetch SIRA hints on mount
    fetch(`/api/sira/hints?user_id=${userId}&amount=${amount}&currency=XOF`)
      .then((res) => res.json())
      .then((hints) => setSiraHints(hints))
      .catch((err) => console.error('SIRA fetch error:', err));
  }, [userId, amount]);

  return (
    <CheckoutInline
      amount={amount}
      currency="XOF"
      locale="fr"
      sira={siraHints || undefined}
      onSubmit={async (payload) => {
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await response.json();
      }}
      onEvent={(event) => {
        // Track user behavior
        if (event.name === 'payment_method_selected') {
          console.log('User selected:', event.payload.method);
        }
      }}
    />
  );
}
```

### Dark Theme

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  theme="dark"
  onSubmit={handlePayment}
/>
```

### Custom Theme

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  theme={{
    primary: '#7c3aed',
    accent: '#10b981',
    background: '#ffffff',
    text: '#1f2937',
    error: '#ef4444',
    success: '#10b981',
    border: '#e5e7eb',
  }}
  onSubmit={handlePayment}
/>
```

### Restrict Payment Methods

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  allowedMethods={['wallet', 'card']} // Only show wallet and card
  onSubmit={handlePayment}
/>
```

### Offline Support (QR/USSD Fallback)

```tsx
<CheckoutInline
  amount={2500}
  currency="XOF"
  config={{
    features: {
      offlineMode: true,
      qrFallback: true,
      ussdFallback: true,
    },
  }}
  onSubmit={handlePayment}
/>
```

---

## Production Checklist

### Security
- [ ] Use HTTPS in production
- [ ] Validate all payment requests on backend
- [ ] Implement rate limiting on payment endpoints
- [ ] Use JWT for Molam ID authentication
- [ ] Enable PCI tokenization for card payments
- [ ] Sanitize user inputs
- [ ] Implement idempotency keys for duplicate protection

### Performance
- [ ] Enable tree-shaking in your bundler
- [ ] Lazy load checkout component if not immediately visible
- [ ] Use production build of React
- [ ] Enable gzip/brotli compression
- [ ] Optimize images and assets
- [ ] Use CDN for static assets

### Monitoring
- [ ] Track payment telemetry events
- [ ] Monitor error rates
- [ ] Set up alerts for failed payments
- [ ] Track conversion rates by payment method
- [ ] Monitor latency of payment API

### Accessibility
- [ ] Test with keyboard navigation (Tab, Enter, Space)
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)
- [ ] Verify color contrast >= 4.5:1
- [ ] Test with browser zoom at 200%
- [ ] Test with high contrast mode enabled

### Mobile
- [ ] Test on iOS Safari
- [ ] Test on Android Chrome
- [ ] Verify touch targets are >= 44x44px
- [ ] Test in portrait and landscape
- [ ] Test with slow network (3G simulation)

### Localization
- [ ] Verify translations for all supported languages
- [ ] Test currency formatting for all currencies
- [ ] Test with RTL languages (if applicable)
- [ ] Verify date/time formats match locale

---

## Troubleshooting

### "Module not found: '@molam/ui'"

**Solution**: Ensure the package is installed:
```bash
npm install @molam/ui
```

### Styles not loading

**Solution**: Import styles in your main app file:
```tsx
import '@molam/ui/styles';
```

### TypeScript errors

**Solution**: Ensure you have the latest version of TypeScript (4.9+) and that type declarations are included:
```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

### Card tokenization not working

**Solution**: Verify your tokenization server is running and accessible:
```tsx
<CheckoutInline
  config={{
    hostedFields: {
      tokenizationUrl: 'https://your-domain.com/api/payments/token',
    },
  }}
  // ...
/>
```

### Network detection not working

**Solution**: Ensure your app has a `/api/ping` endpoint:
```typescript
// /api/ping
app.head('/api/ping', (req, res) => {
  res.status(200).end();
});
```

### SIRA hints not applying

**Solution**: Verify SIRA response format matches the expected interface:
```typescript
interface SiraHints {
  preferredMethod?: 'wallet' | 'card' | 'bank' | 'ussd' | 'qr';
  fraudScore?: number; // 0-1
  confidence?: number; // 0-1
}
```

---

## Support

- **Documentation**: [https://docs.molam.co/ui](https://docs.molam.co/ui)
- **GitHub Issues**: [https://github.com/molam/ui/issues](https://github.com/molam/ui/issues)
- **Discord**: [https://discord.gg/molam](https://discord.gg/molam)
- **Email**: support@molam.co

---

## Next Steps

1. **Test in sandbox**: Use test API keys to verify integration
2. **Implement webhooks**: Listen for payment status changes
3. **Add analytics**: Track conversion rates and user behavior
4. **Set up monitoring**: Monitor payment success rates and latency
5. **Go live**: Switch to production API keys and deploy

For more examples, see [examples/](./examples) directory.
