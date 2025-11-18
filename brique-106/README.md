# Brique 106 — SDK Client-Side JavaScript (Web & React Native)

**Production-Ready Client-Side SDKs for Molam Form Integration**

Multi-platform payment SDK for Web, iOS, and Android.

---

## 🎯 Objectif

Construire un SDK client-side JavaScript complet et industriel pour Molam Form, permettant aux marchands d'intégrer Molam en un clic (plug & play) dans leurs sites web ou apps mobiles, sans écrire de logique serveur compliquée.

---

## 📦 Packages

This repository contains two packages:

### 1. Web SDK (`@molam/form-web`)

Client-side JavaScript SDK for web applications.

**Features**:
- 🔒 **PCI Compliant**: Hosted iFrame fields isolate card data
- 🎨 **Customizable**: Theming, fonts, styles
- 🌍 **Multi-Language**: i18n support
- 💳 **3DS/OTP**: Built-in authentication flows
- ⚡ **Lightweight**: ~15KB gzipped
- 📱 **Responsive**: Mobile-optimized UI

**Installation**:
```bash
npm install @molam/form-web
```

**Quick Start**:
```javascript
import MolamForm from '@molam/form-web';

const molam = new MolamForm({
  publishableKey: 'pk_test_...'
});

await molam.mount('#payment-form');

// Listen for events
molam.on('payment:success', (data) => {
  console.log('Payment succeeded!', data);
});

// Create token
const token = await molam.createToken();
```

### 2. React Native SDK (`@molam/form-react-native`)

Native mobile SDK for iOS and Android.

**Features**:
- 📱 **Native UI**: Platform-specific payment sheets
- 🔐 **Secure**: Native tokenization (no card data in JS)
- ⚡ **Fast**: Native performance
- 🎯 **Type-Safe**: Full TypeScript support
- 📲 **3DS/OTP**: Native authentication flows
- 🌐 **Offline Ready**: Queue for offline payments

**Installation**:
```bash
npm install @molam/form-react-native
cd ios && pod install
```

**Quick Start**:
```typescript
import MolamForm from '@molam/form-react-native';

// Initialize
await MolamForm.initialize({
  publishableKey: 'pk_test_...'
});

// Tokenize card
const token = await MolamForm.createToken({
  cardNumber: '4242424242424242',
  expMonth: 12,
  expYear: 2026,
  cvc: '123'
});

// Confirm payment
const payment = await MolamForm.confirmPayment(
  'pi_123',
  'pi_123_secret_abc'
);
```

---

## 🏗️ Architecture

### Web SDK

```
web-sdk/
├── src/
│   ├── molam-form.ts         # Main SDK class
│   ├── hosted-fields.ts      # Hosted iFrame fields
│   ├── types.ts              # TypeScript definitions
│   ├── validators.ts         # Input validation
│   └── utils.ts              # Utilities
├── dist/                     # Built files (UMD + ESM)
└── package.json
```

**Key Concepts**:
- **Hosted Fields**: Card data never touches merchant's domain
- **iFrame Isolation**: PCI DSS compliance via secure iFrames
- **Event System**: Rich event model for payment lifecycle
- **Tokenization**: Secure card tokenization API
- **3DS/OTP**: Automated authentication flows

### React Native SDK

```
react-native-sdk/
├── src/
│   └── index.tsx             # TypeScript SDK
├── ios/
│   └── MolamFormBridge.swift # iOS native bridge
├── android/
│   └── MolamFormBridge.kt    # Android native bridge
└── package.json
```

**Key Concepts**:
- **Native Bridges**: Swift (iOS) and Kotlin (Android)
- **Event Emitters**: React Native event system
- **Native UI**: Platform-specific payment sheets
- **Promises**: Async/await API
- **Type Safety**: Full TypeScript definitions

---

## 🚀 Features

### Security

