import React from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style variant
   * @default 'primary'
   */
  variant?: ButtonVariant;

  /**
   * Button size
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Full width button
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Loading state with spinner
   * @default false
   */
  loading?: boolean;

  /**
   * Icon to display before children
   */
  startIcon?: React.ReactNode;

  /**
   * Icon to display after children
   */
  endIcon?: React.ReactNode;
}

/**
 * Button component - Primary interaction element
 *
 * @example
 * <Button variant="primary" size="md">Click me</Button>
 * <Button variant="ghost" startIcon={<Icon />}>With icon</Button>
 * <Button loading>Loading...</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      startIcon,
      endIcon,
      className,
      children,
      disabled,
      ...rest
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-[var(--molam-radius)] transition-all duration-[var(--transition-fast)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--molam-primary)] disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-5 py-3 text-base gap-2.5'
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-[var(--molam-primary)] text-[var(--molam-on-primary)] shadow-[var(--molam-shadow-sm)] hover:opacity-90 active:opacity-80',
      ghost:
        'bg-transparent text-[var(--molam-text)] hover:bg-[var(--molam-surface)] active:bg-[var(--molam-border)]',
      outline:
        'bg-transparent border-2 border-[var(--molam-border)] text-[var(--molam-text)] hover:bg-[var(--molam-surface)] active:bg-[var(--molam-border)]',
      danger:
        'bg-[var(--molam-error)] text-white shadow-[var(--molam-shadow-sm)] hover:opacity-90 active:opacity-80'
    };

    return (
      <button
        ref={ref}
        className={clsx(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading}
        {...rest}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
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
        {!loading && startIcon && <span aria-hidden="true">{startIcon}</span>}
        {children}
        {!loading && endIcon && <span aria-hidden="true">{endIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
