/**
 * Type definitions for Molam UI Components
 * @module @molam/ui/types
 */

export type PaymentMethod = 'wallet' | 'card' | 'bank' | 'ussd' | 'qr';

export type RoutingHint = 'ma' | 'connect' | 'hybrid';

export type Theme = 'light' | 'dark' | {
  primary: string;
  accent: string;
  background: string;
  text: string;
  error: string;
  success: string;
  border: string;
};

/**
 * SIRA AI hints for optimizing payment UX
 */
export interface SiraHints {
  /** Preferred payment method based on ML analysis */
  preferredMethod?: PaymentMethod;

  /** Fraud/risk score (0-1, lower is better) */
  fraudScore?: number;

  /** Whether to show wallet option first */
  showWalletFirst?: boolean;

  /** Recommended routing strategy */
  recommendedRouting?: RoutingHint;

  /** Explanatory reasons for the recommendation */
  reasons?: string[];

  /** Confidence level (0-1) */
  confidence?: number;

  /** Force additional verification (3DS/OTP) */
  requireAdditionalVerification?: boolean;
}

/**
 * User prefill data from Molam ID
 */
export interface UserPrefill {
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  currency?: string;
  language?: string;
}

/**
 * Telemetry event payload
 */
export interface TelemetryEvent {
  name: string;
  payload?: Record<string, any>;
  timestamp?: number;
  requestId?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Payment submission payload
 */
export interface PaymentPayload {
  amount: number;
  currency: string;
  method: PaymentMethod;
  prefill?: UserPrefill;
  metadata?: Record<string, any>;
  idempotencyKey?: string;

  // Method-specific fields
  cardToken?: string;        // For tokenized card payments
  walletId?: string;         // Molam Wallet ID
  bankAccount?: string;      // Bank account identifier
  ussdCode?: string;         // USSD code for confirmation
  qrData?: string;           // QR code data
}

/**
 * Payment submission result
 */
export interface PaymentResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  transactionId?: string;
  redirectUrl?: string;      // For 3DS or additional verification
  requiresAction?: boolean;  // Indicates additional user action needed
  qrCode?: string;           // QR code for display
  ussdInstructions?: string; // USSD instructions
}

/**
 * Hosted fields configuration
 */
export interface HostedFieldsConfig {
  clientToken: string;
  styles?: {
    base?: Record<string, string>;
    invalid?: Record<string, string>;
  };
  fields?: {
    cardNumber?: boolean;
    expiryDate?: boolean;
    cvv?: boolean;
    cardholderName?: boolean;
  };
}

/**
 * Component configuration options
 */
export interface CheckoutConfig {
  /** Enable/disable specific features */
  features?: {
    hostedFields?: boolean;
    walletIntegration?: boolean;
    qrFallback?: boolean;
    ussdFallback?: boolean;
    offlineMode?: boolean;
  };

  /** Validation rules */
  validation?: {
    minAmount?: number;
    maxAmount?: number;
    allowedCurrencies?: string[];
    allowedCountries?: string[];
  };

  /** UI customization */
  ui?: {
    showMethodIcons?: boolean;
    showSecurityBadges?: boolean;
    compactMode?: boolean;
    progressIndicator?: boolean;
  };

  /** Accessibility options */
  a11y?: {
    announceChanges?: boolean;
    highContrastMode?: boolean;
    reducedMotion?: boolean;
  };
}

/**
 * Localization strings
 */
export interface LocaleStrings {
  // Payment methods
  wallet: string;
  card: string;
  bank: string;
  ussd: string;
  qr: string;

  // Actions
  pay: string;
  cancel: string;
  confirm: string;
  retry: string;

  // States
  processing: string;
  success: string;
  failed: string;

  // Hints
  walletHint: string;
  cardHint: string;
  bankHint: string;
  ussdHint: string;
  qrHint: string;

  // Errors
  genericError: string;
  networkError: string;
  validationError: string;
  insufficientFunds: string;

  // Accessibility
  paymentMethodsLabel: string;
  amountLabel: string;
  securePayment: string;
}

/**
 * Network status for offline fallback
 */
export interface NetworkStatus {
  isOnline: boolean;
  quality?: 'excellent' | 'good' | 'poor' | 'offline';
  latency?: number;
}
