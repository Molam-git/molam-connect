import React from 'react';
import clsx from 'clsx';

export interface TopbarProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Logo or brand element
   */
  logo?: React.ReactNode;

  /**
   * Navigation items in the center
   */
  navigation?: React.ReactNode;

  /**
   * Actions on the right (user menu, notifications, etc.)
   */
  actions?: React.ReactNode;

  /**
   * Sticky position at top
   * @default true
   */
  sticky?: boolean;

  /**
   * Add shadow below topbar
   * @default true
   */
  shadow?: boolean;
}

/**
 * Topbar component - Application header with logo, navigation, and actions
 *
 * @example
 * <Topbar
 *   logo={<div>Logo</div>}
 *   navigation={<nav>Links</nav>}
 *   actions={<Button>Login</Button>}
 * />
 */
export const Topbar = React.forwardRef<HTMLElement, TopbarProps>(
  (
    {
      logo,
      navigation,
      actions,
      sticky = true,
      shadow = true,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <header
        ref={ref}
        className={clsx(
          'w-full bg-[var(--molam-bg)] border-b border-[var(--molam-border)] z-40 transition-all',
          sticky && 'sticky top-0',
          shadow && 'shadow-[var(--molam-shadow-sm)]',
          className
        )}
        {...rest}
      >
        <div className="flex items-center justify-between h-16 px-6 max-w-[1600px] mx-auto">
          {/* Logo */}
          {logo && (
            <div className="flex items-center flex-shrink-0">
              {logo}
            </div>
          )}

          {/* Navigation */}
          {navigation && (
            <div className="flex items-center flex-1 justify-center px-4">
              {navigation}
            </div>
          )}

          {/* Actions */}
          {actions && (
            <div className="flex items-center gap-3 flex-shrink-0">
              {actions}
            </div>
          )}

          {/* Fallback to children if no slots provided */}
          {!logo && !navigation && !actions && children}
        </div>
      </header>
    );
  }
);

Topbar.displayName = 'Topbar';
