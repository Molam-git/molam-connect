import React from 'react';
import clsx from 'clsx';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Header content (logo, branding)
   */
  header?: React.ReactNode;

  /**
   * Footer content (user info, logout)
   */
  footer?: React.ReactNode;

  /**
   * Sidebar width
   * @default '280px'
   */
  width?: string;

  /**
   * Collapsed state
   * @default false
   */
  collapsed?: boolean;

  /**
   * Position side
   * @default 'left'
   */
  position?: 'left' | 'right';
}

/**
 * Sidebar component - Vertical navigation sidebar
 *
 * @example
 * <Sidebar header={<div>Logo</div>} footer={<div>User</div>}>
 *   <nav>Navigation items</nav>
 * </Sidebar>
 */
export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      header,
      footer,
      width = '280px',
      collapsed = false,
      position = 'left',
      className,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <aside
        ref={ref}
        className={clsx(
          'flex flex-col bg-[var(--molam-surface)] border-[var(--molam-border)] transition-all duration-300 h-screen overflow-hidden',
          position === 'left' ? 'border-r' : 'border-l',
          className
        )}
        style={{
          width: collapsed ? '64px' : width,
          minWidth: collapsed ? '64px' : width,
        }}
        {...rest}
      >
        {/* Header */}
        {header && (
          <div className={clsx(
            'flex items-center px-4 py-4 border-b border-[var(--molam-border)]',
            collapsed ? 'justify-center' : 'justify-start'
          )}>
            {header}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className={clsx(
            'px-4 py-4 border-t border-[var(--molam-border)]',
            collapsed ? 'flex justify-center' : ''
          )}>
            {footer}
          </div>
        )}
      </aside>
    );
  }
);

Sidebar.displayName = 'Sidebar';

// SidebarItem subcomponent
export interface SidebarItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /**
   * Icon before label
   */
  icon?: React.ReactNode;

  /**
   * Item label
   */
  label?: string;

  /**
   * Active state
   * @default false
   */
  active?: boolean;

  /**
   * Collapsed state (hides label)
   * @default false
   */
  collapsed?: boolean;
}

export const SidebarItem = React.forwardRef<HTMLAnchorElement, SidebarItemProps>(
  (
    {
      icon,
      label,
      active = false,
      collapsed = false,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <a
        ref={ref}
        className={clsx(
          'flex items-center gap-3 px-4 py-3 mx-2 rounded-[var(--molam-radius)] transition-all cursor-pointer',
          'hover:bg-[var(--molam-bg)] text-[var(--molam-text)]',
          active && 'bg-[var(--molam-primary)] text-[var(--molam-on-primary)] hover:bg-[var(--molam-primary)]',
          collapsed && 'justify-center px-2',
          className
        )}
        {...rest}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {!collapsed && (label || children) && (
          <span className="flex-1 font-medium text-sm">{label || children}</span>
        )}
      </a>
    );
  }
);

SidebarItem.displayName = 'SidebarItem';
