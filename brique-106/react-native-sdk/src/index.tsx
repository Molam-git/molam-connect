/**
 * Molam Form React Native SDK
 *
 * Native payment integration for iOS and Android.
 *
 * @version 0.1.0
 * @license MIT
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@molam/form-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo managed workflow\n';

const MolamFormBridge = NativeModules.MolamFormBridge
  ? NativeModules.MolamFormBridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

const eventEmitter = new NativeEventEmitter(MolamFormBridge);

// ============================================================================
// Types
// ============================================================================

export interface MolamFormConfig {
  /** Publishable API key */
  publishableKey: string;

  /** API base URL */
  apiBase?: string;

  /** Locale */
  locale?: string;

  /** Currency */
  currency?: string;

  /** Test mode */
  testMode?: boolean;
}

export interface CardDetails {
  /** Card number */
  cardNumber: string;

  /** Expiration month (1-12) */
  expMonth: number;

  /** Expiration year (4 digits) */
  expYear: number;

  /** CVC code */
  cvc: string;

  /** Cardholder name */
  cardholderName?: string;
}

export interface Token {
  /** Token ID */
  id: string;

  /** Token type */
  type: 'card';

  /** Card details */
  card: {
    /** Card brand */
    brand: string;
    /** Last 4 digits */
    last4: string;
    /** Expiration month */
    expMonth: number;
    /** Expiration year */
    expYear: number;
  };

  /** Created timestamp */
  created: number;

  /** Live mode flag */
  livemode: boolean;
}

export interface PaymentIntent {
  /** Payment intent ID */
  id: string;

  /** Amount */
  amount: number;

  /** Currency */
  currency: string;

  /** Status */
  status: string;

  /** Client secret */
  clientSecret: string;

  /** Next action */
  nextAction?: {
    /** Action type */
    type: string;
    /** Action data */
    data?: any;
  };
}

export interface PaymentMethod {
  /** Payment method ID */
  id: string;

  /** Type */
  type: 'card' | 'mobile_money' | 'bank_transfer';

  /** Card details (if type === 'card') */
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

export type EventType =
  | 'paymentSuccess'
  | 'paymentFailed'
  | 'paymentCanceled'
  | 'tokenCreated'
  | 'otpRequested'
  | '3dsStarted';

export type EventCallback = (data: any) => void;

// ============================================================================
// Main SDK Class
// ============================================================================

class MolamFormSDK {
  private config: MolamFormConfig | null = null;
  private eventListeners: Map<EventType, Set<EventCallback>> = new Map();

  /**
   * Initialize SDK.
   *
   * @param config - SDK configuration
   */
  async initialize(config: MolamFormConfig): Promise<void> {
    if (!config.publishableKey) {
      throw new Error('publishableKey is required');
    }

    if (!config.publishableKey.startsWith('pk_')) {
      throw new Error('publishableKey must start with "pk_"');
    }

    this.config = config;

    // Initialize native module
    await MolamFormBridge.initialize(config);

    // Setup event listeners
    this._setupEventListeners();
  }

  /**
   * Create payment token from card details.
   *
   * @param cardDetails - Card details
   * @returns Payment token
   */
  async createToken(cardDetails: CardDetails): Promise<Token> {
    this._ensureInitialized();

    const { cardNumber, expMonth, expYear, cvc, cardholderName } = cardDetails;

    const result = await MolamFormBridge.tokenizeCard(
      cardNumber,
      expMonth,
      expYear,
      cvc,
      cardholderName || ''
    );

    return result as Token;
  }

  /**
   * Confirm payment intent.
   *
   * @param paymentIntentId - Payment intent ID
   * @param clientSecret - Client secret
   * @param paymentMethodId - Optional payment method ID
   */
  async confirmPayment(
    paymentIntentId: string,
    clientSecret: string,
    paymentMethodId?: string
  ): Promise<PaymentIntent> {
    this._ensureInitialized();

    const result = await MolamFormBridge.confirmPaymentIntent(
      paymentIntentId,
      clientSecret,
      paymentMethodId || null
    );

    return result as PaymentIntent;
  }

