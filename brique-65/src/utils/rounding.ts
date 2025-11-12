import Decimal from 'decimal.js';

export const CURRENCY_PRECISION: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  XOF: 0, // West African CFA Franc - no decimal places
  JPY: 0, // Japanese Yen - no decimal places
  KRW: 0, // South Korean Won - no decimal places
  CLP: 0, // Chilean Peso - no decimal places
};

/**
 * Round a value to the appropriate precision for a given currency
 */
export function roundForCurrency(value: Decimal | number, currency: string): number {
  const precision = CURRENCY_PRECISION[currency] ?? 2;
  const decimal = new Decimal(value);
  return decimal.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string): string {
  const precision = CURRENCY_PRECISION[currency] ?? 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(amount);
}

/**
 * Convert cents to major currency units
 */
export function centsToMajor(cents: number, currency: string): number {
  const precision = CURRENCY_PRECISION[currency] ?? 2;
  if (precision === 0) return cents;
  return cents / Math.pow(10, precision);
}

/**
 * Convert major currency units to cents
 */
export function majorToCents(major: number, currency: string): number {
  const precision = CURRENCY_PRECISION[currency] ?? 2;
  if (precision === 0) return Math.round(major);
  return Math.round(major * Math.pow(10, precision));
}