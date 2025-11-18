# Brique 96 — Quick Reference

Fast reference for developers working with Brique 96.

---

## Part 1: Monitoring & Observability

### Quick Start

```bash
# 1. Deploy observability stack
kubectl apply -f brique-95/k8s/prometheus/
kubectl apply -f brique-95/k8s/grafana/

# 2. Import Grafana dashboards
kubectl apply -f brique-95/grafana/

# 3. Deploy synthetic checks
kubectl apply -f brique-95/k8s/synthetic-check-cronjob.yaml

# 4. Configure Alertmanager secrets
kubectl create secret generic alertmanager-config \
  --from-literal=pagerduty-key=YOUR_KEY \
  --from-literal=slack-webhook=YOUR_WEBHOOK \
  -n molam-routing
```

### Key Endpoints

| Endpoint | Purpose | Port |
|----------|---------|------|
| `/metrics` | Prometheus metrics | 8082 |
| `/health` | Health check | 8082 |
| Grafana | Dashboards | 3000 |
| Prometheus | Metrics DB | 9090 |
| Alertmanager | Alerts | 9093 |

### Important Metrics

```promql
# Request rate
rate(routing_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(routing_request_duration_seconds_bucket[5m]))

# Error rate
rate(routing_requests_total{result="fail"}[5m]) / rate(routing_requests_total[5m])

# Cache hit rate
rate(routing_cache_hit_total[5m]) / (rate(routing_cache_hit_total[5m]) + rate(routing_cache_miss_total[5m]))

# SIRA latency
histogram_quantile(0.95, rate(routing_sira_latency_seconds_bucket[5m]))
```

### Grafana Dashboards

1. **Routing Overview** - QPS, latency, decisions by route
2. **SIRA Health** - SIRA API health and ML confidence
3. **Cache & Redis** - Cache performance and Redis metrics
4. **SLO & Error Budget** - Availability and latency SLIs

### Run Chaos Tests

```bash
# Redis outage test (3 minutes)
bash brique-95/tests/chaos/redis-outage-test.sh

# SIRA outage test (5 minutes)
bash brique-95/tests/chaos/sira-outage-test.sh
```

### SLOs

| SLI | Target | Alert Threshold |
|-----|--------|----------------|
| Availability | 99.95% | <99.9% over 5m |
| P95 Latency | <120ms | >150ms over 5m |
| Error Rate | <0.1% | >0.5% over 5m |

---

## Part 2: UI Components

### Quick Start

```bash
# 1. Install package
npm install @molam/ui

# 2. Import styles in your app
import '@molam/ui/styles';

# 3. Use component
import { CheckoutInline } from '@molam/ui';

<CheckoutInline
  amount={5000}
  currency="XOF"
  locale="fr"
  onSubmit={async (payload) => {
    const res = await fetch('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return await res.json();
  }}
/>
```

### Development Commands

```bash
cd brique-96/packages/ui

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linter
npm run lint

# Type check
npm run type-check

# Build package
npm run build

# Start Storybook
npm run storybook

# Build Storybook
npm run build-storybook
```

### Component Props

```typescript
interface CheckoutInlineProps {
  // Required
  amount: number;              // Minor units (5000 = 50.00)
  currency: string;            // ISO 4217 code (XOF, USD, EUR)
  onSubmit: (payload: PaymentPayload) => Promise<PaymentResult>;

  // Optional
  locale?: string;             // en, fr, wo (default: 'en')
  country?: string;            // SN, CI, ML, etc.
  theme?: 'light' | 'dark' | CustomTheme;
  allowedMethods?: PaymentMethod[];  // ['wallet', 'card', ...]
  sira?: SiraHints;            // AI routing hints
  molamIdToken?: string;       // JWT for prefill
  autoFocus?: boolean;
  config?: CheckoutConfig;
  onEvent?: (event: TelemetryEvent) => void;
  className?: string;
  testId?: string;
}
```

### Payment Payload

```typescript
interface PaymentPayload {
  amount: number;
  currency: string;
  method: 'wallet' | 'card' | 'bank' | 'qr' | 'ussd';
  cardToken?: string;          // For card payments
  walletId?: string;           // For wallet payments
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}
```

### Payment Result

```typescript
interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  errorCode?: string;
  redirectUrl?: string;
  requiresAction?: boolean;
}
```

### SIRA Hints

```typescript
interface SiraHints {
  preferredMethod?: 'wallet' | 'card' | 'bank' | 'qr' | 'ussd';
  fraudScore?: number;         // 0-1 (0 = safe, 1 = risky)
  confidence?: number;         // 0-1
  reasons?: string[];
  requireAdditionalVerification?: boolean;
}
```

### Telemetry Events

```typescript
// Payment method selected
{ name: 'payment_method_selected', payload: { method: 'wallet' } }

// Payment initiated
{ name: 'payment_initiated', payload: { method: 'wallet', amount: 5000, currency: 'XOF' } }

// Payment succeeded
{ name: 'payment_succeeded', payload: { transactionId: 'txn_123' } }

// Payment failed
{ name: 'payment_failed', payload: { error: 'Insufficient funds' } }
```

