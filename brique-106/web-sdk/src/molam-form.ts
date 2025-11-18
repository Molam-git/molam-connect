/**
 * Molam Form Web SDK
 * Client-side JavaScript SDK for secure payment integration
 *
 * @version 0.1.0
 * @license MIT
 */

import { MolamFormConfig, PaymentIntent, Token, CardDetails, EventCallback } from './types';
import { HostedFields } from './hosted-fields';
import { validateConfig, validateCardDetails } from './validators';
import { formatAmount, detectCardBrand } from './utils';

const DEFAULT_CONFIG: Partial<MolamFormConfig> = {
  apiBase: 'https://api.molam.com',
  locale: 'en',
  currency: 'USD',
  theme: 'minimal',
  fonts: [],
  styles: {},
};

/**
 * Main Molam Form SDK class.
 *
 * @example
 * ```js
 * const molam = new MolamForm({
 *   publishableKey: 'pk_test_...',
 *   locale: 'fr',
 *   currency: 'XOF'
 * });
 *
 * await molam.mount('#payment-form');
 * ```
 */
export class MolamForm {
  private config: MolamFormConfig;
  private hostedFields: HostedFields | null = null;
  private mountPoint: HTMLElement | null = null;
  private eventHandlers: Map<string, Set<EventCallback>> = new Map();
  private paymentIntent: PaymentIntent | null = null;

  /**
   * Initialize Molam Form SDK.
   *
   * @param config - SDK configuration
   */
  constructor(config: MolamFormConfig) {
    // Validate configuration
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as MolamFormConfig;

    // Initialize event handlers
    this._initializeEvents();
  }

  /**
   * Mount payment form to DOM element.
   *
   * @param selector - CSS selector for mount point
   */
  async mount(selector: string): Promise<void> {
    this.mountPoint = document.querySelector(selector);

    if (!this.mountPoint) {
      throw new Error(`Mount point not found: ${selector}`);
    }

    // Create hosted fields
    this.hostedFields = new HostedFields(this.config, this.mountPoint);

    // Initialize hosted fields
    await this.hostedFields.initialize();

    // Listen to hosted fields events
    this.hostedFields.on('ready', () => this._emit('ready'));
    this.hostedFields.on('change', (data) => this._emit('change', data));
    this.hostedFields.on('error', (error) => this._emit('error', error));

    this._emit('mounted');
  }

  /**
   * Unmount payment form.
   */
  unmount(): void {
    if (this.hostedFields) {
      this.hostedFields.destroy();
      this.hostedFields = null;
    }

    if (this.mountPoint) {
      this.mountPoint.innerHTML = '';
      this.mountPoint = null;
    }

    this._emit('unmounted');
  }

