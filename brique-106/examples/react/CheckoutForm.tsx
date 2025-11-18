/**
 * React Example - Molam Form Integration
 *
 * Demonstrates:
 * - TypeScript integration
 * - React hooks (useEffect, useRef, useState)
 * - Event handling
 * - Error handling
 * - 3DS/OTP flows
 */

import React, { useEffect, useRef, useState } from 'react';
import MolamForm from '@molam/form-web';
import type { Token, PaymentIntent, MolamFormEvent } from '@molam/form-web';

interface CheckoutFormProps {
  publishableKey: string;
  amount: number;
  currency?: string;
  onSuccess?: (paymentIntent: PaymentIntent) => void;
  onError?: (error: Error) => void;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  publishableKey,
  amount,
  currency = 'USD',
  onSuccess,
  onError,
}) => {
  const formRef = useRef<HTMLDivElement>(null);
  const molamRef = useRef<MolamForm | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize Molam Form
  useEffect(() => {
    if (!formRef.current || molamRef.current) return;

    const molam = new MolamForm({
      publishableKey,
      apiBase: process.env.REACT_APP_MOLAM_API_BASE || 'https://api.molam.com',
      locale: navigator.language.split('-')[0] || 'en',
      theme: 'minimal',
    });

    // Mount form
    molam.mount(formRef.current);

    // Event listeners
    molam.on('ready', () => {
      console.log('[Molam] Form ready');
      setIsReady(true);
    });

    molam.on('change', (event: MolamFormEvent) => {
      console.log('[Molam] Field changed:', event);
      setErrorMessage(null);
    });

    molam.on('tokenization:start', () => {
      console.log('[Molam] Tokenization started');
      setIsProcessing(true);
      setErrorMessage(null);
      setSuccessMessage(null);
    });

    molam.on('tokenization:success', async (data) => {
      console.log('[Molam] Token created:', data.token);

      try {
        // Create payment intent on your backend
        const paymentIntent = await createPaymentIntent(data.token);

        // Confirm payment
        const result = await molam.confirmPayment(
          paymentIntent.id,
          paymentIntent.client_secret
        );

        if (result.status === 'succeeded') {
          setSuccessMessage('Payment successful!');
          onSuccess?.(result);
        }
      } catch (error) {
        const err = error as Error;
        setErrorMessage(err.message);
        onError?.(err);
      } finally {
        setIsProcessing(false);
      }
    });

    molam.on('tokenization:error', (error) => {
      console.error('[Molam] Tokenization failed:', error);
      setErrorMessage(error.message || 'Failed to process card');
      setIsProcessing(false);
      onError?.(new Error(error.message));
    });

    molam.on('payment:success', (data) => {
      console.log('[Molam] Payment successful:', data);
      setSuccessMessage('Payment completed successfully!');
      setIsProcessing(false);
      onSuccess?.(data.paymentIntent);
    });

    molam.on('payment:failed', (error) => {
      console.error('[Molam] Payment failed:', error);
      setErrorMessage(error.message || 'Payment failed');
      setIsProcessing(false);
      onError?.(new Error(error.message));
    });

    molam.on('3ds:start', (data) => {
      console.log('[Molam] 3DS authentication started:', data);
      setSuccessMessage('Redirecting to 3D Secure authentication...');
    });

    molam.on('otp:requested', async (data) => {
      console.log('[Molam] OTP requested:', data);

      // You can show a custom OTP input modal here
      // For demo purposes, using browser prompt
      const otpCode = prompt('Enter the OTP code sent to your phone:');

      if (otpCode) {
        try {
          await molam.confirmOtp(otpCode);
        } catch (error) {
          console.error('[Molam] OTP confirmation failed:', error);
          setErrorMessage('Invalid OTP code');
        }
      } else {
        setErrorMessage('OTP is required to complete payment');
        setIsProcessing(false);
      }
    });

    molamRef.current = molam;

    // Cleanup
    return () => {
      molam.unmount();
      molamRef.current = null;
    };
  }, [publishableKey, onSuccess, onError]);

  // Create payment intent on backend
  const createPaymentIntent = async (token: Token): Promise<PaymentIntent> => {
    const response = await fetch('/api/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token.id,
        amount,
        currency,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create payment intent');
    }

    return response.json();
  };

  // Handle payment submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!molamRef.current || !isReady || isProcessing) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await molamRef.current.createToken();
      // SDK will handle the rest via events
    } catch (error) {
      const err = error as Error;
      console.error('[Molam] Payment error:', err);
      setErrorMessage(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="checkout-form">
      <form onSubmit={handleSubmit}>
        <div ref={formRef} className="molam-form-wrapper" />

        {errorMessage && (
          <div className="alert alert-error" role="alert">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" role="alert">
            {successMessage}
          </div>
        )}

        <button
          type="submit"
          className="submit-button"
          disabled={!isReady || isProcessing}
        >
          {isProcessing ? 'Processing...' : `Pay ${formatAmount(amount, currency)}`}
        </button>
      </form>

      <style jsx>{`
        .checkout-form {
          max-width: 500px;
          margin: 0 auto;
          padding: 24px;
        }

        .molam-form-wrapper {
          margin-bottom: 24px;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .alert-error {
          background: rgba(255, 59, 48, 0.1);
          color: #ff3b30;
          border: 1px solid #ff3b30;
        }

        .alert-success {
          background: rgba(52, 199, 89, 0.1);
          color: #34c759;
          border: 1px solid #34c759;
        }

        .submit-button {
          width: 100%;
          padding: 16px;
          font-size: 16px;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
    </div>
  );
};

// Utility function to format amount
function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

export default CheckoutForm;
