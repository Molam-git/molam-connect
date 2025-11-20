/**
 * BRIQUE 139 — Internationalisation & Accessibilité
 * Currency formatting and management service
 */

import { query } from '../db';
import {
  getCachedCurrencyFormat,
  setCachedCurrencyFormat,
} from '../cache';
import type {
  CurrencyFormat,
  RoundingMode,
  FormatCurrencyRequest,
  FormatCurrencyResponse,
} from '../types';

/**
 * Get currency format by code
 */
export async function getCurrencyFormat(
  code: string,
  enableCache: boolean = true
): Promise<CurrencyFormat | null> {
  // Try cache first
  if (enableCache) {
    const cached = await getCachedCurrencyFormat(code);
    if (cached) {
      console.log(`[Currency] Cache hit: ${code}`);
      return cached;
    }
  }

  // Query database
  const result = await query<CurrencyFormat>(
    'SELECT * FROM currency_formats WHERE code = $1 AND active = true',
    [code]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const format = result.rows[0];

  // Cache the result
  if (enableCache) {
    await setCachedCurrencyFormat(code, format);
  }

  return format;
}

/**
 * Get all active currency formats
 */
export async function getAllCurrencyFormats(): Promise<CurrencyFormat[]> {
  const result = await query<CurrencyFormat>(
    'SELECT * FROM currency_formats WHERE active = true ORDER BY code'
  );
  return result.rows;
}

/**
 * Get currencies by region
 */
export async function getCurrenciesByRegion(
  countryCode: string
): Promise<CurrencyFormat[]> {
  const result = await query<CurrencyFormat>(
    'SELECT * FROM currency_formats WHERE $1 = ANY(regions) AND active = true',
    [countryCode]
  );
  return result.rows;
}

/**
 * Format currency amount according to currency rules
 */
export async function formatCurrency(
  request: FormatCurrencyRequest
): Promise<FormatCurrencyResponse> {
  const { amount, currency, locale = 'fr-FR' } = request;

  // Get currency format
  const format = await getCurrencyFormat(currency);

  if (!format) {
    throw new Error(`Currency format not found for: ${currency}`);
  }

  // Apply rounding based on rounding_mode
  const roundedAmount = applyRounding(amount, format.precision, format.rounding_mode);

  // Format using Intl.NumberFormat for consistency
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: format.iso_code || currency,
      minimumFractionDigits: format.precision,
      maximumFractionDigits: format.precision,
    }).format(roundedAmount);

    return {
      formatted,
      amount: roundedAmount,
      currency,
      locale,
    };
  } catch (error) {
    // Fallback to manual formatting if Intl fails
    const formatted = manualFormatCurrency(roundedAmount, format);
    return {
      formatted,
      amount: roundedAmount,
      currency,
      locale,
    };
  }
}

/**
 * Apply rounding based on mode
 */
function applyRounding(
  amount: number,
  precision: number,
  mode: RoundingMode
): number {
  const multiplier = Math.pow(10, precision);

  switch (mode) {
    case 'HALF_UP':
      return Math.round(amount * multiplier) / multiplier;

    case 'HALF_DOWN':
      return Math.floor(amount * multiplier + 0.5) / multiplier;

    case 'CEILING':
      return Math.ceil(amount * multiplier) / multiplier;

    case 'FLOOR':
      return Math.floor(amount * multiplier) / multiplier;

    default:
      return Math.round(amount * multiplier) / multiplier;
  }
}

/**
 * Manual currency formatting (fallback)
 */
function manualFormatCurrency(
  amount: number,
  format: CurrencyFormat
): string {
  // Split into integer and decimal parts
  const parts = amount.toFixed(format.precision).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';

  // Add thousand separators to integer part
  const formattedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    format.thousand_separator
  );

  // Combine parts
  let formatted = formattedInteger;
  if (format.precision > 0 && decimalPart) {
    formatted += format.decimal_separator + decimalPart;
  }

  // Add currency symbol
  const space = format.space_between ? ' ' : '';
  if (format.symbol_position === 'before') {
    formatted = format.symbol + space + formatted;
  } else {
    formatted = formatted + space + format.symbol;
  }

  return formatted;
}

/**
 * Parse formatted currency string to number
 */
