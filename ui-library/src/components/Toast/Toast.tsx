import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface ToastProps {
  /**
   * Toast message
   */
  message: React.ReactNode;

  /**
   * Toast variant
   * @default 'info'
   */
  variant?: ToastVariant;

  /**
   * Auto close duration in ms (0 = no auto close)
   * @default 5000
   */
  duration?: number;

  /**
   * Callback when toast closes
   */
  onClose: () => void;

  /**
   * Toast position
   * @default 'top-right'
   */
  position?: ToastPosition;

  /**
   * Show close button
   * @default true
   */
  closable?: boolean;
}

/**
 * Toast component - Notification toast message
 *
 * @example
 * const [toast, setToast] = useState(null);
 *
 * <Toast
 *   message="Operation successful!"
 *   variant="success"
 *   onClose={() => setToast(null)}
 * />
 */
export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'info',
  duration = 5000,
  onClose,
  position = 'top-right',
  closable = true
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
    info: { bg: 'bg-[var(--molam-info)]', border: 'border-[var(--molam-info)]', icon: 'ℹ️' },
    success: { bg: 'bg-[var(--molam-success)]', border: 'border-[var(--molam-success)]', icon: '✓' },
    warning: { bg: 'bg-[var(--molam-warning)]', border: 'border-[var(--molam-warning)]', icon: '⚠️' },
    error: { bg: 'bg-[var(--molam-error)]', border: 'border-[var(--molam-error)]', icon: '✕' }
  };

  const positionStyles: Record<ToastPosition, string> = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4'
  };

  const styles = variantStyles[variant];

  const toastContent = (
    <div
      className={clsx(
        'fixed z-50 flex items-center gap-3 min-w-[320px] max-w-md',
        'bg-[var(--molam-surface)] border-l-4 rounded-[var(--molam-radius)] shadow-[var(--molam-shadow-lg)]',
        'px-4 py-3 animate-slideIn',
        styles.border,
        positionStyles[position]
      )}
      role="alert"
      aria-live="polite"
    >
      <span className="text-xl" aria-hidden="true">{styles.icon}</span>
      <div className="flex-1 text-sm text-[var(--molam-text)]">{message}</div>
      {closable && (
        <button
          onClick={onClose}
          className="text-[var(--molam-text-secondary)] hover:text-[var(--molam-text)] transition-colors p-1"
          aria-label="Close notification"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );

  return createPortal(toastContent, document.body);
};

Toast.displayName = 'Toast';