  /**
   * Create payment token from card details.
   *
   * @param cardDetails - Optional card details (uses hosted fields if not provided)
   * @returns Payment token
   */
  async createToken(cardDetails?: CardDetails): Promise<Token> {
    let details: CardDetails;

    if (cardDetails) {
      // Use provided card details
      const errors = validateCardDetails(cardDetails);
      if (errors.length > 0) {
        throw new Error(`Invalid card details: ${errors.join(', ')}`);
      }
      details = cardDetails;
    } else {
      // Get card details from hosted fields
      if (!this.hostedFields) {
        throw new Error('Hosted fields not initialized. Call mount() first.');
      }

      details = await this.hostedFields.getCardDetails();
    }

    // Emit tokenization start event
    this._emit('tokenization:start', { details });

    try {
      // Call tokenization API
      const response = await fetch(`${this.config.apiBase}/v1/form/tokenize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.publishableKey}`,
          'Content-Type': 'application/json',
          'X-Molam-Version': '2025-01-16',
        },
        body: JSON.stringify({
          card: {
            number: details.number,
            exp_month: details.expMonth,
            exp_year: details.expYear,
            cvc: details.cvc,
          },
          billing_details: details.billingDetails,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Tokenization failed');
      }

      const token: Token = await response.json();

      // Emit success event
      this._emit('tokenization:success', { token });

      return token;

    } catch (error) {
      // Emit error event
      this._emit('tokenization:error', { error });
      throw error;
    }
  }

  /**
   * Confirm payment intent.
   *
   * @param paymentIntentId - Payment intent ID
   * @param clientSecret - Client secret
   * @param paymentMethodId - Optional payment method ID (or creates token)
   */
  async confirmPayment(
    paymentIntentId: string,
    clientSecret: string,
    paymentMethodId?: string
  ): Promise<PaymentIntent> {
    this._emit('payment:start', { paymentIntentId });

    try {
      // Create payment method if not provided
      let pmId = paymentMethodId;
      if (!pmId) {
        const token = await this.createToken();
        pmId = token.id;
      }

      // Confirm payment intent
      const response = await fetch(
        `${this.config.apiBase}/v1/form/payment_intents/${paymentIntentId}/confirm`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.publishableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_secret: clientSecret,
            payment_method: pmId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Payment confirmation failed');
      }

      const paymentIntent: PaymentIntent = await response.json();
      this.paymentIntent = paymentIntent;

      // Handle 3DS/OTP if required
      if (paymentIntent.status === 'requires_action') {
        return await this._handlePaymentAction(paymentIntent);
      }

      // Emit success event
      if (paymentIntent.status === 'succeeded') {
        this._emit('payment:success', { paymentIntent });
      } else if (paymentIntent.status === 'failed') {
        this._emit('payment:failed', { paymentIntent });
      }

      return paymentIntent;

    } catch (error) {
      this._emit('payment:error', { error });
      throw error;
    }
  }

  /**
   * Handle payment actions (3DS, OTP, etc.).
   *
   * @param paymentIntent - Payment intent requiring action
   * @private
   */
  private async _handlePaymentAction(paymentIntent: PaymentIntent): Promise<PaymentIntent> {
    const action = paymentIntent.next_action;

    if (!action) {
      throw new Error('No action specified');
    }

    if (action.type === 'redirect_to_url') {
      // Handle 3DS redirect
      this._emit('3ds:start', { url: action.redirect_to_url?.url });

      // Redirect user
      window.location.href = action.redirect_to_url!.url;

      // Return current intent (page will redirect)
      return paymentIntent;

    } else if (action.type === 'otp') {
      // Handle OTP flow
      this._emit('otp:requested', { paymentIntent });

      // OTP will be handled by merchant's UI
      // They should call confirmOtp() when user enters OTP
      return paymentIntent;

    } else {
      throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Confirm OTP code.
   *
   * @param otpCode - OTP code entered by user
   */
  async confirmOtp(otpCode: string): Promise<PaymentIntent> {
    if (!this.paymentIntent) {
      throw new Error('No payment intent to confirm');
    }

    this._emit('otp:submit', { otpCode });

    const response = await fetch(
      `${this.config.apiBase}/v1/form/payment_intents/${this.paymentIntent.id}/otp`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.publishableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          otp_code: otpCode,
          client_secret: this.paymentIntent.client_secret,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      this._emit('otp:error', { error });
      throw new Error(error.message || 'OTP confirmation failed');
    }

    const paymentIntent: PaymentIntent = await response.json();
    this.paymentIntent = paymentIntent;

    if (paymentIntent.status === 'succeeded') {
      this._emit('payment:success', { paymentIntent });
    } else if (paymentIntent.status === 'failed') {
      this._emit('payment:failed', { paymentIntent });
    }

    return paymentIntent;
  }

  /**
   * Register event listener.
   *
   * @param event - Event name
   * @param callback - Event callback
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  /**
   * Unregister event listener.
   *
   * @param event - Event name
   * @param callback - Event callback
   */
  off(event: string, callback: EventCallback): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  /**
   * Emit event.
   *
   * @param event - Event name
   * @param data - Event data
   * @private
   */
  private _emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(callback => callback(data));
    }

    // Also emit as custom DOM event
    const customEvent = new CustomEvent(`molam.${event}`, {
      detail: data,
      bubbles: true,
    });
    window.dispatchEvent(customEvent);
  }

  /**
   * Initialize global event listeners.
   *
   * @private
   */
  private _initializeEvents(): void {
    // Listen for return from 3DS
    if (window.location.search.includes('molam_redirect_status')) {
      this._handle3DSReturn();
    }
  }

  /**
   * Handle return from 3DS redirect.
   *
   * @private
   */
  private async _handle3DSReturn(): void {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get('payment_intent');
    const clientSecret = params.get('payment_intent_client_secret');
    const redirectStatus = params.get('molam_redirect_status');

    if (!paymentIntentId || !clientSecret) {
      return;
    }

    // Retrieve payment intent
    const response = await fetch(
      `${this.config.apiBase}/v1/form/payment_intents/${paymentIntentId}?client_secret=${clientSecret}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.publishableKey}`,
        },
      }
    );

    if (response.ok) {
      const paymentIntent: PaymentIntent = await response.json();

      if (redirectStatus === 'succeeded' && paymentIntent.status === 'succeeded') {
        this._emit('3ds:success', { paymentIntent });
        this._emit('payment:success', { paymentIntent });
      } else {
        this._emit('3ds:failed', { paymentIntent });
        this._emit('payment:failed', { paymentIntent });
      }
    }
  }

  /**
   * Get current configuration.
   */
  getConfig(): MolamFormConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<MolamFormConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Update hosted fields if mounted
    if (this.hostedFields) {
      this.hostedFields.updateConfig(config);
    }
  }
}

// Export for UMD usage
if (typeof window !== 'undefined') {
  (window as any).MolamForm = MolamForm;
}

export default MolamForm;
