/**
 * Validators Test Suite
 *
 * Tests for card validation logic
 */

import {
  isValidCardNumber,
  isValidExpiryDate,
  isValidCVC,
  isValidEmail,
  isValidPhoneNumber,
  getCardBrand,
} from '../src/validators';

describe('Card Number Validation', () => {
  test('validates correct Visa card number', () => {
    expect(isValidCardNumber('4242424242424242')).toBe(true);
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true);
  });

  test('validates correct Mastercard number', () => {
    expect(isValidCardNumber('5555555555554444')).toBe(true);
    expect(isValidCardNumber('5555 5555 5555 4444')).toBe(true);
  });

  test('validates correct Amex number', () => {
    expect(isValidCardNumber('378282246310005')).toBe(true);
    expect(isValidCardNumber('3782 822463 10005')).toBe(true);
  });

  test('rejects invalid card numbers', () => {
    expect(isValidCardNumber('1234567890123456')).toBe(false);
    expect(isValidCardNumber('4242424242424243')).toBe(false); // Invalid Luhn
    expect(isValidCardNumber('42424')).toBe(false); // Too short
  });

  test('rejects non-numeric characters', () => {
    expect(isValidCardNumber('4242-4242-4242-4242')).toBe(false);
    expect(isValidCardNumber('4242abcd42424242')).toBe(false);
  });

  test('handles empty or null input', () => {
    expect(isValidCardNumber('')).toBe(false);
    expect(isValidCardNumber('   ')).toBe(false);
  });
});

describe('Expiry Date Validation', () => {
  test('validates future expiry dates', () => {
    const futureYear = new Date().getFullYear() + 2;
    expect(isValidExpiryDate(12, futureYear)).toBe(true);
    expect(isValidExpiryDate(1, futureYear)).toBe(true);
  });

  test('rejects past expiry dates', () => {
    expect(isValidExpiryDate(1, 2020)).toBe(false);
    expect(isValidExpiryDate(6, 2021)).toBe(false);
  });

  test('validates current month and year', () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    expect(isValidExpiryDate(currentMonth, currentYear)).toBe(true);
  });

  test('rejects invalid months', () => {
    const futureYear = new Date().getFullYear() + 1;
    expect(isValidExpiryDate(0, futureYear)).toBe(false);
    expect(isValidExpiryDate(13, futureYear)).toBe(false);
    expect(isValidExpiryDate(-1, futureYear)).toBe(false);
  });

  test('handles 2-digit years', () => {
    expect(isValidExpiryDate(12, 26)).toBe(true); // 2026
    expect(isValidExpiryDate(12, 99)).toBe(true); // 2099
  });
});

describe('CVC Validation', () => {
  test('validates 3-digit CVC', () => {
    expect(isValidCVC('123')).toBe(true);
    expect(isValidCVC('000')).toBe(true);
    expect(isValidCVC('999')).toBe(true);
  });

  test('validates 4-digit CVC for Amex', () => {
    expect(isValidCVC('1234', 'amex')).toBe(true);
  });

  test('rejects invalid CVC length', () => {
    expect(isValidCVC('12')).toBe(false);
    expect(isValidCVC('12345')).toBe(false);
  });

  test('rejects non-numeric CVC', () => {
    expect(isValidCVC('abc')).toBe(false);
    expect(isValidCVC('12a')).toBe(false);
  });

  test('handles empty input', () => {
    expect(isValidCVC('')).toBe(false);
    expect(isValidCVC('   ')).toBe(false);
  });
});

describe('Email Validation', () => {
  test('validates correct email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name+tag@example.co.uk')).toBe(true);
    expect(isValidEmail('user_name@example-domain.com')).toBe(true);
  });

  test('rejects invalid email addresses', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('invalid@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('invalid@.com')).toBe(false);
  });

  test('handles empty input', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('   ')).toBe(false);
  });
});

describe('Phone Number Validation', () => {
  test('validates international phone numbers', () => {
    expect(isValidPhoneNumber('+1234567890')).toBe(true);
    expect(isValidPhoneNumber('+33123456789')).toBe(true);
  });

  test('validates phone numbers with formatting', () => {
    expect(isValidPhoneNumber('+1 (555) 123-4567')).toBe(true);
    expect(isValidPhoneNumber('+33 1 23 45 67 89')).toBe(true);
  });

  test('rejects invalid phone numbers', () => {
    expect(isValidPhoneNumber('123')).toBe(false); // Too short
    expect(isValidPhoneNumber('abc123456')).toBe(false); // Contains letters
  });

  test('handles empty input', () => {
    expect(isValidPhoneNumber('')).toBe(false);
  });
});

describe('Card Brand Detection', () => {
  test('detects Visa', () => {
    expect(getCardBrand('4242424242424242')).toBe('visa');
    expect(getCardBrand('4')).toBe('visa');
  });

  test('detects Mastercard', () => {
    expect(getCardBrand('5555555555554444')).toBe('mastercard');
    expect(getCardBrand('2221000000000000')).toBe('mastercard');
  });

  test('detects American Express', () => {
    expect(getCardBrand('378282246310005')).toBe('amex');
    expect(getCardBrand('371449635398431')).toBe('amex');
  });

  test('detects Discover', () => {
    expect(getCardBrand('6011111111111117')).toBe('discover');
    expect(getCardBrand('6011')).toBe('discover');
  });

  test('detects JCB', () => {
    expect(getCardBrand('3530111333300000')).toBe('jcb');
  });

  test('detects Diners Club', () => {
    expect(getCardBrand('30569309025904')).toBe('diners');
    expect(getCardBrand('38520000023237')).toBe('diners');
  });

  test('detects UnionPay', () => {
    expect(getCardBrand('6200000000000005')).toBe('unionpay');
  });

  test('returns unknown for unrecognized cards', () => {
    expect(getCardBrand('9999999999999999')).toBe('unknown');
    expect(getCardBrand('')).toBe('unknown');
  });
});
