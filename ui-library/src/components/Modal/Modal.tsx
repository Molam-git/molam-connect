import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { trapFocus } from '@/utils/a11y';

export interface ModalProps {
  /**
   * Modal open state
   */
  open: boolean;

  /**
   * Callback when modal should close
   */
  onClose: () => void;

  /**
   * Modal title
   */
  title?: React.ReactNode;

  /**
   * Modal content
   */
  children: React.ReactNode;

  /**
   * Footer content (usually buttons)
   */
  footer?: React.ReactNode;

  /**
   * Modal size
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';

  /**
   * Close modal on backdrop click
   * @default true
   */
  closeOnBackdrop?: boolean;

  /**
   * Close modal on Escape key
   * @default true
   */
  closeOnEscape?: boolean;
}

/**
 * Modal component - Overlay dialog with accessibility support
 *
 * @example
 * const [open, setOpen] = useState(false);
 *
 * <Modal
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Modal Title"
 *   footer={<Button onClick={() => setOpen(false)}>Close</Button>}
 * >
 *   Modal content goes here
 * </Modal>
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';

      const cleanup = modalRef.current ? trapFocus(modalRef.current) : undefined;

      return () => {
        document.body.style.overflow = '';
        previousActiveElement.current?.focus();
        cleanup?.();
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        className={clsx(
          'bg-[var(--molam-bg)] rounded-[var(--molam-radius-lg)] shadow-[var(--molam-shadow-lg)] w-full animate-scaleIn',
          sizeStyles[size]
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-[var(--molam-border)]">
            <h2
              id="modal-title"
              className="text-xl font-semibold text-[var(--molam-text)]"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--molam-text-secondary)] hover:text-[var(--molam-text)] transition-colors p-1 rounded-lg hover:bg-[var(--molam-surface)]"
              aria-label="Close modal"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15 5L5 15M5 5L15 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 text-[var(--molam-text)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--molam-border)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

Modal.displayName = 'Modal';
