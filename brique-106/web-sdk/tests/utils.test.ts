/**
 * Utils Test Suite
 *
 * Tests for utility functions
 */

import {
  formatCardNumber,
  formatExpiryDate,
  formatCVC,
  formatAmount,
  parseExpiryDate,
  getCardBrandIcon,
  generateUUID,
  debounce,
} from '../src/utils';

describe('Card Number Formatting', () => {
  test('formats Visa/Mastercard with spaces', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('5555555555554444')).toBe('5555 5555 5555 4444');
  });

  test('formats Amex with 4-6-5 pattern', () => {
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });

  test('handles partial input', () => {
    expect(formatCardNumber('4242')).toBe('4242');
    expect(formatCardNumber('424242')).toBe('4242 42');
  });

  test('removes non-numeric characters', () => {
    expect(formatCardNumber('4242-4242-4242-4242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('4242 abcd 4242')).toBe('4242 4242');
  });
});

describe('Expiry Date Formatting', () => {
  test('formats MM/YY', () => {
    expect(formatExpiryDate('1225')).toBe('12/25');
    expect(formatExpiryDate('0126')).toBe('01/26');
  });

  test('handles partial input', () => {
    expect(formatExpiryDate('1')).toBe('1');
    expect(formatExpiryDate('12')).toBe('12');
  });

  test('removes non-numeric characters', () => {
    expect(formatExpiryDate('12/25')).toBe('12/25');
    expect(formatExpiryDate('12-25')).toBe('12/25');
  });

  test('limits to MM/YY format', () => {
    expect(formatExpiryDate('122525')).toBe('12/25');
  });
});

describe('CVC Formatting', () => {
  test('formats 3-digit CVC', () => {
    expect(formatCVC('123')).toBe('123');
  });

  test('formats 4-digit CVC for Amex', () => {
    expect(formatCVC('1234', 'amex')).toBe('1234');
  });

  test('limits to max length', () => {
    expect(formatCVC('12345')).toBe('123');
    expect(formatCVC('12345', 'amex')).toBe('1234');
  });

  test('removes non-numeric characters', () => {
    expect(formatCVC('12a3')).toBe('123');
  });
});

describe('Amount Formatting', () => {
  test('formats USD amounts', () => {
    expect(formatAmount(1000, 'USD')).toBe('$10.00');
    expect(formatAmount(12345, 'USD')).toBe('$123.45');
  });

  test('formats EUR amounts', () => {
    expect(formatAmount(1000, 'EUR')).toContain('10');
    expect(formatAmount(1000, 'EUR')).toContain('00');
  });

  test('handles zero amounts', () => {
    expect(formatAmount(0, 'USD')).toBe('$0.00');
  });

  test('handles large amounts', () => {
    expect(formatAmount(1000000, 'USD')).toBe('$10,000.00');
  });
});

describe('Expiry Date Parsing', () => {
  test('parses MM/YY format', () => {
    const result = parseExpiryDate('12/25');
    expect(result).toEqual({ month: 12, year: 2025 });
  });

  test('parses MM/YYYY format', () => {
    const result = parseExpiryDate('12/2025');
    expect(result).toEqual({ month: 12, year: 2025 });
  });

  test('handles 2-digit years', () => {
    const result = parseExpiryDate('01/26');
    expect(result).toEqual({ month: 1, year: 2026 });
  });

  test('throws on invalid format', () => {
    expect(() => parseExpiryDate('invalid')).toThrow();
    expect(() => parseExpiryDate('13/25')).toThrow(); // Invalid month
  });
});

describe('Card Brand Icon', () => {
  test('returns Visa icon URL', () => {
    const url = getCardBrandIcon('visa');
    expect(url).toContain('visa');
  });

  test('returns Mastercard icon URL', () => {
    const url = getCardBrandIcon('mastercard');
    expect(url).toContain('mastercard');
  });

  test('returns generic icon for unknown brand', () => {
    const url = getCardBrandIcon('unknown');
    expect(url).toContain('generic');
  });
});

describe('UUID Generation', () => {
  test('generates valid UUID v4', () => {
    const uuid = generateUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  test('generates unique UUIDs', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).not.toBe(uuid2);
  });
});

describe('Debounce', () => {
  jest.useFakeTimers();

  test('delays function execution', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 300);

    debouncedFn();
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('cancels previous calls', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 300);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    jest.advanceTimersByTime(300);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('passes arguments correctly', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 300);

    debouncedFn('arg1', 'arg2');
    jest.advanceTimersByTime(300);

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  jest.useRealTimers();
});
