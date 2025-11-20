/**
 * BRIQUE 139 — Currency Display Component
 * Format and display currency amounts with regional formatting
 */

import React, { useEffect, useState } from 'react';

export interface CurrencyDisplayProps {
  amount: number;
  currency: string;
  locale?: string;
  showCode?: boolean;
  className?: string;
}

export interface CurrencyFormat {
  code: string;
  symbol: string;
  decimal_separator: string;
  thousand_separator: string;
  precision: number;
  symbol_position: 'before' | 'after';
  space_between: boolean;
}

/**
 * Currency Display Component
 * Automatically formats currency based on regional rules
 */
export function CurrencyDisplay({
  amount,
  currency,
  locale = 'fr-FR',
  showCode = false,
  className = '',
}: CurrencyDisplayProps) {
  const [formatted, setFormatted] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    formatCurrency(amount, currency, locale);
  }, [amount, currency, locale]);

  const formatCurrency = async (
    amt: number,
    curr: string,
    loc: string
  ): Promise<void> => {
    setIsLoading(true);

    try {
      // In production, fetch from API
      // const response = await fetch('/api/v1/currency/format', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ amount: amt, currency: curr, locale: loc }),
      // });
      // const data = await response.json();
      // setFormatted(data.formatted);

      // Fallback to Intl.NumberFormat
      const intlFormatted = new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: curr,
      }).format(amt);

      setFormatted(intlFormatted);
    } catch (error) {
      console.error('[CurrencyDisplay] Error formatting:', error);
      setFormatted(`${curr} ${amt.toFixed(2)}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <span className={`inline-block animate-pulse ${className}`}>
        <span className="inline-block h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </span>
    );
  }

  return (
    <span className={`font-medium ${className}`}>
      {formatted}
      {showCode && (
        <span className="ml-1 text-xs text-gray-500 uppercase">{currency}</span>
      )}
    </span>
  );
}

/**
 * Currency Input Component
 * Input field with currency formatting
 */
export interface CurrencyInputProps {
  value: number;
  currency: string;
  onChange: (value: number) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  className?: string;
  label?: string;
  error?: string;
}

export function CurrencyInput({
  value,
  currency,
  onChange,
  onBlur,
  placeholder = '0.00',
  disabled = false,
  min,
  max,
  className = '',
  label,
  error,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(value.toString());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Allow only numbers and decimal point
    const sanitized = input.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = sanitized.split('.');
    const formatted =
      parts.length > 2
        ? `${parts[0]}.${parts.slice(1).join('')}`
        : sanitized;

    setDisplayValue(formatted);

    const numValue = parseFloat(formatted) || 0;
    onChange(numValue);
  };

  const handleBlur = () => {
    // Format on blur
    const numValue = parseFloat(displayValue) || 0;
    setDisplayValue(numValue.toFixed(2));
    onBlur?.();
  };

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor="currency-input"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-500 sm:text-sm">{getCurrencySymbol(currency)}</span>
        </div>

        <input
          id="currency-input"
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          min={min}
          max={max}
          className={`block w-full pl-10 pr-12 py-2 border rounded-md
            ${
              error
                ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-offset-2`}
          aria-label={`Amount in ${currency}`}
          aria-invalid={!!error}
          aria-describedby={error ? 'currency-input-error' : undefined}
        />

        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <span className="text-gray-500 sm:text-sm uppercase">{currency}</span>
        </div>
      </div>

      {error && (
        <p
          id="currency-input-error"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Get currency symbol (fallback)
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    XOF: 'CFA',
    XAF: 'FCFA',
    NGN: '₦',
    GHS: '₵',
    KES: 'KSh',
    USD: '$',
    EUR: '€',
  };

  return symbols[currency] || currency;
}

/**
 * Currency Comparison Component
 */
export interface CurrencyComparisonProps {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  exchangeRate: number;
  className?: string;
}

export function CurrencyComparison({
  originalAmount,
  originalCurrency,
  convertedAmount,
  convertedCurrency,
  exchangeRate,
  className = '',
}: CurrencyComparisonProps) {
  return (
    <div
      className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <CurrencyDisplay
          amount={originalAmount}
          currency={originalCurrency}
          className="text-lg"
        />
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        <CurrencyDisplay
          amount={convertedAmount}
          currency={convertedCurrency}
          className="text-lg font-bold"
        />
      </div>

      <p className="text-xs text-gray-500">
        1 {originalCurrency} = {exchangeRate.toFixed(4)} {convertedCurrency}
      </p>
    </div>
  );
}
