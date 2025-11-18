/**
 * Molam Checkout SDK - TypeScript Definitions
 * @version 1.0.0
 */

declare module '@molam/checkout' {
  /**
   * Configuration options for MolamCheckout
   */
  export interface MolamCheckoutConfig {
    /** Molam publishable API key (required) */
    publicKey: string;
    /** Mode: 'test' or 'live' (auto-detected from key) */
    mode?: 'test' | 'live';
    /** Override API endpoint */
    apiEndpoint?: string;
    /** Override checkout endpoint */
    checkoutEndpoint?: string;
    /** Force locale (e.g., 'fr', 'en') */
    locale?: string;
    /** Enable debug logging */
    debug?: boolean;
  }

  /**
   * Payment intent creation data
   */
  export interface PaymentIntentData {
    /** Amount in smallest currency unit (e.g., cents) */
    amount: number;
    /** ISO currency code (e.g., 'XOF', 'USD') */
    currency: string;
    /** Payment description */
    description?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
    /** URL to redirect after payment */
    returnUrl?: string;
    /** URL to redirect on cancellation */
    cancelUrl?: string;
    /** Allowed payment methods */
    paymentMethods?: Array<'wallet' | 'card' | 'bank' | 'mobile_money'>;
    /** Locale override */
    locale?: string;
  }

  /**
   * Payment intent object
   */
  export interface PaymentIntent {
    /** Payment intent ID */
    id: string;
    /** Amount in smallest currency unit */
    amount: number;
    /** ISO currency code */
    currency: string;
    /** Payment status */
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    /** Payment description */
    description?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
    /** Redirect URL */
    redirect_url?: string;
    /** Created timestamp */
    created: number;
  }

  /**
   * Checkout display options
   */
  export interface CheckoutOptions {
    /** Payment intent ID (required) */
    intentId: string;
    /** Success callback */
    onSuccess?: (payment: PaymentIntent) => void;
    /** Error callback */
    onError?: (error: Error) => void;
    /** Cancel callback */
    onCancel?: () => void;
    /** Display mode */
    mode?: 'popup' | 'redirect' | 'embedded';
    /** Container selector for embedded mode */
    container?: string;
  }

  /**
   * Offline QR code data
   */
  export interface OfflineQRData {
    /** QR code data string */
    data: string;
    /** Payment intent ID */
    intent_id: string;
    /** Expiration timestamp */
    expires_at: number;
  }

  /**
   * Validation result
   */
  export interface ValidationResult {
    /** Whether validation passed */
    valid: boolean;
    /** Validation errors */
    errors: string[];
  }

  /**
   * Main MolamCheckout SDK class
   */
  export class MolamCheckout {
    /**
     * Initialize Molam Checkout SDK
     * @param options Configuration options
     */
    constructor(options: MolamCheckoutConfig);

    /**
     * Create a payment intent
     * @param data Payment intent data
     * @returns Promise resolving to payment intent object
     */
    createPaymentIntent(data: PaymentIntentData): Promise<PaymentIntent>;

    /**
     * Open checkout UI
     * @param options Checkout options
     */
    open(options: CheckoutOptions): void;

    /**
     * Retrieve payment intent status
     * @param intentId Payment intent ID
     * @returns Promise resolving to payment intent object
     */
    retrievePaymentIntent(intentId: string): Promise<PaymentIntent>;

    /**
     * Generate offline QR code data
     * @param intentId Payment intent ID
     * @returns Promise resolving to QR code data
     */
    generateOfflineQR(intentId: string): Promise<OfflineQRData>;

    /**
     * Format amount for display
     * @param amount Amount in smallest unit
     * @param currency Currency code
     * @returns Formatted amount string
     */
    static formatAmount(amount: number, currency: string): string;

    /**
     * Validate payment intent data
     * @param data Payment intent data
     * @returns Validation result
     */
    static validatePaymentIntent(data: Partial<PaymentIntentData>): ValidationResult;
  }

  export default MolamCheckout;
}

declare global {
  interface Window {
    MolamCheckout: typeof import('@molam/checkout').MolamCheckout;
  }
}