export async function parseCurrency(
  formattedAmount: string,
  currency: string
): Promise<number> {
  const format = await getCurrencyFormat(currency);

  if (!format) {
    throw new Error(`Currency format not found for: ${currency}`);
  }

  // Remove currency symbol and spaces
  let cleaned = formattedAmount
    .replace(format.symbol, '')
    .trim();

  // Remove thousand separators
  cleaned = cleaned.split(format.thousand_separator).join('');

  // Replace decimal separator with dot
  cleaned = cleaned.replace(format.decimal_separator, '.');

  // Parse to number
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    throw new Error(`Invalid currency format: ${formattedAmount}`);
  }

  return parsed;
}

/**
 * Update currency format
 */
export async function updateCurrencyFormat(
  code: string,
  updates: Partial<CurrencyFormat>,
  updatedBy: string
): Promise<CurrencyFormat> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Build dynamic UPDATE query
  Object.entries(updates).forEach(([key, value]) => {
    if (
      key !== 'code' &&
      key !== 'created_at' &&
      key !== 'updated_at' &&
      value !== undefined
    ) {
      fields.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  });

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  fields.push(`updated_at = now()`);
  values.push(code);

  const result = await query<CurrencyFormat>(
    `UPDATE currency_formats
     SET ${fields.join(', ')}
     WHERE code = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new Error(`Currency format not found: ${code}`);
  }

  // Invalidate cache
  const redis = await import('../cache');
  await redis.setCachedCurrencyFormat(code, result.rows[0]);

  // Log update
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'currency_update',
      updatedBy,
      'update',
      'info',
      JSON.stringify({ code, updates }),
    ]
  );

  return result.rows[0];
}

/**
 * Add new currency format
 */
export async function addCurrencyFormat(
  format: Omit<CurrencyFormat, 'created_at' | 'updated_at'>,
  createdBy: string
): Promise<CurrencyFormat> {
  const result = await query<CurrencyFormat>(
    `INSERT INTO currency_formats (
      code, name, symbol, decimal_separator, thousand_separator,
      precision, rounding_mode, symbol_position, space_between,
      active, iso_code, regions
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      format.code,
      format.name,
      format.symbol,
      format.decimal_separator,
      format.thousand_separator,
      format.precision,
      format.rounding_mode,
      format.symbol_position,
      format.space_between,
      format.active,
      format.iso_code,
      format.regions,
    ]
  );

  // Log creation
  await query(
    `INSERT INTO accessibility_logs (log_type, actor, action, severity, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      'currency_update',
      createdBy,
      'create',
      'info',
      JSON.stringify({ code: format.code }),
    ]
  );

  return result.rows[0];
}

/**
 * Convert amount between currencies (requires exchange rate API)
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate?: number
): Promise<{
  original_amount: number;
  converted_amount: number;
  from_currency: string;
  to_currency: string;
  exchange_rate: number;
}> {
  if (fromCurrency === toCurrency) {
    return {
      original_amount: amount,
      converted_amount: amount,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      exchange_rate: 1,
    };
  }

  // If exchange rate not provided, this would call external API
  // For now, throw error requiring explicit rate
  if (!exchangeRate) {
    throw new Error(
      'Exchange rate required for currency conversion. Integration with FX API needed.'
    );
  }

  const fromFormat = await getCurrencyFormat(fromCurrency);
  const toFormat = await getCurrencyFormat(toCurrency);

  if (!fromFormat || !toFormat) {
    throw new Error('Currency format not found');
  }

  const convertedAmount = applyRounding(
    amount * exchangeRate,
    toFormat.precision,
    toFormat.rounding_mode
  );

  return {
    original_amount: amount,
    converted_amount: convertedAmount,
    from_currency: fromCurrency,
    to_currency: toCurrency,
    exchange_rate: exchangeRate,
  };
}

/**
 * Get currency format by country code
 */
export async function getCurrencyByCountry(
  countryCode: string
): Promise<CurrencyFormat | null> {
  const result = await query<CurrencyFormat>(
    `SELECT * FROM currency_formats
     WHERE $1 = ANY(regions) AND active = true
     LIMIT 1`,
    [countryCode]
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

/**
 * Validate currency amount based on regional rules
 */
export async function validateCurrencyAmount(
  amount: number,
  currency: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (amount < 0) {
    errors.push('Amount cannot be negative');
  }

  const format = await getCurrencyFormat(currency);
  if (!format) {
    errors.push(`Invalid currency: ${currency}`);
    return { valid: false, errors };
  }

  // Check precision
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > format.precision) {
    errors.push(
      `Amount has too many decimal places. Maximum: ${format.precision}`
    );
  }

  // XOF and XAF specific rules (no decimals)
  if ((currency === 'XOF' || currency === 'XAF') && amount % 1 !== 0) {
    errors.push(`${currency} does not support decimal amounts`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
