/**
 * Molam Form - Universal Checkout SDK
 *
 * Version: 1.0.0
 *
 * A lightweight, framework-agnostic JavaScript SDK for integrating Molam payments
 * into any website or application.
 *
 * Features:
 * - Payment intent creation
 * - Redirect or popup checkout flow
 * - Event callbacks (success, error, cancel)
 * - Multi-currency support
 * - Automatic locale detection
 * - Offline fallback (QR/USSD)
 *
 * Usage:
 * ```javascript
 * const checkout = new MolamCheckout({
 *   publicKey: 'pk_test_xxxxx',
 *   mode: 'test' // or 'live'
 * });
 *
 * const intent = await checkout.createPaymentIntent({
 *   amount: 5000,
 *   currency: 'XOF',
 *   description: 'Order #1234'
 * });
 *
 * checkout.open({
 *   intentId: intent.id,
 *   onSuccess: (payment) => console.log('Success!', payment),
 *   onError: (error) => console.error('Error:', error)
 * });
 * ```
 *
 * @license Proprietary - Molam
 * @copyright 2025 Molam
 */

(function(global) {
  'use strict';

  // ===================================================================
  // Constants
  // ===================================================================

  const VERSION = '1.0.0';
  const API_BASE_LIVE = 'https://api.molam.com/v1';
  const API_BASE_TEST = 'https://api.sandbox.molam.com/v1';
  const CHECKOUT_BASE_LIVE = 'https://checkout.molam.com';
  const CHECKOUT_BASE_TEST = 'https://checkout.sandbox.molam.com';

  // ===================================================================
  // MolamCheckout Class
  // ===================================================================

  class MolamCheckout {
    /**
     * Initialize Molam Checkout SDK
     *
     * @param {Object} options - Configuration options
     * @param {string} options.publicKey - Molam publishable API key (pk_test_xxx or pk_live_xxx)
     * @param {string} [options.mode='test'] - Mode: 'test' or 'live'
     * @param {string} [options.apiEndpoint] - Override API endpoint
     * @param {string} [options.checkoutEndpoint] - Override checkout endpoint
     * @param {string} [options.locale] - Force locale (e.g., 'fr', 'en')
     * @param {boolean} [options.debug=false] - Enable debug logging
     */
    constructor(options) {
      if (!options || !options.publicKey) {
        throw new Error('MolamCheckout: publicKey is required');
      }

      // Validate public key format
      if (!options.publicKey.startsWith('pk_test_') && !options.publicKey.startsWith('pk_live_')) {
        throw new Error('MolamCheckout: Invalid public key format. Must start with pk_test_ or pk_live_');
      }

      // Auto-detect mode from key if not provided
      const keyMode = options.publicKey.startsWith('pk_test_') ? 'test' : 'live';

      this.config = {
        publicKey: options.publicKey,
        mode: options.mode || keyMode,
        apiEndpoint: options.apiEndpoint || (keyMode === 'test' ? API_BASE_TEST : API_BASE_LIVE),
        checkoutEndpoint: options.checkoutEndpoint || (keyMode === 'test' ? CHECKOUT_BASE_TEST : CHECKOUT_BASE_LIVE),
        locale: options.locale || this._detectLocale(),
        debug: options.debug || false
      };

      // Validate mode matches key
      if (this.config.mode !== keyMode) {
        console.warn(`MolamCheckout: Mode '${this.config.mode}' doesn't match key type '${keyMode}'. Using '${keyMode}'`);
        this.config.mode = keyMode;
      }

      this._log('Initialized', this.config);
    }

    /**
     * Create a payment intent
     *
     * @param {Object} data - Payment intent data
     * @param {number} data.amount - Amount in smallest currency unit (e.g., cents)
     * @param {string} data.currency - ISO currency code (e.g., 'XOF', 'USD')
     * @param {string} [data.description] - Payment description
     * @param {Object} [data.metadata] - Additional metadata
     * @param {string} [data.returnUrl] - URL to redirect after payment
     * @param {string} [data.cancelUrl] - URL to redirect on cancellation
     * @param {string[]} [data.paymentMethods] - Allowed payment methods
     * @returns {Promise<Object>} Payment intent object
     */
    async createPaymentIntent(data) {
      if (!data || typeof data.amount !== 'number' || !data.currency) {
        throw new Error('MolamCheckout: amount and currency are required');
      }

      const payload = {
        amount: data.amount,
        currency: data.currency,
        description: data.description || '',
        metadata: data.metadata || {},
        return_url: data.returnUrl || window.location.href,
        cancel_url: data.cancelUrl || window.location.href,
        payment_methods: data.paymentMethods || ['wallet', 'card', 'bank'],
        locale: data.locale || this.config.locale
      };

      this._log('Creating payment intent', payload);

      try {
        const response = await this._request('/payment_intents', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        this._log('Payment intent created', response);
        return response;
      } catch (error) {
        this._log('Error creating payment intent', error);
        throw error;
      }
    }

    /**
     * Open checkout UI
     *
     * @param {Object} options - Checkout options
     * @param {string} options.intentId - Payment intent ID
     * @param {Function} [options.onSuccess] - Success callback
     * @param {Function} [options.onError] - Error callback
     * @param {Function} [options.onCancel] - Cancel callback
     * @param {string} [options.mode='popup'] - Display mode: 'popup', 'redirect', or 'embedded'
     * @param {string} [options.container] - Container selector for embedded mode
     */
    open(options) {
      if (!options || !options.intentId) {
        throw new Error('MolamCheckout: intentId is required');
      }

      const mode = options.mode || 'popup';
      const url = this._buildCheckoutUrl(options.intentId);

      this._log('Opening checkout', { mode, url, options });

      switch (mode) {
        case 'popup':
          this._openPopup(url, options);
          break;
        case 'redirect':
          this._redirect(url);
          break;
        case 'embedded':
          this._embed(url, options);
          break;
        default:
          throw new Error(`MolamCheckout: Invalid mode '${mode}'. Use 'popup', 'redirect', or 'embedded'`);
      }
    }

    /**
     * Retrieve payment intent status
     *
     * @param {string} intentId - Payment intent ID
     * @returns {Promise<Object>} Payment intent object
     */
    async retrievePaymentIntent(intentId) {
      if (!intentId) {
        throw new Error('MolamCheckout: intentId is required');
      }

      try {
        const response = await this._request(`/payment_intents/${intentId}`);
        this._log('Retrieved payment intent', response);
        return response;
      } catch (error) {
        this._log('Error retrieving payment intent', error);
        throw error;
      }
    }

    /**
     * Generate offline QR code data
     *
     * @param {string} intentId - Payment intent ID
     * @returns {Promise<Object>} QR code data
     */
    async generateOfflineQR(intentId) {
      if (!intentId) {
        throw new Error('MolamCheckout: intentId is required');
      }

      try {
        const response = await this._request(`/payment_intents/${intentId}/offline_qr`);
        this._log('Generated offline QR', response);
        return response;
      } catch (error) {
        this._log('Error generating offline QR', error);
        throw error;
      }
    }

    // ===================================================================
    // Private Methods
    // ===================================================================

    /**
     * Make API request
     * @private
     */
    async _request(path, options = {}) {
      const url = `${this.config.apiEndpoint}${path}`;

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.publicKey}`,
        'X-Molam-Version': VERSION,
        'X-Molam-Client': 'molam-checkout-js'
      };

      const fetchOptions = {
        ...options,
        headers: { ...headers, ...options.headers }
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      return await response.json();
    }

    /**
     * Build checkout URL
     * @private
     */
    _buildCheckoutUrl(intentId) {
      const params = new URLSearchParams({
        intent_id: intentId,
        public_key: this.config.publicKey,
        locale: this.config.locale
      });

      return `${this.config.checkoutEndpoint}?${params.toString()}`;
    }

    /**
     * Open popup window
     * @private
     */
    _openPopup(url, options) {
      const width = 500;
      const height = 700;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

      const popup = window.open(url, 'MolamCheckout', features);

      if (!popup) {
        console.error('MolamCheckout: Popup blocked. Falling back to redirect.');
        if (options.onError) {
          options.onError(new Error('Popup blocked by browser'));
        }
        this._redirect(url);
        return;
      }

      // Listen for messages from checkout window
      this._listenForCheckoutMessages(popup, options);
    }

    /**
     * Redirect to checkout
     * @private
     */
    _redirect(url) {
      window.location.href = url;
    }

    /**
     * Embed checkout in iframe
     * @private
     */
    _embed(url, options) {
      const container = options.container ? document.querySelector(options.container) : document.body;

      if (!container) {
        throw new Error(`MolamCheckout: Container '${options.container}' not found`);
      }

      // Create iframe
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.style.width = '100%';
      iframe.style.height = '600px';
      iframe.style.border = 'none';
      iframe.allow = 'payment';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');

      container.innerHTML = '';
      container.appendChild(iframe);

      // Listen for messages from iframe
      this._listenForCheckoutMessages(iframe.contentWindow, options);
    }

    /**
     * Listen for messages from checkout window
     * @private
     */
    _listenForCheckoutMessages(source, options) {
      const messageHandler = (event) => {
        // Validate origin
        if (!event.origin.includes('molam.com')) {
          return;
        }

        this._log('Received message from checkout', event.data);

        switch (event.data.type) {
          case 'payment.success':
            if (options.onSuccess) {
              options.onSuccess(event.data.payment);
            }
            window.removeEventListener('message', messageHandler);
            break;

          case 'payment.error':
            if (options.onError) {
              options.onError(new Error(event.data.error?.message || 'Payment failed'));
            }
            window.removeEventListener('message', messageHandler);
            break;

          case 'payment.cancel':
            if (options.onCancel) {
              options.onCancel();
            }
            window.removeEventListener('message', messageHandler);
            break;
        }
      };

      window.addEventListener('message', messageHandler);

      // Cleanup after 30 minutes
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
      }, 30 * 60 * 1000);
    }

    /**
     * Detect browser locale
     * @private
     */
    _detectLocale() {
      if (typeof navigator !== 'undefined') {
        const locale = navigator.language || navigator.userLanguage;
        return locale ? locale.split('-')[0] : 'en';
      }
      return 'en';
    }

    /**
     * Debug logging
     * @private
     */
    _log(...args) {
      if (this.config.debug) {
        console.log('[MolamCheckout]', ...args);
      }
    }
  }

  // ===================================================================
  // Utility Functions
  // ===================================================================

  /**
   * Format amount for display
   *
   * @param {number} amount - Amount in smallest unit
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  MolamCheckout.formatAmount = function(amount, currency) {
    const divisors = {
      'XOF': 1,
      'XAF': 1,
      'GNF': 1,
      'USD': 100,
      'EUR': 100,
      'GBP': 100
    };

    const divisor = divisors[currency] || 100;
    const value = amount / divisor;

    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency
    }).format(value);
  };

  /**
   * Validate payment intent data
   *
   * @param {Object} data - Payment intent data
   * @returns {Object} Validation result
   */
  MolamCheckout.validatePaymentIntent = function(data) {
    const errors = [];

    if (!data) {
      errors.push('Payment intent data is required');
      return { valid: false, errors };
    }

    if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    }

    if (!data.currency || typeof data.currency !== 'string') {
      errors.push('Currency is required');
    }

    const supportedCurrencies = ['XOF', 'XAF', 'GNF', 'USD', 'EUR', 'GBP'];
    if (data.currency && !supportedCurrencies.includes(data.currency)) {
      errors.push(`Unsupported currency: ${data.currency}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };

  // ===================================================================
  // Export
  // ===================================================================

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    module.exports = MolamCheckout;
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], function() {
      return MolamCheckout;
    });
  } else {
    // Browser global
    global.MolamCheckout = MolamCheckout;
  }

})(typeof window !== 'undefined' ? window : this);
