import React, { forwardRef } from 'react';
import clsx from 'clsx';
import { generateId } from '@/utils/a11y';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Input label
   */
  label?: string;

  /**
   * Helper text below input
   */
  helperText?: string;

  /**
   * Error message (makes input red)
   */
  error?: string;

  /**
   * Input size
   * @default 'md'
   */
  inputSize?: 'sm' | 'md' | 'lg';

  /**
   * Icon to display before input
   */
  startIcon?: React.ReactNode;

  /**
   * Icon to display after input
   */
  endIcon?: React.ReactNode;

  /**
   * Full width input
   * @default false
   */
  fullWidth?: boolean;
}

/**
 * Input component - Text input field with label and validation
 *
 * @example
 * <Input label="Email" type="email" placeholder="you@example.com" />
 * <Input label="Password" type="password" error="Password is required" />
 * <Input startIcon={<SearchIcon />} placeholder="Search..." />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      inputSize = 'md',
      startIcon,
      endIcon,
      fullWidth = false,
      className,
      id,
      ...rest
    },
    ref
  ) => {
    const inputId = id || generateId('input');
    const helperTextId = helperText || error ? `${inputId}-helper` : undefined;

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-4 py-3 text-base'
    };

    const baseStyles =
      'w-full bg-[var(--molam-surface)] border rounded-[var(--molam-radius)] transition-all duration-[var(--transition-fast)] focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const statusStyles = error
      ? 'border-[var(--molam-error)] focus:ring-[var(--molam-error)] focus:border-[var(--molam-error)]'
      : 'border-[var(--molam-border)] focus:ring-[var(--molam-primary)] focus:border-[var(--molam-primary)]';

    return (
      <div className={clsx('flex flex-col gap-1.5', fullWidth ? 'w-full' : 'w-auto')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--molam-text)]"
          >
            {label}
            {rest.required && <span className="text-[var(--molam-error)] ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {startIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--molam-text-secondary)]">
              {startIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={clsx(
              baseStyles,
              sizeStyles[inputSize],
              statusStyles,
              startIcon && 'pl-10',
              endIcon && 'pr-10',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={helperTextId}
            {...rest}
          />

          {endIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--molam-text-secondary)]">
              {endIcon}
            </div>
          )}
        </div>

        {(helperText || error) && (
          <p
            id={helperTextId}
            className={clsx(
              'text-sm',
              error ? 'text-[var(--molam-error)]' : 'text-[var(--molam-text-secondary)]'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
