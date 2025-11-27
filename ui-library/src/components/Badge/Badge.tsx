import React from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Badge variant
   * @default 'neutral'
   */
  variant?: BadgeVariant;

  /**
   * Badge size
   * @default 'md'
   */
  size?: BadgeSize;

  /**
   * Dot indicator instead of full badge
   * @default false
   */
  dot?: boolean;
}

/**
 * Badge component - Status indicators and labels
 *
 * @example
 * <Badge variant="success">Active</Badge>
 * <Badge variant="error" size="sm">Error</Badge>
 * <Badge dot>With dot indicator</Badge>
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'neutral',
      size = 'md',
      dot = false,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const sizeStyles: Record<BadgeSize, string> = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-1 text-xs',
      lg: 'px-3 py-1.5 text-sm'
    };

    const variantStyles: Record<BadgeVariant, string> = {
      primary: 'bg-[var(--molam-primary)] text-white',
      success: 'bg-[var(--molam-success)] text-white',
      warning: 'bg-[var(--molam-warning)] text-white',
      error: 'bg-[var(--molam-error)] text-white',
      neutral: 'bg-[var(--molam-border)] text-[var(--molam-text)]'
    };

    const dotVariantStyles: Record<BadgeVariant, string> = {
      primary: 'bg-[var(--molam-primary)]',
      success: 'bg-[var(--molam-success)]',
      warning: 'bg-[var(--molam-warning)]',
      error: 'bg-[var(--molam-error)]',
      neutral: 'bg-[var(--molam-border)]'
    };

    if (dot) {
      return (
        <span
          ref={ref}
          className={clsx('inline-flex items-center gap-2', className)}
          {...rest}
        >
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              dotVariantStyles[variant]
            )}
            aria-hidden="true"
          />
          {children && (
            <span className="text-sm text-[var(--molam-text)]">{children}</span>
          )}
        </span>
      );
    }

    return (
      <span
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-full',
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        {...rest}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
