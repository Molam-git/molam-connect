/**
 * Molam Checkout Web SDK - React Component
 *
 * Usage:
 * import { MolamCheckoutButton } from '@molam/connect-checkout';
 *
 * <MolamCheckoutButton
 *   sessionUrl="https://checkout.molam.com/checkout/session-id"
 *   label="Subscribe Now"
 *   onSuccess={() => console.log('Success!')}
 * />
 */
import React, { useState } from "react";

interface MolamCheckoutButtonProps {
  sessionUrl: string;
  label?: string;
  className?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  mode?: "redirect" | "modal";
}

export function MolamCheckoutButton({
  sessionUrl,
  label = "Subscribe Now",
  className = "",
  onSuccess,
  onCancel,
  onError,
  mode = "redirect",
}: MolamCheckoutButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = () => {
    if (mode === "redirect") {
      window.location.href = sessionUrl;
    } else {
      setIsModalOpen(true);
    }
  };

  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === "molam_checkout_success") {
      setIsModalOpen(false);
      onSuccess?.();
    } else if (event.data.type === "molam_checkout_cancel") {
      setIsModalOpen(false);
      onCancel?.();
    } else if (event.data.type === "molam_checkout_error") {
      setIsModalOpen(false);
      onError?.(new Error(event.data.message));
    }
  };

  React.useEffect(() => {
    if (mode === "modal") {
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [mode]);

  const defaultClassName =
    "inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors";

  return (
    <>
      <button
        onClick={handleClick}
        className={className || defaultClassName}
        type="button"
      >
        {label}
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsModalOpen(false)}></div>

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="absolute top-0 right-0 pt-4 pr-4">
                <button
                  type="button"
                  className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                  onClick={() => setIsModalOpen(false)}
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <iframe
                src={sessionUrl}
                className="w-full h-[600px]"
                title="Molam Checkout"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Lightweight JavaScript version (no React)
 *
 * Usage:
 * <script src="https://checkout.molam.com/sdk/molam-checkout.js"></script>
 * <script>
 *   MolamCheckout.createButton({
 *     sessionUrl: 'https://checkout.molam.com/checkout/session-id',
 *     containerId: 'checkout-button',
 *     label: 'Subscribe Now'
 *   });
 * </script>
 */
export const MolamCheckout = {
  createButton: (config: {
    sessionUrl: string;
    containerId: string;
    label?: string;
    onSuccess?: () => void;
    onCancel?: () => void;
  }) => {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container #${config.containerId} not found`);
    }

    const button = document.createElement("button");
    button.textContent = config.label || "Subscribe Now";
    button.className =
      "molam-checkout-button inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors";
    button.onclick = () => {
      window.location.href = config.sessionUrl;
    };

    container.appendChild(button);
  },
};
