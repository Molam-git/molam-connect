/**
 * Type definitions for Molam Form SDK.
 */

/**
 * SDK configuration.
 */
export interface MolamFormConfig {
  /** Publishable API key */
  publishableKey: string;

  /** API base URL */
  apiBase?: string;

  /** Locale (e.g., 'en', 'fr', 'ar') */
  locale?: string;

  /** Currency (e.g., 'USD', 'XOF', 'EUR') */
  currency?: string;

  /** Theme ('minimal', 'default', 'dark') */
  theme?: 'minimal' | 'default' | 'dark' | string;

  /** Custom fonts */
  fonts?: FontConfig[];

  /** Custom styles */
  styles?: StylesConfig;

  /** Enable test mode */
  testMode?: boolean;
}

/**
 * Font configuration.
 */
export interface FontConfig {
  /** Font family */
  family: string;

  /** Font source URL */
  src: string;

  /** Font weight */
  weight?: string;

  /** Font style */
  style?: string;
}

/**
 * Styles configuration.
 */
export interface StylesConfig {
  /** Base styles */
  base?: CSSProperties;

  /** Invalid state styles */
  invalid?: CSSProperties;

  /** Complete state styles */
  complete?: CSSProperties;

  /** Empty state styles */
  empty?: CSSProperties;
}

/**
 * CSS properties.
 */
export interface CSSProperties {
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  letterSpacing?: string;
  lineHeight?: string;
  [key: string]: string | undefined;
}

/**
 * Card details.
 */
export interface CardDetails {
  /** Card number */
  number: string;

  /** Expiration month (1-12) */
  expMonth: number;

  /** Expiration year (4 digits) */
  expYear: number;

  /** CVC/CVV code */
  cvc: string;

  /** Cardholder name */
  name?: string;

  /** Billing details */
  billingDetails?: BillingDetails;
}

/**
 * Billing details.
 */
export interface BillingDetails {
  /** Billing address */
  address?: Address;

  /** Email */
  email?: string;

  /** Phone */
  phone?: string;

  /** Name */
  name?: string;
}

/**
 * Address.
 */
export interface Address {
  /** Street address line 1 */
  line1?: string;

  /** Street address line 2 */
  line2?: string;

  /** City */
  city?: string;

  /** State/Province */
  state?: string;

  /** Postal code */
  postalCode?: string;

  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
}

/**
 * Payment token.
 */
export interface Token {
  /** Token ID */
  id: string;

  /** Object type */
  object: 'token';

  /** Token type */
  type: 'card';

  /** Card information */
  card: TokenCard;

  /** Created timestamp */
  created: number;

  /** Live mode flag */
  livemode: boolean;

  /** Used flag */
  used: boolean;
}

/**
 * Token card information.
 */
export interface TokenCard {
  /** Card brand */
  brand: CardBrand;

  /** Last 4 digits */
  last4: string;

  /** Expiration month */
  exp_month: number;

  /** Expiration year */
  exp_year: number;

  /** Country */
  country?: string;

  /** Funding type */
  funding?: 'credit' | 'debit' | 'prepaid' | 'unknown';

  /** Fingerprint */
  fingerprint?: string;
}

/**
 * Card brand.
 */
export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unionpay'
  | 'unknown';

/**
 * Payment intent.
 */
export interface PaymentIntent {
  /** Payment intent ID */
  id: string;

  /** Object type */
  object: 'payment_intent';

  /** Amount */
  amount: number;

  /** Currency */
  currency: string;

  /** Status */
  status: PaymentIntentStatus;

  /** Client secret */
  client_secret: string;

  /** Payment method */
  payment_method?: string;

  /** Next action */
  next_action?: NextAction;

  /** Created timestamp */
  created: number;

  /** Metadata */
  metadata?: Record<string, string>;

  /** Last payment error */
  last_payment_error?: PaymentError;
}

/**
 * Payment intent status.
 */
export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled'
  | 'failed';

/**
 * Next action.
 */
export interface NextAction {
  /** Action type */
  type: 'redirect_to_url' | 'otp' | 'use_stripe_sdk';

  /** Redirect to URL */
  redirect_to_url?: {
    /** Return URL */
    return_url: string;
    /** Redirect URL */
    url: string;
  };

  /** OTP details */
  otp?: {
    /** Phone number */
    phone: string;
    /** OTP length */
    length: number;
  };
}

/**
 * Payment error.
 */
export interface PaymentError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Decline code */
  decline_code?: string;

  /** Payment method */
  payment_method?: string;
}

/**
 * Event callback.
 */
export type EventCallback = (data?: any) => void;

/**
 * Hosted field type.
 */
export type HostedFieldType = 'cardNumber' | 'cardExpiry' | 'cardCvc' | 'cardholderName';

/**
 * Hosted field state.
 */
export interface HostedFieldState {
  /** Field is empty */
  empty: boolean;

  /** Field is complete */
  complete: boolean;

  /** Field has error */
  error?: FieldError;

  /** Detected card brand (for cardNumber field) */
  brand?: CardBrand;
}

/**
 * Field error.
 */
export interface FieldError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;
}

/**
 * Hosted fields change event.
 */
export interface HostedFieldsChangeEvent {
  /** Field type */
  field: HostedFieldType;

  /** Field state */
  state: HostedFieldState;

  /** All fields complete */
  complete: boolean;

  /** Any field has error */
  error: boolean;
}

/**
 * Molam ID claims.
 */
export interface MolamIDClaims {
  /** Subject (user ID) */
  sub: string;

  /** Issuer */
  iss: string;

  /** Audience */
  aud: string;

  /** Expiration */
  exp: number;

  /** Issued at */
  iat: number;

  /** Email */
  email?: string;

  /** Phone */
  phone?: string;

  /** Country */
  country?: string;

  /** Preferred currency */
  currency?: string;

  /** Preferred locale */
  locale?: string;
}