- ✅ **PCI DSS Compliant**: Hosted fields isolate sensitive data
- ✅ **HMAC Signatures**: Webhook verification
- ✅ **TLS Only**: HTTPS enforced
- ✅ **Tokenization**: Card data never hits merchant servers
- ✅ **3DS2 Support**: Strong Customer Authentication (SCA)
- ✅ **OTP Flows**: SMS/biometric authentication

### User Experience

- ✅ **Apple-Like Design**: Minimal, elegant UI
- ✅ **Responsive**: Mobile-optimized
- ✅ **Accessibility**: WCAG 2.1 AA compliant
- ✅ **Multi-Language**: 15+ languages supported
- ✅ **Multi-Currency**: 50+ currencies
- ✅ **Brand Detection**: Auto-detect card brand
- ✅ **Smart Validation**: Real-time input validation

### Developer Experience

- ✅ **TypeScript**: Full type definitions
- ✅ **Zero Dependencies**: Lightweight bundle
- ✅ **Tree Shakeable**: Optimize bundle size
- ✅ **Event-Driven**: Rich event system
- ✅ **Comprehensive Docs**: Examples for all frameworks
- ✅ **Testing Tools**: Mock adapters for testing

---

## 📚 Examples

### Web - Plain HTML/JS

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://js.molam.com/v1/molam-form.js"></script>
</head>
<body>
  <div id="payment-form"></div>

  <script>
    const molam = new MolamForm({
      publishableKey: 'pk_test_...'
    });

    molam.mount('#payment-form');

    molam.on('payment:success', (data) => {
      alert('Payment successful!');
    });
  </script>
</body>
</html>
```

### Web - React

```typescript
import React, { useEffect, useRef } from 'react';
import MolamForm from '@molam/form-web';

export function CheckoutForm() {
  const formRef = useRef<HTMLDivElement>(null);
  const molamRef = useRef<MolamForm | null>(null);

  useEffect(() => {
    const molam = new MolamForm({
      publishableKey: 'pk_test_...',
      theme: 'minimal',
      locale: 'en',
    });

    molam.mount(formRef.current!);

    molam.on('payment:success', (data) => {
      console.log('Payment successful!', data);
    });

    molamRef.current = molam;

    return () => {
      molam.unmount();
    };
  }, []);

  const handleSubmit = async () => {
    try {
      const token = await molamRef.current?.createToken();
      console.log('Token:', token);

      // Send token to your server
      const response = await fetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token?.id }),
      });

      const result = await response.json();
      console.log('Payment result:', result);
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  return (
    <div>
      <div ref={formRef}></div>
      <button onClick={handleSubmit}>Pay Now</button>
    </div>
  );
}
```

### React Native

```typescript
import React, { useState } from 'react';
import { View, Button, TextInput, Alert } from 'react-native';
import MolamForm from '@molam/form-react-native';

