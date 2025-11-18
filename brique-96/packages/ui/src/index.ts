/**
 * @molam/ui - Molam Inline UI Components
 * Apple-like minimal payment UI with accessibility and multi-language support
 *
 * @example
 * ```tsx
 * import { CheckoutInline } from '@molam/ui';
 * import '@molam/ui/styles';
 *
 * function App() {
 *   return (
 *     <CheckoutInline
 *       amount={5000}
 *       currency="XOF"
 *       locale="fr"
 *       onSubmit={async (payload) => {
 *         // Handle payment
 *         return { success: true };
 *       }}
 *     />
 *   );
 * }
 * ```
 */

// Main component
export { CheckoutInline } from './components/CheckoutInline';
export type { CheckoutInlineProps } from './components/CheckoutInline';

// Method components (for custom implementations)
export { WalletInline } from './components/methods/WalletInline';
export { CardInline } from './components/methods/CardInline';
export { BankInline } from './components/methods/BankInline';
export { QRInline } from './components/methods/QRInline';
export { USSDInline } from './components/methods/USSDInline';

export type { WalletInlineProps } from './components/methods/WalletInline';
export type { CardInlineProps } from './components/methods/CardInline';
export type { BankInlineProps } from './components/methods/BankInline';
export type { QRInlineProps } from './components/methods/QRInline';
export type { USSDInlineProps } from './components/methods/USSDInline';

// Types
export type {
  PaymentMethod,
  PaymentPayload,
  PaymentResult,
  SiraHints,
  UserPrefill,
  TelemetryEvent,
  Theme,
  CheckoutConfig,
  NetworkStatus,
  HostedFieldsConfig,
  LocaleStrings,
} from './types';

// Utilities
export {
  formatCurrency,
  convertToMajorUnit,
  convertToMinorUnit,
  getCurrencySymbol,
  formatCurrencyCompact,
  isValidCurrency,
  getCurrencyDecimalPlaces,
  parseCurrency,
} from './utils/currency';

export {
  getLocaleStrings,
  translate,
  detectUserLocale,
  getSupportedLocales,
  isSupportedLocale,
  formatNumber,
  formatDate,
} from './utils/locale';

export {
  detectNetworkStatus,
  monitorNetworkStatus,
  canPerformOperation,
  getRecommendedMethods,
  getConnectionType,
  isMeteredConnection,
  preflightCheck,
} from './utils/network';

export {
  mountHostedFields,
  unmountHostedFields,
  loadHostedFieldsScript,
} from './utils/hosted-fields';

export type { HostedFieldsInstance } from './utils/hosted-fields';

// Version
export const VERSION = '0.1.0';
