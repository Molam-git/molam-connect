/**
 * Brique 41 - Molam Connect
 * Validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (international format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate currency code (ISO 4217)
 */
export function isValidCurrency(currency: string): boolean {
  const validCurrencies = [
    "USD", "EUR", "GBP", "XOF", "XAF", "GHS", "NGN", "KES", "TZS", "UGX",
    "ZAR", "MAD", "EGP", "JPY", "CNY", "CAD", "AUD", "CHF", "SEK", "NOK"
  ];
  return validCurrencies.includes(currency.toUpperCase());
}

/**
 * Validate country code (ISO 3166-1 alpha-2)
 */
export function isValidCountry(country: string): boolean {
  const validCountries = [
    "US", "GB", "FR", "DE", "ES", "IT", "CA", "AU", "JP", "CN",
    "SN", "CI", "BJ", "TG", "ML", "BF", "NE", "GN", "CM", "CD",
    "GH", "NG", "KE", "TZ", "UG", "ZA", "MA", "EG", "DZ", "TN"
  ];
  return validCountries.includes(country.toUpperCase());
}

/**
 * Validate business type
 */
export function isValidBusinessType(type: string): boolean {
  return ["individual", "company", "platform"].includes(type);
}

/**
 * Validate MCC (Merchant Category Code)
 */
export function isValidMCC(mcc: string): boolean {
  // MCC should be 4 digits
  return /^\d{4}$/.test(mcc);
}

/**
 * Sanitize string input (prevent XSS)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 500); // Max length
}

/**
 * Validate external account type
 */
export function isValidExternalAccountType(type: string): boolean {
  return ["bank", "wallet"].includes(type);
}

/**
 * Validate onboarding task status
 */
export function isValidTaskStatus(status: string): boolean {
  return ["open", "in_review", "done", "rejected", "waived"].includes(status);
}

/**
 * Validate severity level
 */
export function isValidSeverity(severity: string): boolean {
  return ["low", "normal", "high", "critical"].includes(severity);
}

/**
 * Validate webhook events
 */
export function isValidWebhookEvent(event: string): boolean {
  const validEvents = [
    "payment.succeeded",
    "payment.failed",
    "payment.refunded",
    "payout.sent",
    "payout.settled",
    "payout.failed",
    "account.updated",
    "account.verified",
    "dispute.created",
    "dispute.resolved"
  ];
  return validEvents.includes(event);
}

/**
 * Validate JSON structure
 */
export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate required fields in object
 */
export function validateRequired(obj: any, fields: string[]): { valid: boolean; missing: string[] } {
  const missing = fields.filter(field => !obj[field]);
  return {
    valid: missing.length === 0,
    missing
  };
}
