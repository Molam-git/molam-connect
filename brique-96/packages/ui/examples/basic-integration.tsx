/**
 * Basic Integration Example
 * Shows how to integrate @molam/ui in a React application
 */

import React, { useState } from 'react';
import { CheckoutInline } from '@molam/ui';
import type { PaymentPayload, PaymentResult, TelemetryEvent } from '@molam/ui';
import '@molam/ui/styles';

/**
 * Example: Basic checkout page
 */
export function BasicCheckout() {
  const [result, setResult] = useState<PaymentResult | null>(null);

  const handlePayment = async (payload: PaymentPayload): Promise<PaymentResult> => {
    console.log('Payment payload:', payload);

    // Send payment request to your backend
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

      const result: PaymentResult = await response.json();
      setResult(result);

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Payment failed',
        errorCode: 'PAYMENT_ERROR',
      };
    }
  };

  const handleTelemetry = (event: TelemetryEvent) => {
    console.log('Telemetry event:', event);

    // Send to your analytics service
    // analytics.track(event.name, event.payload);
  };

  return (
    <div className="container">
      <h1>Checkout</h1>

      <CheckoutInline
        amount={5000}
        currency="XOF"
        locale="fr"
        country="SN"
        onSubmit={handlePayment}
        onEvent={handleTelemetry}
      />

      {result && (
        <div className="result">
          {result.success ? (
            <div className="success">
              ✓ Payment successful! Transaction ID: {result.transactionId}
            </div>
          ) : (
            <div className="error">
              ✗ Payment failed: {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Example: With Molam ID prefill
 */
export function CheckoutWithMolamID() {
  const [molamIdToken, setMolamIdToken] = useState<string | null>(null);

  const handleSignIn = async () => {
    // Initialize Molam ID SDK
    if (typeof window !== 'undefined' && (window as any).MolamID) {
      (window as any).MolamID.signIn({
        onSuccess: (token: string) => {
          setMolamIdToken(token);
        },
        onError: (error: any) => {
          console.error('Molam ID error:', error);
        },
      });
    }
  };

  return (
    <div className="container">
      <h1>Checkout with Molam ID</h1>

      {!molamIdToken ? (
        <button onClick={handleSignIn}>
          Sign in with Molam ID
        </button>
      ) : (
        <CheckoutInline
          amount={10000}
          currency="XOF"
          locale="fr"
          molamIdToken={molamIdToken}
          onSubmit={async (payload) => {
            const response = await fetch('/api/payments/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${molamIdToken}`,
              },
              body: JSON.stringify(payload),
            });

            return await response.json();
          }}
        />
      )}
    </div>
  );
}

/**
 * Example: With SIRA AI recommendations
 */
export function CheckoutWithSIRA() {
  const [siraHints, setSiraHints] = useState(null);

  const fetchSiraHints = async (userId: string, amount: number) => {
    const response = await fetch(
      `/api/sira/hints?user_id=${userId}&amount=${amount}`
    );
    const hints = await response.json();
    setSiraHints(hints);
  };

  React.useEffect(() => {
    // Fetch SIRA hints on mount
    fetchSiraHints('user_123', 5000);
  }, []);

  return (
    <div className="container">
      <h1>Smart Checkout with SIRA AI</h1>

      <CheckoutInline
        amount={5000}
        currency="XOF"
        locale="fr"
        sira={siraHints || undefined}
        allowedMethods={['wallet', 'card', 'bank']}
        onSubmit={async (payload) => {
          const response = await fetch('/api/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return await response.json();
        }}
        onEvent={(event) => {
          if (event.name === 'payment_method_selected') {
            console.log('User selected:', event.payload.method);
          }
        }}
      />
    </div>
  );
}

/**
 * Example: Dark theme
 */
export function DarkThemeCheckout() {
  return (
    <div className="container dark-bg">
      <h1>Dark Theme Checkout</h1>

      <CheckoutInline
        amount={5000}
        currency="USD"
        locale="en"
        theme="dark"
        onSubmit={async (payload) => {
          const response = await fetch('/api/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return await response.json();
        }}
      />
    </div>
  );
}

/**
 * Example: Custom theme
 */
export function CustomThemeCheckout() {
  return (
    <div className="container">
      <h1>Custom Theme Checkout</h1>

      <CheckoutInline
        amount={5000}
        currency="EUR"
        locale="en"
        theme={{
          primary: '#7c3aed',
          accent: '#10b981',
          background: '#ffffff',
          text: '#1f2937',
          error: '#ef4444',
          success: '#10b981',
          border: '#e5e7eb',
        }}
        onSubmit={async (payload) => {
          const response = await fetch('/api/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return await response.json();
        }}
      />
    </div>
  );
}

/**
 * Example: Minimal config (wallet only, offline support)
 */
export function MinimalCheckout() {
  return (
    <div className="container">
      <h1>Minimal Checkout</h1>

      <CheckoutInline
        amount={2500}
        currency="XOF"
        allowedMethods={['wallet', 'qr', 'ussd']}
        config={{
          features: {
            offlineMode: true,
            qrFallback: true,
            ussdFallback: true,
          },
        }}
        onSubmit={async (payload) => {
          // Simulate payment
          await new Promise((resolve) => setTimeout(resolve, 1000));

          return {
            success: true,
            transactionId: `txn_${Date.now()}`,
          };
        }}
      />
    </div>
  );
}

/**
 * Example: Multiple checkout instances on same page
 */
export function MultipleCheckouts() {
  return (
    <div className="container">
      <h1>Multiple Products</h1>

      <div className="grid">
        <div className="product">
          <h2>Basic Plan</h2>
          <p>$9.99/month</p>
          <CheckoutInline
            amount={999}
            currency="USD"
            allowedMethods={['card']}
            onSubmit={async () => ({ success: true })}
          />
        </div>

        <div className="product">
          <h2>Pro Plan</h2>
          <p>$29.99/month</p>
          <CheckoutInline
            amount={2999}
            currency="USD"
            allowedMethods={['card']}
            onSubmit={async () => ({ success: true })}
          />
        </div>

        <div className="product">
          <h2>Enterprise Plan</h2>
          <p>$99.99/month</p>
          <CheckoutInline
            amount={9999}
            currency="USD"
            allowedMethods={['card', 'bank']}
            onSubmit={async () => ({ success: true })}
          />
        </div>
      </div>
    </div>
  );
}
