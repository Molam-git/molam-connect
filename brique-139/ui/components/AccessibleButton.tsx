/**
 * BRIQUE 139 — Accessible Button Component
 * WCAG 2.2 compliant button with full keyboard and screen reader support
 */

import React from 'react';

export interface AccessibleButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  fullWidth?: boolean;
}

/**
 * Accessible Button Component
 * Features:
 * - WCAG 2.2 AA contrast ratios
 * - Keyboard navigation (Enter, Space)
 * - Focus visible indicators
 * - Loading states
 * - Screen reader support
 */
export function AccessibleButton({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  ariaLabel,
  ariaDescribedBy,
  className = '',
  fullWidth = false,
}: AccessibleButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses: Record<string, string> = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 active:bg-blue-800',
    secondary:
      'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 active:bg-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
    danger:
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800',
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-busy={loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

/**
 * Icon Button variant
 */
export interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string; // Required for icon-only buttons
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export function IconButton({
  icon,
  onClick,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  className = '',
}: IconButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary:
      'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-800',
  };

  const sizeClasses: Record<string, string> = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {icon}
    </button>
  );
}

/**
 * Button Group
 */
export interface ButtonGroupProps {
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function ButtonGroup({
  children,
  orientation = 'horizontal',
  className = '',
}: ButtonGroupProps) {
  const orientationClass =
    orientation === 'horizontal' ? 'flex-row' : 'flex-col';

  return (
    <div
      className={`inline-flex ${orientationClass} ${className}`}
      role="group"
      aria-label="Button group"
    >
      {children}
    </div>
  );
}
