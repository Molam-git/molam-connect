/**
 * Molam Form Core - Web SDK
 * Universal checkout widget for merchant integration
 *
 * Usage:
 * <script src="https://cdn.molam.com/molam-form.js"></script>
 * <molam-checkout publishable-key="pk_test_xxx" amount="1000" currency="USD"></molam-checkout>
 */

(function() {
  'use strict';

  const SDK_VERSION = '1.0.0';
  const API_BASE_URL = 'https://api.molam.com/form'; // Production
  // const API_BASE_URL = 'http://localhost:3000/form'; // Development

  /**
   * Molam SDK Class
   */
  class MolamSDK {
    constructor(publishableKey) {
      if (!publishableKey || !publishableKey.startsWith('pk_')) {
        throw new Error('Invalid publishable key. Must start with "pk_"');
      }
      this.publishableKey = publishableKey;
      this.environment = publishableKey.startsWith('pk_test_') ? 'test' : 'live';
    }

    /**
     * Create a payment intent
     */
    async createPaymentIntent(params) {
      const { amount, currency, metadata, customer_email, customer_name, description, return_url } = params;

      const response = await fetch(`${API_BASE_URL}/payment-intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.publishableKey}`
        },
        body: JSON.stringify({
          amount,
          currency,
          metadata,
          customer_email,
          customer_name,
          description,
          return_url
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create payment intent');
      }

      const intent = await response.json();
      await this.logEvent('intent_created', { intent_reference: intent.intent_reference });
      return intent;
    }

    /**
     * Confirm a payment intent
     */
    async confirmPaymentIntent(intentId, paymentMethodToken) {
      const response = await fetch(`${API_BASE_URL}/payment-intents/${intentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.publishableKey}`
        },
        body: JSON.stringify({
          action: 'confirm',
          payment_method_token: paymentMethodToken
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to confirm payment intent');
      }

      const intent = await response.json();
      await this.logEvent('intent_confirmed', { intent_reference: intent.intent_reference });
      return intent;
    }

    /**
     * Log telemetry event
     */
    async logEvent(eventType, payload = {}) {
      try {
        await fetch(`${API_BASE_URL}/logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.publishableKey}`
          },
          body: JSON.stringify({
            event_type: eventType,
            sdk_version: SDK_VERSION,
            platform: 'web',
            payload: payload
          })
        });
      } catch (error) {
        // Silent fail for logging
        console.warn('Failed to log event:', error);
      }
    }

    /**
     * Tokenize payment method (PCI-compliant)
     * In production, this would send card data to a PCI-compliant tokenization service
     */
    async tokenizePaymentMethod(cardData) {
      // Mock tokenization - in production, use a real tokenization service
      const token = `pm_${this.environment}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await this.logEvent('payment_method_tokenized', {
        token_prefix: token.substring(0, 10),
        card_last4: cardData.number.slice(-4)
      });

      return {
        token,
        card: {
          last4: cardData.number.slice(-4),
          brand: this.detectCardBrand(cardData.number),
          exp_month: cardData.expMonth,
          exp_year: cardData.expYear
        }
      };
    }

    /**
     * Detect card brand from number
     */
    detectCardBrand(number) {
      const patterns = {
        visa: /^4/,
        mastercard: /^5[1-5]/,
        amex: /^3[47]/,
        discover: /^6(?:011|5)/
      };

      for (const [brand, pattern] of Object.entries(patterns)) {
        if (pattern.test(number)) return brand;
      }
      return 'unknown';
    }
  }

  /**
   * Custom Element: <molam-checkout>
   */
  class MolamCheckoutElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.sdk = null;
      this.paymentIntent = null;
    }

    connectedCallback() {
      const publishableKey = this.getAttribute('publishable-key');
      const amount = parseFloat(this.getAttribute('amount') || '0');
      const currency = (this.getAttribute('currency') || 'USD').toUpperCase();
      const customerEmail = this.getAttribute('customer-email');
      const customerName = this.getAttribute('customer-name');
      const description = this.getAttribute('description');

      if (!publishableKey) {
        this.showError('Missing publishable-key attribute');
        return;
      }

      if (amount <= 0) {
        this.showError('Invalid amount. Must be greater than 0');
        return;
      }

      try {
        this.sdk = new MolamSDK(publishableKey);
        this.render();
        this.initializePayment(amount, currency, customerEmail, customerName, description);
      } catch (error) {
        this.showError(error.message);
      }
    }

    async initializePayment(amount, currency, customerEmail, customerName, description) {
      try {
        this.showLoading();
        this.paymentIntent = await this.sdk.createPaymentIntent({
          amount,
          currency,
          customer_email: customerEmail,
          customer_name: customerName,
          description: description || `Payment of ${amount} ${currency}`,
          return_url: window.location.href
        });
        this.showPaymentForm();
      } catch (error) {
        this.showError(`Failed to initialize payment: ${error.message}`);
      }
    }

    render() {
      const styles = `
        <style>
          :host {
            display: block;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 400px;
            margin: 0 auto;
          }

          .molam-container {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }

          .molam-header {
            text-align: center;
            margin-bottom: 24px;
          }

          .molam-amount {
            font-size: 32px;
            font-weight: bold;
            color: #1a1a1a;
          }

          .molam-description {
            font-size: 14px;
            color: #666;
            margin-top: 8px;
          }

          .molam-form-group {
            margin-bottom: 16px;
          }

          .molam-label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #333;
            margin-bottom: 6px;
          }

          .molam-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #d0d0d0;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
            transition: border-color 0.2s;
          }

          .molam-input:focus {
            outline: none;
            border-color: #5469d4;
            box-shadow: 0 0 0 3px rgba(84, 105, 212, 0.1);
          }

          .molam-input.error {
            border-color: #e74c3c;
          }

          .molam-card-row {
            display: flex;
            gap: 12px;
          }

          .molam-card-row .molam-form-group {
            flex: 1;
          }

          .molam-button {
            width: 100%;
            padding: 14px;
            background: #5469d4;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
          }

          .molam-button:hover {
            background: #4159c3;
          }

          .molam-button:disabled {
            background: #cccccc;
            cursor: not-allowed;
          }

          .molam-error {
            background: #fff5f5;
            border: 1px solid #feb2b2;
            border-radius: 4px;
            padding: 12px;
            color: #e74c3c;
            font-size: 14px;
            margin-bottom: 16px;
          }

          .molam-success {
            background: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 4px;
            padding: 12px;
            color: #16a34a;
            font-size: 14px;
            text-align: center;
          }

          .molam-loading {
            text-align: center;
            padding: 40px;
            color: #666;
          }

          .molam-spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #5469d4;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .molam-footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
          }

          .molam-footer a {
            color: #5469d4;
            text-decoration: none;
          }

          .molam-card-icons {
            display: flex;
            gap: 8px;
            margin-top: 8px;
          }

          .molam-card-icon {
            width: 40px;
            height: 25px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #666;
          }
        </style>
      `;

      this.shadowRoot.innerHTML = styles + `
        <div class="molam-container">
          <div id="content"></div>
        </div>
      `;
    }

    showLoading() {
      const content = this.shadowRoot.querySelector('#content');
      content.innerHTML = `
        <div class="molam-loading">
          <div class="molam-spinner"></div>
          <div>Initializing payment...</div>
        </div>
      `;
    }

    showPaymentForm() {
      const content = this.shadowRoot.querySelector('#content');
      const amount = this.paymentIntent.amount;
      const currency = this.paymentIntent.currency;

      content.innerHTML = `
        <div class="molam-header">
          <div class="molam-amount">${this.formatAmount(amount, currency)}</div>
          <div class="molam-description">${this.paymentIntent.description || ''}</div>
        </div>

        <div id="error-container"></div>

        <form id="payment-form">
          <div class="molam-form-group">
            <label class="molam-label">Card Number</label>
            <input type="text" id="card-number" class="molam-input" placeholder="4242 4242 4242 4242" maxlength="19" autocomplete="cc-number" required>
            <div class="molam-card-icons">
              <div class="molam-card-icon">VISA</div>
              <div class="molam-card-icon">MC</div>
              <div class="molam-card-icon">AMEX</div>
            </div>
          </div>

          <div class="molam-card-row">
            <div class="molam-form-group">
              <label class="molam-label">Expiry (MM/YY)</label>
              <input type="text" id="card-expiry" class="molam-input" placeholder="12/25" maxlength="5" autocomplete="cc-exp" required>
            </div>
            <div class="molam-form-group">
              <label class="molam-label">CVC</label>
              <input type="text" id="card-cvc" class="molam-input" placeholder="123" maxlength="4" autocomplete="cc-csc" required>
            </div>
          </div>

          <div class="molam-form-group">
            <label class="molam-label">Cardholder Name</label>
            <input type="text" id="card-name" class="molam-input" placeholder="John Doe" autocomplete="cc-name" required>
          </div>

          <button type="submit" class="molam-button" id="submit-button">
            Pay ${this.formatAmount(amount, currency)}
          </button>
        </form>

        <div class="molam-footer">
          Powered by <a href="https://molam.com" target="_blank">Molam</a>
        </div>
      `;

      this.attachFormHandlers();
    }

    attachFormHandlers() {
      const form = this.shadowRoot.querySelector('#payment-form');
      const cardNumberInput = this.shadowRoot.querySelector('#card-number');
      const expiryInput = this.shadowRoot.querySelector('#card-expiry');
      const cvcInput = this.shadowRoot.querySelector('#card-cvc');
      const submitButton = this.shadowRoot.querySelector('#submit-button');

      // Format card number
      cardNumberInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\s/g, '');
        value = value.replace(/(\d{4})/g, '$1 ').trim();
        e.target.value = value;
      });

      // Format expiry
      expiryInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
          value = value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        e.target.value = value;
      });

      // Only allow digits for CVC
      cvcInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });

      // Handle form submission
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePayment();
      });
    }

    async handlePayment() {
      const errorContainer = this.shadowRoot.querySelector('#error-container');
      const submitButton = this.shadowRoot.querySelector('#submit-button');
      errorContainer.innerHTML = '';

      const cardNumber = this.shadowRoot.querySelector('#card-number').value.replace(/\s/g, '');
      const cardExpiry = this.shadowRoot.querySelector('#card-expiry').value;
      const cardCvc = this.shadowRoot.querySelector('#card-cvc').value;
      const cardName = this.shadowRoot.querySelector('#card-name').value;

      // Basic validation
      if (!this.validateCardNumber(cardNumber)) {
        this.showError('Invalid card number');
        return;
      }

      const [expMonth, expYear] = cardExpiry.split('/');
      if (!expMonth || !expYear || expMonth < 1 || expMonth > 12) {
        this.showError('Invalid expiry date');
        return;
      }

      if (cardCvc.length < 3) {
        this.showError('Invalid CVC');
        return;
      }

      try {
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';

        // Tokenize payment method
        const paymentMethod = await this.sdk.tokenizePaymentMethod({
          number: cardNumber,
          expMonth: expMonth,
          expYear: '20' + expYear,
          cvc: cardCvc,
          name: cardName
        });

        // Confirm payment intent
        const result = await this.sdk.confirmPaymentIntent(
          this.paymentIntent.intent_reference,
          paymentMethod.token
        );

        this.showSuccess(result);
        this.dispatchEvent(new CustomEvent('payment-success', { detail: result }));

      } catch (error) {
        this.showError(error.message);
        this.dispatchEvent(new CustomEvent('payment-error', { detail: { error: error.message } }));
        submitButton.disabled = false;
        submitButton.textContent = `Pay ${this.formatAmount(this.paymentIntent.amount, this.paymentIntent.currency)}`;
      }
    }

    validateCardNumber(number) {
      // Luhn algorithm
      if (!/^\d{13,19}$/.test(number)) return false;

      let sum = 0;
      let isEven = false;

      for (let i = number.length - 1; i >= 0; i--) {
        let digit = parseInt(number[i], 10);

        if (isEven) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }

        sum += digit;
        isEven = !isEven;
      }

      return sum % 10 === 0;
    }

    showError(message) {
      const errorContainer = this.shadowRoot.querySelector('#error-container');
      errorContainer.innerHTML = `<div class="molam-error">${message}</div>`;
      this.sdk?.logEvent('error_displayed', { error: message });
    }

    showSuccess(result) {
      const content = this.shadowRoot.querySelector('#content');
      content.innerHTML = `
        <div class="molam-success">
          <div style="font-size: 48px; margin-bottom: 12px;">✓</div>
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Payment Successful!</div>
          <div style="font-size: 14px;">Transaction ID: ${result.intent_reference}</div>
        </div>
        <div class="molam-footer" style="margin-top: 16px;">
          Powered by <a href="https://molam.com" target="_blank">Molam</a>
        </div>
      `;
    }

    formatAmount(amount, currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    }
  }

  // Register custom element
  if (!customElements.get('molam-checkout')) {
    customElements.define('molam-checkout', MolamCheckoutElement);
  }

  // Expose SDK globally
  window.Molam = MolamSDK;

  // Log SDK initialization
  console.log(`Molam Form SDK v${SDK_VERSION} loaded`);

})();
