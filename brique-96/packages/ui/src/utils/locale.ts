/**
 * Localization utilities for multi-language support
 */

import type { LocaleStrings } from '../types';

/**
 * Default English strings
 */
const EN_STRINGS: LocaleStrings = {
  // Payment methods
  wallet: 'Molam Wallet',
  card: 'Card',
  bank: 'Bank Transfer',
  ussd: 'USSD',
  qr: 'QR Code',

  // Actions
  pay: 'Pay',
  cancel: 'Cancel',
  confirm: 'Confirm',
  retry: 'Retry',

  // States
  processing: 'Processing...',
  success: 'Payment successful',
  failed: 'Payment failed',

  // Hints
  walletHint: 'Fast and secure',
  cardHint: 'Visa, Mastercard (3DS enabled)',
  bankHint: 'Bank transfer (1-2 days)',
  ussdHint: 'Dial from your phone',
  qrHint: 'Scan with mobile app',

  // Errors
  genericError: 'Something went wrong. Please try again.',
  networkError: 'Network error. Please check your connection.',
  validationError: 'Please check your input.',
  insufficientFunds: 'Insufficient funds.',

  // Accessibility
  paymentMethodsLabel: 'Choose payment method',
  amountLabel: 'Payment amount',
  securePayment: 'Secure payment powered by Molam',
};

/**
 * French strings
 */
const FR_STRINGS: LocaleStrings = {
  wallet: 'Portefeuille Molam',
  card: 'Carte bancaire',
  bank: 'Virement bancaire',
  ussd: 'USSD',
  qr: 'Code QR',

  pay: 'Payer',
  cancel: 'Annuler',
  confirm: 'Confirmer',
  retry: 'Réessayer',

  processing: 'Traitement en cours...',
  success: 'Paiement réussi',
  failed: 'Paiement échoué',

  walletHint: 'Rapide et sécurisé',
  cardHint: 'Visa, Mastercard (3DS activé)',
  bankHint: 'Virement bancaire (1-2 jours)',
  ussdHint: 'Composer depuis votre téléphone',
  qrHint: 'Scanner avec votre application',

  genericError: 'Une erreur s\'est produite. Veuillez réessayer.',
  networkError: 'Erreur réseau. Vérifiez votre connexion.',
  validationError: 'Veuillez vérifier vos informations.',
  insufficientFunds: 'Fonds insuffisants.',

  paymentMethodsLabel: 'Choisissez votre méthode de paiement',
  amountLabel: 'Montant du paiement',
  securePayment: 'Paiement sécurisé par Molam',
};

/**
 * Wolof strings (Senegal)
 */
const WO_STRINGS: LocaleStrings = {
  wallet: 'Portefeuille Molam',
  card: 'Kart',
  bank: 'Bànk',
  ussd: 'USSD',
  qr: 'Kode QR',

  pay: 'Fey',
  cancel: 'Dokk',
  confirm: 'Naan',
  retry: 'Jeema tuuti',

  processing: 'Dafay jàll...',
  success: 'Fey gi nekk na',
  failed: 'Fey gi amul benn njariñ',

  walletHint: 'Gaaw te sàkk',
  cardHint: 'Visa, Mastercard',
  bankHint: 'Bànk (1-2 fan)',
  ussdHint: 'Compose ci sa telefon',
  qrHint: 'Scan ci aplikasiyon',

  genericError: 'Amna benn njariñ. Jéema tuuti.',
  networkError: 'Njariñ réseau. Xoolal connexion bi.',
  validationError: 'Xoolal sa xët yi.',
  insufficientFunds: 'Xaalis du tàbbi.',

  paymentMethodsLabel: 'Tànn ni nga fey',
  amountLabel: 'Yëgël fey',
  securePayment: 'Fey bu sàkk ak Molam',
};

/**
 * All available translations
 */
const TRANSLATIONS: Record<string, LocaleStrings> = {
  en: EN_STRINGS,
  'en-US': EN_STRINGS,
  'en-GB': EN_STRINGS,
  fr: FR_STRINGS,
  'fr-FR': FR_STRINGS,
  'fr-SN': FR_STRINGS,
  wo: WO_STRINGS,
  'wo-SN': WO_STRINGS,
};

/**
 * Get locale strings for a given locale code
 */
export function getLocaleStrings(locale: string): LocaleStrings {
  // Try exact match
  if (TRANSLATIONS[locale]) {
    return TRANSLATIONS[locale];
  }

  // Try language code only (e.g., 'fr' from 'fr-FR')
  const lang = locale.split('-')[0];
  if (TRANSLATIONS[lang]) {
    return TRANSLATIONS[lang];
  }

  // Fallback to English
  return EN_STRINGS;
}

/**
 * Get translated string
 */
export function translate(key: keyof LocaleStrings, locale: string): string {
  const strings = getLocaleStrings(locale);
  return strings[key] || EN_STRINGS[key] || key;
}

/**
 * Detect user's preferred locale from browser
 */
export function detectUserLocale(): string {
  if (typeof window === 'undefined') {
    return 'en';
  }

  // Try navigator.language first
  if (navigator.language) {
    return navigator.language;
  }

  // Fallback to navigator.languages array
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages[0];
  }

  // Final fallback
  return 'en';
}

/**
 * Get supported locales
 */
export function getSupportedLocales(): string[] {
  return Object.keys(TRANSLATIONS);
}

/**
 * Check if locale is supported
 */
export function isSupportedLocale(locale: string): boolean {
  const lang = locale.split('-')[0];
  return TRANSLATIONS[locale] !== undefined || TRANSLATIONS[lang] !== undefined;
}

/**
 * Format number with locale-specific separators
 */
export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return value.toString();
  }
}

/**
 * Format date with locale
 */
export function formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toISOString();
  }
}
