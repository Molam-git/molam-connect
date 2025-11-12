/**
 * Brique 42 - Connect Payments
 * Internationalization (i18n)
 *
 * Multi-language support: English (en), French (fr), Wolof (sn)
 * Multi-currency support: USD, EUR, XOF, XAF
 */

// ============================================================================
// Types
// ============================================================================

export type SupportedLocale = "en-US" | "en-GB" | "fr-FR" | "fr-SN" | "sn-SN";
export type SupportedLanguage = "en" | "fr" | "sn";
export type SupportedCurrency = "USD" | "EUR" | "XOF" | "XAF" | "GBP";

export interface Translation {
  [key: string]: string;
}

// ============================================================================
// Translations
// ============================================================================

const translations: Record<SupportedLanguage, Translation> = {
  // English
  en: {
    // Payment Intents
    "intent.created": "Payment intent created",
    "intent.confirmed": "Payment intent confirmed",
    "intent.captured": "Payment captured successfully",
    "intent.canceled": "Payment intent canceled",
    "intent.failed": "Payment failed",

    // Charges
    "charge.authorized": "Payment authorized",
    "charge.captured": "Payment captured",
    "charge.refunded": "Payment refunded",
    "charge.partially_refunded": "Payment partially refunded",

    // Refunds
    "refund.succeeded": "Refund succeeded",
    "refund.failed": "Refund failed",
    "refund.pending": "Refund pending",

    // Risk & Fraud
    "risk.low": "Low risk",
    "risk.normal": "Normal risk",
    "risk.elevated": "Elevated risk",
    "risk.high": "High risk",
    "risk.blocked": "Transaction blocked",

    // Hold periods
    "hold.3_days": "3-day hold period",
    "hold.6_days": "6-day hold period (elevated risk)",
    "hold.10_days": "10-day hold period (high risk)",

    // Errors
    "error.unauthorized": "Unauthorized",
    "error.forbidden": "Forbidden",
    "error.not_found": "Not found",
    "error.invalid_amount": "Invalid amount",
    "error.insufficient_funds": "Insufficient funds",
    "error.transaction_blocked": "Transaction blocked by fraud detection",
    "error.account_disabled": "Account disabled",
    "error.capability_not_enabled": "Capability not enabled",

    // Webhooks
    "webhook.delivery_ok": "Webhook delivered successfully",
    "webhook.delivery_retry": "Webhook delivery failed, retrying",
    "webhook.delivery_failed": "Webhook delivery failed after all retries",

    // General
    "currency": "Currency",
    "amount": "Amount",
    "status": "Status",
    "created_at": "Created at",
    "description": "Description",
  },

  // French
  fr: {
    // Payment Intents
    "intent.created": "Intention de paiement créée",
    "intent.confirmed": "Intention de paiement confirmée",
    "intent.captured": "Paiement capturé avec succès",
    "intent.canceled": "Intention de paiement annulée",
    "intent.failed": "Paiement échoué",

    // Charges
    "charge.authorized": "Paiement autorisé",
    "charge.captured": "Paiement capturé",
    "charge.refunded": "Paiement remboursé",
    "charge.partially_refunded": "Paiement partiellement remboursé",

    // Refunds
    "refund.succeeded": "Remboursement réussi",
    "refund.failed": "Remboursement échoué",
    "refund.pending": "Remboursement en attente",

    // Risk & Fraud
    "risk.low": "Risque faible",
    "risk.normal": "Risque normal",
    "risk.elevated": "Risque élevé",
    "risk.high": "Risque très élevé",
    "risk.blocked": "Transaction bloquée",

    // Hold periods
    "hold.3_days": "Période de rétention de 3 jours",
    "hold.6_days": "Période de rétention de 6 jours (risque élevé)",
    "hold.10_days": "Période de rétention de 10 jours (risque très élevé)",

    // Errors
    "error.unauthorized": "Non autorisé",
    "error.forbidden": "Interdit",
    "error.not_found": "Non trouvé",
    "error.invalid_amount": "Montant invalide",
    "error.insufficient_funds": "Fonds insuffisants",
    "error.transaction_blocked": "Transaction bloquée par la détection de fraude",
    "error.account_disabled": "Compte désactivé",
    "error.capability_not_enabled": "Capacité non activée",

    // Webhooks
    "webhook.delivery_ok": "Webhook livré avec succès",
    "webhook.delivery_retry": "Échec de livraison du webhook, nouvelle tentative",
    "webhook.delivery_failed": "Échec de livraison du webhook après toutes les tentatives",

    // General
    "currency": "Devise",
    "amount": "Montant",
    "status": "Statut",
    "created_at": "Créé le",
    "description": "Description",
  },

  // Wolof (Senegal)
  sn: {
    // Payment Intents
    "intent.created": "Ñu defar intention paiement bi",
    "intent.confirmed": "Ñu confirmé intention paiement bi",
    "intent.captured": "Paiement bi capturé ak succès",
    "intent.canceled": "Ñu annulé intention paiement bi",
    "intent.failed": "Paiement bi échoué",

    // Charges
    "charge.authorized": "Paiement bi autorisé",
    "charge.captured": "Paiement bi capturé",
    "charge.refunded": "Paiement bi remboursé",
    "charge.partially_refunded": "Paiement bi remboursé ba parti",

    // Refunds
    "refund.succeeded": "Remboursement bi réussi",
    "refund.failed": "Remboursement bi échoué",
    "refund.pending": "Remboursement bi dafay attendu",

    // Risk & Fraud
    "risk.low": "Risque bu ndaw",
    "risk.normal": "Risque normal",
    "risk.elevated": "Risque bu mag",
    "risk.high": "Risque bu mag lool",
    "risk.blocked": "Transaction bi bloqué",

    // Hold periods
    "hold.3_days": "Période rétention 3 fan",
    "hold.6_days": "Période rétention 6 fan (risque bu mag)",
    "hold.10_days": "Période rétention 10 fan (risque bu mag lool)",

    // Errors
    "error.unauthorized": "Amoul autorisation",
    "error.forbidden": "Interdit",
    "error.not_found": "Ñu gisul",
    "error.invalid_amount": "Montant bu baaxul",
    "error.insufficient_funds": "Xalis amoul",
    "error.transaction_blocked": "Transaction bi bloqué ak système sécurité",
    "error.account_disabled": "Compte bi désactivé",
    "error.capability_not_enabled": "Capacité bi activéwul",

    // Webhooks
    "webhook.delivery_ok": "Webhook bi livré ak succès",
    "webhook.delivery_retry": "Webhook bi livréwul, dina essayer ba bés",
    "webhook.delivery_failed": "Webhook bi livréwul ba leppu tentatives",

    // General
    "currency": "Xalis",
    "amount": "Montant",
    "status": "Statut",
    "created_at": "Defar ci",
    "description": "Description",
  },
};

