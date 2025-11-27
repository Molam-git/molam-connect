import React, { useState, FormEvent } from 'react';

interface MessageState {
  text: string;
  type: 'success' | 'error' | 'info';
}

const CheckoutDemo: React.FC = () => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    return formatted;
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const showMessage = (text: string, type: MessageState['type']) => {
    setMessage({ text, type });
  };

  const hideMessage = () => {
    setMessage(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    hideMessage();

    const cleanCardNumber = cardNumber.replace(/\s/g, '');

    // Basic validation
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      showMessage('Invalid card number', 'error');
      return;
    }

    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      showMessage('Invalid expiry date (use MM/YY)', 'error');
      return;
    }

    if (cvv.length < 3 || cvv.length > 4) {
      showMessage('Invalid CVV', 'error');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create Payment Intent
      showMessage('Creating payment intent...', 'info');
      const paymentIntentResponse = await fetch('/api/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 55000,
          currency: 'XOF',
          description: 'Premium Subscription',
          metadata: {
            customer_name: name,
          }
        }),
      });

      if (!paymentIntentResponse.ok) {
        throw new Error('Failed to create payment intent');
      }

      const paymentIntent = await paymentIntentResponse.json();
      console.log('Payment Intent created:', paymentIntent);

      // Step 2: Make Auth Decision
      showMessage('Analyzing transaction risk...', 'info');
      const authResponse = await fetch('/api/v1/auth/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_id: paymentIntent.id,
          amount: 55000,
          currency: 'XOF',
          country: 'SN',
          bin: cleanCardNumber.slice(0, 6),
          device: {
            ip: '192.168.1.1',
            user_agent: navigator.userAgent,
          }
        }),
      });

      if (!authResponse.ok) {
        throw new Error('Auth decision failed');
      }

      const authDecision = await authResponse.json();
      console.log('Auth Decision:', authDecision);

      // Step 3: Handle authentication based on decision
      if (authDecision.recommended_method === 'otp_sms' || authDecision.recommended_method === 'otp_voice') {
        showMessage(`OTP authentication required (${authDecision.recommended_method})`, 'info');

        // Create OTP
        const otpResponse = await fetch('/api/v1/otp/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: '+221771234567',
            method: authDecision.recommended_method === 'otp_voice' ? 'voice' : 'sms',
            context: {
              payment_id: paymentIntent.id,
              amount: 55000,
            }
          }),
        });

        if (!otpResponse.ok) {
          throw new Error('Failed to send OTP');
        }

        const otpData = await otpResponse.json();
        console.log('OTP sent:', otpData);

        showMessage('OTP sent! Check the server console for the code (dev mode)', 'info');

        // Prompt for OTP code
        const otpCode = prompt('Enter the OTP code (check server console in dev mode):');

        if (!otpCode) {
          throw new Error('OTP verification cancelled');
        }

        // Verify OTP
        const verifyResponse = await fetch('/api/v1/otp/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            otp_id: otpData.otp_id,
            code: otpCode,
          }),
        });

        if (!verifyResponse.ok) {
          throw new Error('OTP verification failed');
        }

        console.log('OTP verified successfully');
      } else if (authDecision.recommended_method === '3ds2') {
        showMessage('3D Secure authentication required...', 'info');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 4: Confirm Payment
      showMessage('Confirming payment...', 'info');
      const confirmResponse = await fetch(`/api/v1/payment_intents/${paymentIntent.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_secret: paymentIntent.client_secret,
          payment_method: 'card',
          card: {
            number: cleanCardNumber,
            exp_month: expiry.split('/')[0],
            exp_year: '20' + expiry.split('/')[1],
            cvc: cvv,
            name: name,
          }
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error('Payment confirmation failed');
      }

      const confirmedPayment = await confirmResponse.json();
      console.log('Payment confirmed:', confirmedPayment);

      showMessage('✅ Payment successful! Thank you for your purchase.', 'success');

      setTimeout(() => {
        setCardNumber('');
        setExpiry('');
        setCvv('');
        setName('');
        setLoading(false);
        hideMessage();
      }, 3000);

    } catch (error: any) {
      console.error('Payment error:', error);
      showMessage(error.message || 'Payment failed. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 text-white text-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <a href="/dashboard" className="inline-block mb-4 text-white text-sm opacity-90 hover:opacity-100">
            ← Back to Dashboard
          </a>
          <h1 className="text-3xl font-semibold mb-2">Checkout</h1>
          <p className="opacity-90">Secure payment powered by Molam Connect</p>
        </div>

        <div className="p-8">
          <div className="bg-gray-100 rounded-xl p-5 mb-6">
            <div className="flex justify-between mb-3 text-sm">
              <span>Premium Subscription</span>
              <span>50,000 XOF</span>
            </div>
            <div className="flex justify-between mb-3 text-sm">
              <span>Tax (10%)</span>
              <span>5,000 XOF</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-300 font-semibold text-lg">
              <span>Total</span>
              <span>55,000 XOF</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            <div className="mb-4">
              <label htmlFor="name" className="block mb-2 text-sm font-medium text-gray-700">
                Cardholder Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="cardNumber" className="block mb-2 text-sm font-medium text-gray-700">
                Card Number
              </label>
              <input
                type="text"
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="4242 4242 4242 4242"
                maxLength={19}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="mb-4">
                <label htmlFor="expiry" className="block mb-2 text-sm font-medium text-gray-700">
                  Expiry Date
                </label>
                <input
                  type="text"
                  id="expiry"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  maxLength={5}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div className="mb-4">
                <label htmlFor="cvv" className="block mb-2 text-sm font-medium text-gray-700">
                  CVV
                </label>
                <input
                  type="text"
                  id="cvv"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                  placeholder="123"
                  maxLength={4}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-white font-semibold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: loading ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Processing...
                </span>
              ) : (
                'Pay 55,000 XOF'
              )}
            </button>

            {message && (
              <div
                className={`mt-4 p-4 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : message.type === 'error'
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-blue-100 text-blue-700 border border-blue-300'
                }`}
              >
                {message.text}
              </div>
            )}
          </form>
        </div>

        <div className="px-8 py-6 bg-gray-100 text-center text-xs text-gray-600">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg fill="currentColor" viewBox="0 0 20 20" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
            <span>Secure 256-bit SSL encrypted payment</span>
          </div>
          <p>Powered by Molam Connect · PCI DSS Compliant</p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutDemo;