import React from 'react';
import clsx from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Optional title for the card
   */
  title?: React.ReactNode;

  /**
   * Optional subtitle or description
   */
  subtitle?: React.ReactNode;

  /**
   * Card padding size
   * @default 'md'
   */
  padding?: 'none' | 'sm' | 'md' | 'lg';

  /**
   * Enable hover effect
   * @default false
   */
  hoverable?: boolean;

  /**
   * Make card clickable
   */
  onClick?: () => void;
}

/**
 * Card component - Container for content with Apple-like styling
 *
 * @example
 * <Card title="Card Title" subtitle="Card subtitle">
 *   Content goes here
 * </Card>
 *
 * <Card hoverable onClick={() => console.log('clicked')}>
 *   Clickable card
 * </Card>
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      title,
      subtitle,
      padding = 'md',
      hoverable = false,
      onClick,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const baseStyles =
      'bg-[var(--molam-surface)] border border-[var(--molam-border)] rounded-[var(--molam-radius-lg)] shadow-[var(--molam-shadow-sm)] transition-all duration-[var(--transition-fast)]';

    const paddingStyles = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6'
    };

    const interactiveStyles = onClick || hoverable
      ? 'cursor-pointer hover:shadow-[var(--molam-shadow)] hover:-translate-y-0.5 active:translate-y-0'
      : '';

    const handleClick = () => {
      if (onClick) {
        onClick();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick();
      }
    };

    return (
      <div
        ref={ref}
        className={clsx(baseStyles, paddingStyles[padding], interactiveStyles, className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        {...rest}
      >
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h3 className="text-lg font-semibold text-[var(--molam-text)] mb-1">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-[var(--molam-text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
