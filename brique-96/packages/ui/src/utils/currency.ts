/**
 * Currency formatting utilities using Intl API
 * Supports multi-currency formatting with locale awareness
 */

/**
 * Format amount as currency string
 * @param amount - Amount in smallest currency unit (e.g., cents, kobo)
 * @param currency - ISO 4217 currency code
 * @param locale - BCP 47 locale code
 * @param options - Additional Intl.NumberFormat options
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en',
  options: Intl.NumberFormatOptions = {}
): string {
  try {
    // Convert from smallest unit to major unit
    const majorAmount = convertToMajorUnit(amount, currency);

    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options,
    });

    return formatter.format(majorAmount);
  } catch (error) {
    console.warn(`Failed to format currency: ${error}`);
    // Fallback formatting
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

/**
 * Convert from smallest currency unit to major unit
 */
export function convertToMajorUnit(amount: number, currency: string): number {
  const divisor = getCurrencyDivisor(currency);
  return amount / divisor;
}

/**
 * Convert from major unit to smallest currency unit
 */
export function convertToMinorUnit(amount: number, currency: string): number {
  const divisor = getCurrencyDivisor(currency);
  return Math.round(amount * divisor);
}

/**
 * Get currency divisor (1 for zero-decimal currencies, 100 for most, 1000 for three-decimal)
 */
export function getCurrencyDivisor(currency: string): number {
  // Zero-decimal currencies
  const zeroDecimalCurrencies = [
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW',
    'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
  ];

  // Three-decimal currencies
  const threeDecimalCurrencies = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];

  if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
    return 1;
  }

  if (threeDecimalCurrencies.includes(currency.toUpperCase())) {
    return 1000;
  }

  return 100; // Default for most currencies
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string, locale: string = 'en'): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    });

    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find((part) => part.type === 'currency');

    return symbolPart?.value || currency;
  } catch (error) {
    return currency;
  }
}

/**
 * Format currency for display (compact notation for large amounts)
 */
export function formatCurrencyCompact(
  amount: number,
  currency: string,
  locale: string = 'en'
): string {
  const majorAmount = convertToMajorUnit(amount, currency);

  if (majorAmount >= 1000000) {
    return formatCurrency(amount, currency, locale, {
      notation: 'compact',
      compactDisplay: 'short',
    });
  }

  return formatCurrency(amount, currency, locale);
}

/**
 * Validate currency code
 */
export function isValidCurrency(currency: string): boolean {
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get decimal places for currency
 */
export function getCurrencyDecimalPlaces(currency: string): number {
  const divisor = getCurrencyDivisor(currency);

  if (divisor === 1) return 0;
  if (divisor === 100) return 2;
  if (divisor === 1000) return 3;

  return 2; // Default
}

/**
 * Parse currency string to minor units
 */
export function parseCurrency(value: string, currency: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[^\d.,]/g, '');

  // Handle different decimal separators
  const normalized = cleaned.replace(',', '.');

  const parsed = parseFloat(normalized);

  if (isNaN(parsed)) {
    return null;
  }

  return convertToMinorUnit(parsed, currency);
}
