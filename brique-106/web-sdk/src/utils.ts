/**
 * Utility functions.
 */

import { CardBrand } from './types';

/**
 * Format amount for display.
 *
 * @param amount - Amount in smallest currency unit
 * @param currency - Currency code
 * @param locale - Locale for formatting
 * @returns Formatted amount string
 */
export function formatAmount(
  amount: number,
  currency: string,
  locale: string = 'en'
): string {
  // Convert to major currency unit
  const majorAmount = amount / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(majorAmount);
  } catch (error) {
    // Fallback if currency not supported
    return `${currency.toUpperCase()} ${majorAmount.toFixed(2)}`;
  }
}

/**
 * Detect card brand from card number.
 *
 * @param number - Card number (can include spaces/dashes)
 * @returns Card brand
 */
export function detectCardBrand(number: string): CardBrand {
  // Remove spaces and dashes
  const cleaned = number.replace(/[\s-]/g, '');

  // Visa
  if (/^4/.test(cleaned)) {
    return 'visa';
  }

  // Mastercard
  if (/^(5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)/.test(cleaned)) {
    return 'mastercard';
  }

  // Amex
  if (/^3[47]/.test(cleaned)) {
    return 'amex';
  }

  // Discover
  if (/^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5]|64[4-9])|65)/.test(cleaned)) {
    return 'discover';
  }

  // Diners Club
  if (/^3(?:0[0-5]|[68])/.test(cleaned)) {
    return 'diners';
  }

  // JCB
  if (/^(?:2131|1800|35)/.test(cleaned)) {
    return 'jcb';
  }

  // UnionPay
  if (/^(62|88)/.test(cleaned)) {
    return 'unionpay';
  }

  return 'unknown';
}

/**
 * Format card number with spaces.
 *
 * @param number - Raw card number
 * @returns Formatted card number
 */
export function formatCardNumber(number: string): string {
  const cleaned = number.replace(/\D/g, '');
  const brand = detectCardBrand(cleaned);

  // Amex: 4-6-5 format
  if (brand === 'amex') {
    return cleaned
      .replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3')
      .trim();
  }

  // Others: 4-4-4-4 format
  return cleaned
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim();
}

/**
 * Format card expiry (MM/YY).
 *
 * @param input - Raw expiry input
 * @returns Formatted expiry
 */
export function formatCardExpiry(input: string): string {
  const cleaned = input.replace(/\D/g, '');

  if (cleaned.length <= 2) {
    return cleaned;
  }

  return cleaned.replace(/(\d{2})(\d{0,2})/, '$1/$2');
}

/**
 * Parse card expiry to month and year.
 *
 * @param expiry - Formatted expiry (MM/YY or MM/YYYY)
 * @returns Object with month and year
 */
export function parseCardExpiry(expiry: string): { month: number; year: number } | null {
  const match = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);

  if (!match) {
    return null;
  }

  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);

  // Convert 2-digit year to 4-digit
  if (year < 100) {
    const currentYear = new Date().getFullYear();
    const century = Math.floor(currentYear / 100) * 100;
    year = century + year;
  }

  return { month, year };
}

/**
 * Mask card number (show only last 4 digits).
 *
 * @param number - Card number
 * @returns Masked card number
 */
export function maskCardNumber(number: string): string {
  const cleaned = number.replace(/\D/g, '');

  if (cleaned.length < 4) {
    return '****';
  }

  const last4 = cleaned.slice(-4);
  const masked = '**** **** **** ' + last4;

  return masked;
}

/**
 * Debounce function.
 *
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate random ID.
 *
 * @param prefix - Optional prefix
 * @returns Random ID
 */
export function generateId(prefix: string = ''): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);

  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Deep clone object.
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if running in browser.
 *
 * @returns True if browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Check if running on mobile device.
 *
 * @returns True if mobile
 */
export function isMobile(): boolean {
  if (!isBrowser()) {
    return false;
  }

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Load external script.
 *
 * @param src - Script URL
 * @returns Promise that resolves when script is loaded
 */
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });
}

/**
 * Get browser locale.
 *
 * @returns Browser locale
 */
export function getBrowserLocale(): string {
  if (!isBrowser()) {
    return 'en';
  }

  return navigator.language || 'en';
}

/**
 * Sanitize string for HTML.
 *
 * @param str - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeHTML(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
