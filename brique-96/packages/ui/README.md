# @molam/ui

**Apple-like minimal UI components for Molam payment integration**

[![Version](https://img.shields.io/npm/v/@molam/ui.svg)](https://www.npmjs.com/package/@molam/ui)
[![License](https://img.shields.io/npm/l/@molam/ui.svg)](https://github.com/molam/molam-connect/blob/main/LICENSE)
[![WCAG AA](https://img.shields.io/badge/WCAG-AA-green.svg)](https://www.w3.org/WAI/WCAG2AA-Conformance)

Beautiful, accessible, and developer-friendly payment UI components for web applications.

---

## ✨ Features

- 🎨 **Apple-like Design** - Minimal, clean, modern interface
- ♿ **Accessibility First** - WCAG AA compliant, full keyboard navigation, screen reader support
- 🌍 **Multi-language** - Support for English, French, Wolof (and extensible)
- 💰 **Multi-currency** - Automatic formatting for 150+ currencies
- 🔒 **PCI Compliant** - Hosted fields for secure card tokenization
- 📱 **Offline Support** - QR and USSD fallbacks when network is unavailable
- 🤖 **SIRA AI Integration** - Smart payment method recommendations
- 🎯 **Molam ID Ready** - Seamless user prefill and authentication
- 📊 **Built-in Telemetry** - Track user interactions and conversions
- 🎭 **Themeable** - Light/dark mode with custom theming
- 📦 **Tree-shakeable** - Only import what you use
- ⚡ **Performance** - Lightweight, optimized bundle size

---

## 📦 Installation

```bash
npm install @molam/ui
# or
yarn add @molam/ui
# or
pnpm add @molam/ui
```

---

## 🚀 Quick Start

```tsx
import { CheckoutInline } from '@molam/ui';
import '@molam/ui/styles';

function App() {
  const handlePayment = async (payload) => {
    // Send payment request to your backend
    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return result;
  };

  return (
    <CheckoutInline
      amount={5000}          // Amount in smallest unit (e.g., cents, kobo)
      currency="XOF"         // ISO 4217 currency code
      locale="fr"            // BCP 47 locale (en, fr, wo)
      country="SN"           // ISO 3166-1 country code
      onSubmit={handlePayment}
      onEvent={(event) => {
        // Track telemetry events
        console.log(event);
      }}
    />
  );
}
```

---

## 📖 API Reference

### CheckoutInline

Main checkout component with all payment methods.

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `amount` | `number` | ✅ | Amount in smallest currency unit |
| `currency` | `string` | ✅ | ISO 4217 currency code (XOF, EUR, USD, etc.) |
| `onSubmit` | `(payload: PaymentPayload) => Promise<PaymentResult>` | ✅ | Payment submission handler |
| `locale` | `string` | No | BCP 47 locale code (default: `'en'`) |
| `country` | `string` | No | ISO 3166-1 country code |
| `molamIdToken` | `string` | No | Molam ID JWT token for user prefill |
| `onEvent` | `(event: TelemetryEvent) => void` | No | Telemetry event callback |
| `sira` | `SiraHints` | No | SIRA AI recommendations |
| `allowedMethods` | `PaymentMethod[]` | No | Allowed payment methods (default: all) |
| `theme` | `Theme` | No | Theme configuration (default: `'light'`) |
| `autoFocus` | `boolean` | No | Auto-focus first input (default: `false`) |
| `config` | `CheckoutConfig` | No | Additional configuration options |
| `className` | `string` | No | Custom CSS class name |
| `testId` | `string` | No | Test ID for automated testing |

#### PaymentPayload

```typescript
interface PaymentPayload {
  amount: number;
  currency: string;
  method: 'wallet' | 'card' | 'bank' | 'qr' | 'ussd';
  prefill?: UserPrefill;
  metadata?: Record<string, any>;
  idempotencyKey?: string;

  // Method-specific fields
  cardToken?: string;
  walletId?: string;
  bankAccount?: string;
  ussdCode?: string;
  qrData?: string;
}
```

#### PaymentResult

```typescript
interface PaymentResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  transactionId?: string;
  redirectUrl?: string;       // For 3DS or additional verification
  requiresAction?: boolean;
  qrCode?: string;
  ussdInstructions?: string;
}
```

---

## 🎨 Theming

### Built-in Themes

```tsx
// Light theme (default)
<CheckoutInline theme="light" {...props} />

// Dark theme
<CheckoutInline theme="dark" {...props} />
```

### Custom Theme

```tsx
<CheckoutInline
  theme={{
    primary: '#0a84ff',
    accent: '#30d158',
    background: '#ffffff',
    text: '#0b1220',
    error: '#ff3b30',
    success: '#30d158',
    border: '#d2d2d7',
  }}
  {...props}
/>
```

### CSS Tokens

Override design tokens using CSS variables:

```css
:root {
  --molam-primary: #0a84ff;
  --molam-radius: 10px;
  --molam-font-family: 'Inter', sans-serif;
}
```

See [styles/tokens.css](./styles/tokens.css) for all available tokens.

---

## 🌍 Internationalization

### Supported Locales

- `en` - English
- `fr` - French
- `wo` - Wolof (Senegal)

### Custom Translations

```tsx
import { getLocaleStrings } from '@molam/ui';

// Get locale strings
const strings = getLocaleStrings('fr');

console.log(strings.pay); // "Payer"
console.log(strings.wallet); // "Portefeuille Molam"
```

### Adding New Locales

Extend the locale system:

```tsx
import { TRANSLATIONS } from '@molam/ui/utils/locale';

TRANSLATIONS['es'] = {
  wallet: 'Cartera Molam',
  card: 'Tarjeta',
  pay: 'Pagar',
  // ... other strings
};
```

---

## 🤖 SIRA AI Integration

SIRA (Molam's AI engine) provides intelligent payment method recommendations.

```tsx
import { CheckoutInline } from '@molam/ui';

// Fetch SIRA hints from your backend
const siraHints = await fetch(`/api/sira/hints?amount=5000&user_id=${userId}`).then(r => r.json());

<CheckoutInline
  amount={5000}
  currency="XOF"
  sira={siraHints}
  onSubmit={handlePayment}
/>
```

### SiraHints Interface

```typescript
interface SiraHints {
  preferredMethod?: 'wallet' | 'card' | 'bank' | 'qr' | 'ussd';
  fraudScore?: number;          // 0-1 (lower is better)
  showWalletFirst?: boolean;
  recommendedRouting?: 'ma' | 'connect' | 'hybrid';
  reasons?: string[];
  confidence?: number;          // 0-1
  requireAdditionalVerification?: boolean;
}
```

**Example SIRA response:**

```json
{
  "preferredMethod": "wallet",
  "fraudScore": 0.15,
  "confidence": 0.87,
  "reasons": ["Lower fees", "Fast settlement"],
  "recommendedRouting": "ma"
}
```

---

## 🔑 Molam ID Integration

Prefill user data using Molam ID authentication.

```tsx
import { CheckoutInline } from '@molam/ui';

function PaymentPage() {
  const [molamIdToken, setMolamIdToken] = useState(null);

  useEffect(() => {
    // Initialize Molam ID SDK
    window.MolamID.onAuth((token) => {
      setMolamIdToken(token);
    });
  }, []);

  return (
    <CheckoutInline
      amount={5000}
      currency="XOF"
      molamIdToken={molamIdToken}
      onSubmit={handlePayment}
    />
  );
}
```

The component will automatically fetch user profile data (phone, email, name) and prefill forms.

---

## 🔒 PCI Compliance (Hosted Fields)

For card payments, use hosted fields to keep your application out of PCI scope.

### Backend: Generate Client Token

```javascript
// Node.js example
app.post('/api/hosted-fields/token', async (req, res) => {
  const token = await molam.hostedFields.createToken({
    merchantId: 'merchant_123',
    expiresIn: 300, // 5 minutes
  });

  res.json({ token });
});
```

### Frontend: Automatic Integration

The `CardInline` component automatically uses hosted fields:

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  allowedMethods={['card']}
  config={{
    features: {
      hostedFields: true, // Enabled by default
    },
  }}
  onSubmit={async (payload) => {
    // payload.cardToken contains the tokenized card
    return await processPayment(payload);
  }}
/>
```

---

## 📶 Offline Support

Automatic fallback to offline-capable payment methods when network is unavailable.

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  config={{
    features: {
      offlineMode: true, // Enable offline detection
      qrFallback: true,
      ussdFallback: true,
    },
  }}
  onSubmit={handlePayment}
/>
```

When offline:
- Component automatically switches to QR or USSD
- Shows offline indicator
- Emits `network_offline_detected` telemetry event

---

## 📊 Telemetry Events

Track user interactions for analytics and optimization.

```tsx
<CheckoutInline
  amount={5000}
  currency="XOF"
  onEvent={(event) => {
    // Send to your analytics service
    analytics.track(event.name, event.payload);

    // Or send to Molam telemetry
    fetch('/api/telemetry', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }}
/>
```

### Event Types

| Event Name | Payload | Description |
|------------|---------|-------------|
| `component_shown` | `{ amount, currency, allowedMethods }` | Component rendered |
| `payment_method_selected` | `{ method, previousMethod }` | User selected payment method |
| `checkout_start` | `{ method, amount, currency }` | Payment submission started |
| `checkout_success` | `{ method, transactionId }` | Payment succeeded |
| `checkout_failed` | `{ method, error, errorCode }` | Payment failed |
| `checkout_error` | `{ error }` | Network or validation error |
| `molam_id_prefill_success` | `{ hasPrefill }` | User data prefilled |
| `hosted_fields_mounted` | `{}` | Hosted fields iframe loaded |
| `card_tokenized` | `{ hasToken }` | Card successfully tokenized |
| `qr_code_generated` | `{ expiresIn }` | QR code displayed |
| `ussd_code_copied` | `{}` | USSD code copied |

---

## ♿ Accessibility

This component library is built with accessibility as a core principle.

### WCAG AA Compliance

- ✅ Keyboard navigation (Tab, Enter, Space, Arrow keys)
- ✅ Screen reader support (ARIA labels, live regions, announcements)
- ✅ Color contrast ratios >= 4.5:1
- ✅ Focus indicators
- ✅ Semantic HTML
- ✅ Error identification and description
- ✅ Reduced motion support

### Testing

```bash
# Run accessibility tests
npm run test:a11y

# Uses jest-axe for automated WCAG checks
```

### Screen Reader Testing

Tested with:
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (macOS, iOS)
- TalkBack (Android)

---

## 📱 Mobile Support

### React Native (Coming Soon)

```tsx
import { CheckoutInline } from '@molam/ui-native';

<CheckoutInline
  amount={5000}
  currency="XOF"
  onSubmit={handlePayment}
/>
```

For now, use the web component in a WebView or wait for `@molam/ui-native` package.

---

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Accessibility Tests

```bash
npm run test:a11y
```

### Example Test

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutInline } from '@molam/ui';

test('submits payment successfully', async () => {
  const onSubmit = jest.fn(async () => ({ success: true }));

  render(
    <CheckoutInline
      amount={5000}
      currency="XOF"
      onSubmit={onSubmit}
    />
  );

  const submitButton = screen.getByRole('button', { name: /pay/i });
  await userEvent.click(submitButton);

  expect(onSubmit).toHaveBeenCalled();
});
```

---

## 🛠️ Utilities

### Currency Formatting

```tsx
import { formatCurrency, convertToMajorUnit } from '@molam/ui';

formatCurrency(5000, 'XOF', 'fr'); // "5 000 FCFA"
formatCurrency(1250, 'USD', 'en'); // "$12.50"

convertToMajorUnit(5000, 'XOF'); // 5000 (zero-decimal currency)
convertToMajorUnit(1250, 'USD'); // 12.50
```

### Network Detection

```tsx
import { detectNetworkStatus, canPerformOperation } from '@molam/ui';

const status = await detectNetworkStatus();
// { isOnline: true, quality: 'excellent', latency: 45 }

const canUseCard = await canPerformOperation('card');
// true if online, false if offline
```

### Locale Detection

```tsx
import { detectUserLocale, isSupportedLocale } from '@molam/ui';

const locale = detectUserLocale(); // "fr-SN"
const supported = isSupportedLocale(locale); // true
```

---

## 📦 Bundle Size

| Package | Size (gzip) |
|---------|-------------|
| Core component | ~12 KB |
| Styles | ~8 KB |
| Utilities | ~4 KB |
| **Total** | **~24 KB** |

Tree-shakeable - only import what you use:

```tsx
// Import only what you need
import { CheckoutInline } from '@molam/ui';
import { formatCurrency } from '@molam/ui/utils/currency';
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run Storybook
npm run storybook

# Build package
npm run build
```

---

## 📄 License

Proprietary - © 2025 Molam. All rights reserved.

For licensing inquiries, contact: licensing@molam.com

---

## 🆘 Support

- **Documentation:** https://docs.molam.com/ui
- **Issues:** https://github.com/molam/molam-connect/issues
- **Discord:** https://discord.gg/molam
- **Email:** support@molam.com

---

## 🗺️ Roadmap

- [x] Web components (React)
- [x] Hosted fields (PCI compliance)
- [x] SIRA AI integration
- [x] Molam ID integration
- [x] Offline support (QR/USSD)
- [ ] React Native components
- [ ] Vue.js adapter
- [ ] Svelte adapter
- [ ] Web Components (framework-agnostic)
- [ ] Payment request API integration
- [ ] Apple Pay / Google Pay

---

## 📸 Screenshots

### Light Theme

![Light theme checkout](./docs/screenshots/light-theme.png)

### Dark Theme

![Dark theme checkout](./docs/screenshots/dark-theme.png)

### Wallet Payment

![Wallet payment](./docs/screenshots/wallet.png)

### Card Payment (Hosted Fields)

![Card payment](./docs/screenshots/card.png)

---

**Made with ❤️ by the Molam Platform Team**