export function CheckoutScreen() {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const handlePay = async () => {
    try {
      // Tokenize card
      const token = await MolamForm.createToken({
        cardNumber: cardNumber.replace(/\s/g, ''),
        expMonth: parseInt(expiry.split('/')[0]),
        expYear: parseInt('20' + expiry.split('/')[1]),
        cvc: cvc,
      });

      // Send token to server
      const response = await fetch('https://your-api.com/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.id }),
      });

      const payment = await response.json();

      if (payment.status === 'succeeded') {
        Alert.alert('Success', 'Payment successful!');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        placeholder="Card Number"
        value={cardNumber}
        onChangeText={setCardNumber}
        keyboardType="numeric"
      />
      <TextInput
        placeholder="MM/YY"
        value={expiry}
        onChangeText={setExpiry}
        keyboardType="numeric"
      />
      <TextInput
        placeholder="CVC"
        value={cvc}
        onChangeText={setCvc}
        keyboardType="numeric"
        secureTextEntry
      />
      <Button title="Pay Now" onPress={handlePay} />
    </View>
  );
}
```

---

## 🎨 Customization

### Theming

```javascript
const molam = new MolamForm({
  publishableKey: 'pk_test_...',
  theme: 'dark',
  styles: {
    base: {
      color: '#32325d',
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  },
  fonts: [
    {
      family: 'Inter',
      src: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
    }
  ]
});
```

### Localization

```javascript
const molam = new MolamForm({
  publishableKey: 'pk_test_...',
  locale: 'fr', // French
  currency: 'XOF', // West African CFA franc
});
```

**Supported Locales**:
- `en` - English
- `fr` - French
- `ar` - Arabic
- `sw` - Swahili
- `pt` - Portuguese
- And 10+ more...

---

## 🔐 Security

### PCI DSS Compliance

- Card data is collected in hosted iFrames served from Molam's PCI-certified infrastructure
- Merchant's domain never touches raw card data
- Tokenization happens server-side on Molam's secure servers
- Tokens are single-use and cannot be used to retrieve card data

### 3DS2 / Strong Customer Authentication

```javascript
const payment = await molam.confirmPayment(
  paymentIntentId,
  clientSecret
);

if (payment.status === 'requires_action') {
  // SDK automatically handles 3DS redirect
  // User will be redirected to bank's authentication page
  // After authentication, they'll return to your site
}
```

### Webhook Verification

See [Brique 102 - Server SDKs](../brique-102) for webhook verification implementation.

---

## 📖 API Reference

### Web SDK

#### `MolamForm`

**Constructor**
```typescript
new MolamForm(config: MolamFormConfig)
```

**Methods**
- `mount(selector: string): Promise<void>` - Mount payment form
- `unmount(): void` - Unmount payment form
- `createToken(cardDetails?: CardDetails): Promise<Token>` - Create payment token
- `confirmPayment(piId, clientSecret, pmId?): Promise<PaymentIntent>` - Confirm payment
- `confirmOtp(otpCode): Promise<PaymentIntent>` - Confirm OTP
- `on(event, callback): void` - Register event listener
- `off(event, callback): void` - Unregister event listener

**Events**
- `ready` - Form is ready
- `change` - Field value changed
- `tokenization:start` - Token creation started
- `tokenization:success` - Token created
- `tokenization:error` - Token creation failed
- `payment:start` - Payment started
- `payment:success` - Payment succeeded
- `payment:failed` - Payment failed
- `3ds:start` - 3DS authentication started
- `otp:requested` - OTP requested

### React Native SDK

**Methods**
- `initialize(config): Promise<void>` - Initialize SDK
- `createToken(cardDetails): Promise<Token>` - Create token
- `confirmPayment(piId, clientSecret, pmId?): Promise<PaymentIntent>` - Confirm payment
- `confirmOtp(piId, otpCode): Promise<PaymentIntent>` - Confirm OTP
- `presentPaymentSheet(clientSecret): Promise<PaymentIntent>` - Show native payment sheet
- `presentCardForm(): Promise<Token>` - Show native card form
- `on(event, callback): void` - Register event listener

**Events**
- `paymentSuccess` - Payment succeeded
- `paymentFailed` - Payment failed
- `paymentCanceled` - Payment canceled
- `tokenCreated` - Token created
- `otpRequested` - OTP requested
- `3dsStarted` - 3DS started

---

## 🧪 Testing

### Mock Mode

```javascript
const molam = new MolamForm({
  publishableKey: 'pk_test_...',
  apiBase: 'https://mock.api.molam.com', // Mock API for testing
  testMode: true
});
```

### Test Cards

```
4242 4242 4242 4242  - Visa (Success)
4000 0000 0000 0002  - Card declined
4000 0025 0000 3155  - Requires 3DS
5555 5555 5555 4444  - Mastercard (Success)
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **Documentation**: [https://docs.molam.io/form](https://docs.molam.io/form)
- **API Reference**: [https://api.molam.io/docs](https://api.molam.io/docs)
- **GitHub Issues**: [https://github.com/molam/molam-form/issues](https://github.com/molam/molam-form/issues)
- **Email**: support@molam.io
- **Slack**: #molam-sdk

---

**Made with ❤️ by the Molam team**
