/**
 * Validation utilities.
 */

import { MolamFormConfig, CardDetails } from './types';

/**
 * Validate SDK configuration.
 *
 * @param config - Configuration to validate
 * @returns Array of error messages
 */
export function validateConfig(config: MolamFormConfig): string[] {
  const errors: string[] = [];

  if (!config.publishableKey) {
    errors.push('publishableKey is required');
  } else if (!config.publishableKey.startsWith('pk_')) {
    errors.push('publishableKey must start with "pk_"');
  }

  if (config.apiBase && !/^https?:\/\//.test(config.apiBase)) {
    errors.push('apiBase must be a valid URL');
  }

  return errors;
}

/**
 * Validate card details.
 *
 * @param details - Card details to validate
 * @returns Array of error messages
 */
export function validateCardDetails(details: CardDetails): string[] {
  const errors: string[] = [];

  // Validate card number
  if (!details.number) {
    errors.push('Card number is required');
  } else if (!isValidCardNumber(details.number)) {
    errors.push('Invalid card number');
  }

  // Validate expiration month
  if (!details.expMonth) {
    errors.push('Expiration month is required');
  } else if (details.expMonth < 1 || details.expMonth > 12) {
    errors.push('Expiration month must be between 1 and 12');
  }

  // Validate expiration year
  if (!details.expYear) {
    errors.push('Expiration year is required');
  } else if (details.expYear < new Date().getFullYear()) {
    errors.push('Card has expired');
  }

  // Validate CVC
  if (!details.cvc) {
    errors.push('CVC is required');
  } else if (!/^\d{3,4}$/.test(details.cvc)) {
    errors.push('Invalid CVC');
  }

  return errors;
}

/**
 * Validate card number using Luhn algorithm.
 *
 * @param number - Card number
 * @returns True if valid
 */
export function isValidCardNumber(number: string): boolean {
  // Remove spaces and dashes
  const cleaned = number.replace(/[\s-]/g, '');

  // Check if only digits
  if (!/^\d+$/.test(cleaned)) {
    return false;
  }

  // Check length (13-19 digits)
  if (cleaned.length < 13 || cleaned.length > 19) {
    return false;
  }

  // Luhn algorithm
  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate card expiration.
 *
 * @param month - Expiration month (1-12)
 * @param year - Expiration year (4 digits)
 * @returns True if not expired
 */
export function isValidExpiration(month: number, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) {
    return false;
  }

  if (year === currentYear && month < currentMonth) {
    return false;
  }

  return true;
}

/**
 * Validate CVC.
 *
 * @param cvc - CVC code
 * @param brand - Card brand (affects length)
 * @returns True if valid
 */
export function isValidCVC(cvc: string, brand?: string): boolean {
  if (!/^\d+$/.test(cvc)) {
    return false;
  }

  // Amex uses 4 digits, others use 3
  const expectedLength = brand === 'amex' ? 4 : 3;

  return cvc.length === expectedLength;
}

/**
 * Validate email address.
 *
 * @param email - Email address
 * @returns True if valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number.
 *
 * @param phone - Phone number
 * @returns True if valid
 */
export function isValidPhone(phone: string): boolean {
  // Simple validation: at least 10 digits
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

/**
 * Validate postal code.
 *
 * @param postalCode - Postal code
 * @param country - Country code
 * @returns True if valid
 */
export function isValidPostalCode(postalCode: string, country?: string): boolean {
  if (!postalCode) {
    return false;
  }

  // Country-specific validation
  switch (country) {
    case 'US':
      return /^\d{5}(-\d{4})?$/.test(postalCode);
    case 'CA':
      return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(postalCode);
    case 'GB':
      return /^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/.test(postalCode);
    default:
      // Generic validation
      return postalCode.length >= 3;
  }
}