  /**
   * Confirm OTP code.
   *
   * @param paymentIntentId - Payment intent ID
   * @param otpCode - OTP code
   */
  async confirmOtp(paymentIntentId: string, otpCode: string): Promise<PaymentIntent> {
    this._ensureInitialized();

    const result = await MolamFormBridge.confirmOtp(paymentIntentId, otpCode);

    return result as PaymentIntent;
  }

  /**
   * Retrieve payment intent.
   *
   * @param paymentIntentId - Payment intent ID
   * @param clientSecret - Client secret
   */
  async retrievePaymentIntent(
    paymentIntentId: string,
    clientSecret: string
  ): Promise<PaymentIntent> {
    this._ensureInitialized();

    const result = await MolamFormBridge.retrievePaymentIntent(
      paymentIntentId,
      clientSecret
    );

    return result as PaymentIntent;
  }

  /**
   * Present payment sheet (native UI).
   *
   * @param paymentIntentClientSecret - Payment intent client secret
   */
  async presentPaymentSheet(paymentIntentClientSecret: string): Promise<PaymentIntent> {
    this._ensureInitialized();

    const result = await MolamFormBridge.presentPaymentSheet(
      paymentIntentClientSecret
    );

    return result as PaymentIntent;
  }

  /**
   * Present card form (native UI).
   *
   * @returns Token
   */
  async presentCardForm(): Promise<Token> {
    this._ensureInitialized();

    const result = await MolamFormBridge.presentCardForm();

    return result as Token;
  }

  /**
   * Register event listener.
   *
   * @param event - Event type
   * @param callback - Event callback
   */
  on(event: EventType, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener.
   *
   * @param event - Event type
   * @param callback - Event callback
   */
  off(event: EventType, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Get current configuration.
   */
  getConfig(): MolamFormConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Ensure SDK is initialized.
   *
   * @private
   */
  private _ensureInitialized(): void {
    if (!this.config) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
  }

  /**
   * Setup native event listeners.
   *
   * @private
   */
  private _setupEventListeners(): void {
    // Payment success
    eventEmitter.addListener('paymentSuccess', (data) => {
      this._emit('paymentSuccess', data);
    });

    // Payment failed
    eventEmitter.addListener('paymentFailed', (data) => {
      this._emit('paymentFailed', data);
    });

    // Payment canceled
    eventEmitter.addListener('paymentCanceled', (data) => {
      this._emit('paymentCanceled', data);
    });

    // Token created
    eventEmitter.addListener('tokenCreated', (data) => {
      this._emit('tokenCreated', data);
    });

    // OTP requested
    eventEmitter.addListener('otpRequested', (data) => {
      this._emit('otpRequested', data);
    });

    // 3DS started
    eventEmitter.addListener('3dsStarted', (data) => {
      this._emit('3dsStarted', data);
    });
  }

  /**
   * Emit event.
   *
   * @param event - Event type
   * @param data - Event data
   * @private
   */
  private _emit(event: EventType, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const MolamForm = new MolamFormSDK();

export default MolamForm;

// Also export class for advanced usage
export { MolamFormSDK };

// Export helper functions

/**
 * Validate card number.
 */
export function validateCardNumber(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, '');
  return /^\d{13,19}$/.test(cleaned);
}

/**
 * Validate expiration.
 */
export function validateExpiration(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (expYear < currentYear) {
    return false;
  }

  if (expYear === currentYear && expMonth < currentMonth) {
    return false;
  }

  return true;
}

/**
 * Validate CVC.
 */
export function validateCVC(cvc: string): boolean {
  return /^\d{3,4}$/.test(cvc);
}

/**
 * Detect card brand.
 */
export function detectCardBrand(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');

  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(?:011|5)/.test(cleaned)) return 'discover';

  return 'unknown';
}

/**
 * Format card number with spaces.
 */
export function formatCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/**
 * Format expiry (MM/YY).
 */
export function formatExpiry(input: string): string {
  const cleaned = input.replace(/\D/g, '');

  if (cleaned.length <= 2) {
    return cleaned;
  }

  return cleaned.replace(/(\d{2})(\d{0,2})/, '$1/$2');
}