### Common Use Cases

#### Basic Checkout
```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  locale="fr"
  onSubmit={handlePayment}
/>
```

#### With SIRA Hints
```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  sira={{
    preferredMethod: 'wallet',
    confidence: 0.95,
    reasons: ['High wallet success rate'],
  }}
  onSubmit={handlePayment}
/>
```

#### Dark Theme
```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  theme="dark"
  onSubmit={handlePayment}
/>
```

#### Wallet Only
```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  allowedMethods={['wallet']}
  onSubmit={handlePayment}
/>
```

#### Offline Support
```tsx
<CheckoutInline
  amount={5000}
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

### Backend Integration

#### Payment Endpoint
```typescript
// POST /api/payments/create
app.post('/api/payments/create', async (req, res) => {
  const { amount, currency, method, cardToken, walletId } = req.body;

  const payment = await molam.payments.create({
    amount,
    currency,
    method,
    cardToken,
    walletId,
    idempotencyKey: req.headers['idempotency-key'],
  });

  if (payment.status === 'succeeded') {
    res.json({ success: true, transactionId: payment.id });
  } else {
    res.json({ success: false, error: payment.failureReason });
  }
});
```

#### SIRA Hints Endpoint
```typescript
// GET /api/sira/hints
app.get('/api/sira/hints', async (req, res) => {
  const { user_id, amount } = req.query;

  const hints = await molam.sira.getRoutingHints({
    userId: user_id,
    amount: parseInt(amount),
  });

  res.json({
    preferredMethod: hints.preferredMethod,
    fraudScore: hints.fraudScore,
    confidence: hints.confidence,
  });
});
```

#### Tokenization Endpoint
```typescript
// POST /api/payments/token
app.post('/api/payments/token', async (req, res) => {
  const clientToken = await molam.tokens.create({
    type: 'client',
    expiresIn: 3600,
  });

  res.json({ clientToken: clientToken.token });
});
```

---

## Utilities Reference

### Currency Formatting

```typescript
import { formatCurrency, convertToMajorUnit } from '@molam/ui';

formatCurrency(5000, 'XOF', 'fr');  // "5 000 XOF"
formatCurrency(5000, 'USD', 'en');  // "$50.00"
convertToMajorUnit(5000, 'XOF');    // 5000 (zero-decimal)
convertToMajorUnit(5000, 'USD');    // 50.00 (two-decimal)
```

### Locale Translation

```typescript
import { getLocaleStrings, formatNumber } from '@molam/ui';

const strings = getLocaleStrings('fr');
console.log(strings.wallet);  // "Portefeuille Molam"

formatNumber(5000, 'fr');  // "5 000"
formatNumber(5000, 'en');  // "5,000"
```

### Network Detection

```typescript
import { detectNetworkStatus, monitorNetworkStatus } from '@molam/ui';

const status = await detectNetworkStatus();
console.log(status);
// { isOnline: true, quality: 'good', latency: 150 }

monitorNetworkStatus((status) => {
  if (!status.isOnline) {
    console.log('Network offline - switching to QR/USSD');
  }
});
```

---

## Testing

### Run Tests

```bash
# Unit tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Accessibility tests only
npm test -- CheckoutInline.a11y.test.tsx
```

### Accessibility Testing

```typescript
import { axe } from 'jest-axe';

it('should have no a11y violations', async () => {
  const { container } = render(<CheckoutInline {...props} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing Checklist

- [ ] Keyboard navigation (Tab, Enter, Space)
- [ ] Screen reader (NVDA, JAWS, VoiceOver)
- [ ] Color contrast >= 4.5:1
- [ ] Mobile responsive
- [ ] Dark theme
- [ ] Offline fallback
- [ ] Error handling
- [ ] Loading states

---

## Troubleshooting

### Styles not loading
```tsx
// Add this to your main app file
import '@molam/ui/styles';
```

### TypeScript errors
```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

### Network detection not working
```typescript
// Add ping endpoint to your backend
app.head('/api/ping', (req, res) => {
  res.status(200).end();
});
```

### Card tokenization failing
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

---

## Resources

- **Full Documentation**: [README.md](./packages/ui/README.md)
- **Integration Guide**: [INTEGRATION_GUIDE.md](./packages/ui/INTEGRATION_GUIDE.md)
- **Contributing**: [CONTRIBUTING.md](./packages/ui/CONTRIBUTING.md)
- **Changelog**: [CHANGELOG.md](./packages/ui/CHANGELOG.md)
- **Examples**: [examples/](./packages/ui/examples/)
- **Storybook**: Run `npm run storybook`

---

## Support

- **GitHub**: [github.com/molam/ui/issues](https://github.com/molam/ui/issues)
- **Discord**: [discord.gg/molam](https://discord.gg/molam)
- **Email**: support@molam.co