// ============================================================================
// Currency Formatting
// ============================================================================

const currencyConfig: Record<
  SupportedCurrency,
  {
    symbol: string;
    decimals: number;
    position: "before" | "after";
  }
> = {
  USD: { symbol: "$", decimals: 2, position: "before" },
  EUR: { symbol: "€", decimals: 2, position: "after" },
  XOF: { symbol: "CFA", decimals: 0, position: "after" }, // West African CFA Franc (no decimals)
  XAF: { symbol: "FCFA", decimals: 0, position: "after" }, // Central African CFA Franc
  GBP: { symbol: "£", decimals: 2, position: "before" },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract language code from locale
 */
export function getLanguageFromLocale(locale: string): SupportedLanguage {
  const lang = locale.split("-")[0].toLowerCase();
  if (lang === "en" || lang === "fr" || lang === "sn") {
    return lang as SupportedLanguage;
  }
  return "en"; // Default fallback
}

/**
 * Get translation for a key
 */
export function t(key: string, locale: string = "en-US"): string {
  const lang = getLanguageFromLocale(locale);
  return translations[lang][key] || translations.en[key] || key;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const config = currencyConfig[currency] || currencyConfig.USD;

  // Format number with correct decimals
  const formatted =
    config.decimals === 0
      ? Math.round(amount).toLocaleString("en-US")
      : amount.toFixed(config.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Position symbol
  return config.position === "before" ? `${config.symbol}${formatted}` : `${formatted} ${config.symbol}`;
}

/**
 * Parse locale string to extract components
 */
export function parseLocale(locale: string): {
  language: SupportedLanguage;
  country: string;
} {
  const [lang, country] = locale.split("-");
  return {
    language: getLanguageFromLocale(locale),
    country: country?.toUpperCase() || "US",
  };
}

/**
 * Get user's preferred currency based on locale
 */
export function getCurrencyFromLocale(locale: string): SupportedCurrency {
  const { country } = parseLocale(locale);

  // Map countries to currencies
  const currencyMap: Record<string, SupportedCurrency> = {
    US: "USD",
    GB: "GBP",
    FR: "EUR",
    SN: "XOF", // Senegal
    ML: "XOF", // Mali
    BF: "XOF", // Burkina Faso
    CI: "XOF", // Côte d'Ivoire
    NE: "XOF", // Niger
    TG: "XOF", // Togo
    BJ: "XOF", // Benin
    GW: "XOF", // Guinea-Bissau
    CM: "XAF", // Cameroon
    GA: "XAF", // Gabon
    CG: "XAF", // Congo
    TD: "XAF", // Chad
    CF: "XAF", // Central African Republic
    GQ: "XAF", // Equatorial Guinea
  };

  return currencyMap[country] || "USD";
}

/**
 * Translate and format a message with variables
 */
export function tf(key: string, locale: string, vars: Record<string, any> = {}): string {
  let text = t(key, locale);

  // Replace {{variable}} placeholders
  Object.keys(vars).forEach((varKey) => {
    const placeholder = `{{${varKey}}}`;
    text = text.replace(placeholder, String(vars[varKey]));
  });

  return text;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  t,
  tf,
  formatCurrency,
  parseLocale,
  getCurrencyFromLocale,
  getLanguageFromLocale,
};
