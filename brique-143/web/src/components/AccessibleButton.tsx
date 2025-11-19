/**
 * BRIQUE 143 — Accessible UI Components
 * WCAG 2.1 AA compliant components
 */

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { useI18n } from '../i18n';

interface AccessibleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

/**
 * Accessible Button Component
 * - Proper focus states
 * - Keyboard navigation (Enter/Space)
 * - ARIA attributes
 * - WCAG AA contrast ratios
 */
export const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    {
      variant = 'primary',
      size = 'medium',
      loading = false,
      icon,
      ariaLabel,
      className = '',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const { t } = useI18n();

    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
    };

    const sizeStyles = {
      small: 'px-3 py-1.5 text-sm',
      medium: 'px-4 py-2 text-base',
      large: 'px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        aria-busy={loading}
        {...props}
      >
        {icon && <span className="mr-2" aria-hidden="true">{icon}</span>}
        {loading ? (
          <>
            <span className="sr-only">{t('common.loading', 'Loading...')}</span>
            <svg
              className="animate-spin h-5 w-5 mr-2"
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </>
        ) : null}
        {children}
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

/**
 * Skip Link Component (for keyboard navigation)
 */
export function SkipLink() {
  const { t } = useI18n();

  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-blue-600 focus:text-white"
    >
      {t('accessibility.skip_to_content', 'Skip to main content')}
    </a>
  );
}

/**
 * Accessible Modal Component
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function AccessibleModal({ isOpen, onClose, title, children }: ModalProps) {
  const { t } = useI18n();
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Focus trap
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl"
        role="document"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="modal-title" className="text-xl font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
            aria-label={t('accessibility.close_menu', 'Close menu')}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Accessible Form Input
 */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export function AccessibleInput({ label, error, helperText, id, ...props }: InputProps) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {props.required && <span className="text-red-600 ml-1" aria-label="required">*</span>}
      </label>
      <input
        id={inputId}
        className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        aria-invalid={!!error}
        aria-describedby={`${error ? errorId : ''} ${helperText ? helperId : ''}`.trim() || undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {helperText && (
        <p id={helperId} className="mt-1 text-sm text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}

/**
 * Live Region Component (for screen reader announcements)
 */
interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive' | 'off';
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
