/**
 * CheckoutInline - Main checkout component with Apple-like minimal design
 * @module @molam/ui/CheckoutInline
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type {
  PaymentMethod,
  PaymentPayload,
  PaymentResult,
  SiraHints,
  UserPrefill,
  TelemetryEvent,
  Theme,
  CheckoutConfig,
  NetworkStatus,
} from '../types';
import { WalletInline } from './methods/WalletInline';
import { CardInline } from './methods/CardInline';
import { BankInline } from './methods/BankInline';
import { QRInline } from './methods/QRInline';
import { USSDInline } from './methods/USSDInline';
import { formatCurrency } from '../utils/currency';
import { getLocaleStrings } from '../utils/locale';
import { detectNetworkStatus } from '../utils/network';

export interface CheckoutInlineProps {
  /** Amount to charge (in smallest currency unit, e.g., cents) */
  amount: number;

  /** Currency code (ISO 4217) */
  currency: string;

  /** Locale for formatting and translations (BCP 47) */
  locale?: string;

  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;

  /** Molam ID JWT token for user prefill */
  molamIdToken?: string;

  /** Callback when payment is submitted */
  onSubmit: (payload: PaymentPayload) => Promise<PaymentResult>;

  /** Callback for telemetry events */
  onEvent?: (event: TelemetryEvent) => void;

  /** SIRA AI hints for optimizing UX */
  sira?: SiraHints;

  /** Allowed payment methods (filtered by country/merchant) */
  allowedMethods?: PaymentMethod[];

  /** Theme configuration */
  theme?: Theme;

  /** Auto-focus first input on mount */
  autoFocus?: boolean;

  /** Additional configuration options */
  config?: CheckoutConfig;

  /** Custom CSS class name */
  className?: string;

  /** Test ID for automated testing */
  testId?: string;
}

/**
 * Main checkout component with progressive disclosure and accessibility
 */
export const CheckoutInline: React.FC<CheckoutInlineProps> = ({
  amount,
  currency,
  locale = 'en',
  country,
  molamIdToken,
  onSubmit,
  onEvent,
  sira,
  allowedMethods = ['wallet', 'card', 'bank', 'qr', 'ussd'],
  theme = 'light',
  autoFocus = false,
  config = {},
  className,
  testId = 'molam-checkout',
}) => {
  // Generate unique request ID for telemetry
  const requestId = useRef(`req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const sessionId = useRef(`sess_${Date.now()}`);

  // State management
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(() => {
    // Prioritize SIRA hint > Wallet (if allowed) > First allowed method
    if (sira?.preferredMethod && allowedMethods.includes(sira.preferredMethod)) {
      return sira.preferredMethod;
    }
    if (sira?.showWalletFirst && allowedMethods.includes('wallet')) {
      return 'wallet';
    }
    return allowedMethods[0];
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<UserPrefill | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({ isOnline: true });
  const [showAllMethods, setShowAllMethods] = useState(false);

  const strings = getLocaleStrings(locale);

  // Emit telemetry event helper
  const emitEvent = useCallback(
    (name: string, payload?: Record<string, any>) => {
      onEvent?.({
        name,
        payload,
        timestamp: Date.now(),
        requestId: requestId.current,
        sessionId: sessionId.current,
      });
    },
    [onEvent]
  );

  // Component mount - emit shown event
  useEffect(() => {
    emitEvent('component_shown', {
      amount,
      currency,
      country,
      locale,
      allowedMethods,
      selectedMethod,
      siraHints: sira ? {
        preferredMethod: sira.preferredMethod,
        fraudScore: sira.fraudScore,
        recommendedRouting: sira.recommendedRouting,
      } : undefined,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill user data from Molam ID
  useEffect(() => {
    if (!molamIdToken) return;

    const fetchPrefill = async () => {
      try {
        emitEvent('molam_id_prefill_start');

        // Call Molam ID API to get user profile
        const response = await fetch('/api/molam-id/profile', {
          headers: {
            Authorization: `Bearer ${molamIdToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const prefillData: UserPrefill = {
            phone: data.phone,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            country: data.country || country,
            currency: data.preferredCurrency || currency,
            language: data.preferredLanguage || locale,
          };

          setPrefill(prefillData);
          emitEvent('molam_id_prefill_success', { hasPrefill: true });
        } else {
          emitEvent('molam_id_prefill_failed', { status: response.status });
        }
      } catch (error: any) {
        emitEvent('molam_id_prefill_error', { error: error.message });
        console.warn('Failed to fetch Molam ID prefill:', error);
      }
    };

    fetchPrefill();
  }, [molamIdToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Monitor network status for offline fallback
  useEffect(() => {
    if (!config?.features?.offlineMode) return;

    const checkNetwork = async () => {
      const status = await detectNetworkStatus();
      setNetworkStatus(status);

      if (!status.isOnline) {
        emitEvent('network_offline_detected', { quality: status.quality });

        // Switch to offline-capable methods (QR, USSD)
        if (!['qr', 'ussd'].includes(selectedMethod)) {
          if (allowedMethods.includes('qr')) {
            setSelectedMethod('qr');
          } else if (allowedMethods.includes('ussd')) {
            setSelectedMethod('ussd');
          }
        }
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, [config?.features?.offlineMode, selectedMethod, allowedMethods]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle method selection
  const handleMethodSelect = useCallback(
    (method: PaymentMethod) => {
      setSelectedMethod(method);
      setError(null);
      emitEvent('payment_method_selected', { method, previousMethod: selectedMethod });
    },
    [selectedMethod, emitEvent]
  );

  // Handle form submission
  const handleSubmit = async (event?: React.FormEvent, methodData?: any) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);

    emitEvent('checkout_start', {
      method: selectedMethod,
      amount,
      currency,
      hasPrefill: !!prefill,
    });

    try {
      // Build payment payload
      const payload: PaymentPayload = {
        amount,
        currency,
        method: selectedMethod,
        prefill,
        metadata: {
          locale,
          country,
          siraRecommendation: sira?.preferredMethod,
          networkQuality: networkStatus.quality,
        },
        idempotencyKey: `idem_${requestId.current}`,
        ...methodData,
      };

      const result = await onSubmit(payload);

      if (result.success) {
        emitEvent('checkout_success', {
          method: selectedMethod,
          transactionId: result.transactionId,
        });
      } else {
        setError(result.error || strings.genericError);
        emitEvent('checkout_failed', {
          method: selectedMethod,
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      // Handle additional actions (3DS, redirects)
      if (result.requiresAction && result.redirectUrl) {
        emitEvent('checkout_requires_action', { redirectUrl: result.redirectUrl });
        window.location.href = result.redirectUrl;
      }
    } catch (error: any) {
      const errorMessage = error.message || strings.networkError;
      setError(errorMessage);
      emitEvent('checkout_error', {
        error: errorMessage,
        method: selectedMethod,
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine methods to display (progressive disclosure)
  const displayedMethods = showAllMethods
    ? allowedMethods
    : allowedMethods.slice(0, 3);

  // ARIA live region for announcements
  const [announcement, setAnnouncement] = useState<string>('');

  const announce = (message: string) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(''), 3000);
  };

  useEffect(() => {
    if (error) {
      announce(`Error: ${error}`);
    }
  }, [error]);

  return (
    <div
      className={clsx('molam-checkout', `theme-${typeof theme === 'string' ? theme : 'custom'}`, className)}
      data-testid={testId}
      role="region"
      aria-label={strings.securePayment}
    >
      {/* Screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Header with amount */}
      <header className="molam-header" role="group" aria-label={strings.amountLabel}>
        <div className="molam-amount" aria-label={`${strings.pay} ${formatCurrency(amount, currency, locale)}`}>
          {formatCurrency(amount, currency, locale)}
        </div>
        <div className="molam-description">
          {strings.securePayment}
          {sira?.fraudScore !== undefined && sira.fraudScore < 0.3 && (
            <span className="security-badge" aria-label="Low risk transaction">
              🔒 {/* Security badge */}
            </span>
          )}
        </div>
      </header>

      {/* SIRA recommendation hint */}
      {sira?.preferredMethod && sira.confidence && sira.confidence > 0.7 && (
        <div className="molam-hint" role="note">
          ✨ Recommended: {strings[sira.preferredMethod]} {sira.reasons?.[0] ? `(${sira.reasons[0]})` : ''}
        </div>
      )}

      {/* Network status indicator */}
      {!networkStatus.isOnline && (
        <div className="molam-offline-notice" role="alert">
          📡 Offline mode - Using QR/USSD for payment
        </div>
      )}

      {/* Payment method selection */}
      <fieldset className="molam-methods" aria-label={strings.paymentMethodsLabel}>
        <legend className="sr-only">{strings.paymentMethodsLabel}</legend>

        {displayedMethods.map((method) => (
          <label
            key={method}
            className={clsx('molam-method', {
              selected: method === selectedMethod,
              recommended: sira?.preferredMethod === method,
            })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMethodSelect(method);
              }
            }}
          >
            <input
              type="radio"
              name="payment-method"
              value={method}
              checked={method === selectedMethod}
              onChange={() => handleMethodSelect(method)}
              aria-checked={method === selectedMethod}
              className="sr-only"
            />
            <span className="method-icon" aria-hidden="true">
              {getMethodIcon(method)}
            </span>
            <span className="method-content">
              <span className="method-label">{strings[method]}</span>
              <span className="method-hint">{strings[`${method}Hint`]}</span>
            </span>
            {method === selectedMethod && (
              <span className="check-icon" aria-hidden="true">
                ✓
              </span>
            )}
          </label>
        ))}

        {/* Show more methods button */}
        {!showAllMethods && allowedMethods.length > 3 && (
          <button
            type="button"
            className="molam-show-more"
            onClick={() => {
              setShowAllMethods(true);
              emitEvent('show_all_methods_clicked');
            }}
            aria-expanded={showAllMethods}
          >
            + {allowedMethods.length - 3} more options
          </button>
        )}
      </fieldset>

      {/* Method-specific details (progressive disclosure) */}
      <div className="molam-method-details" role="region" aria-live="polite">
        {selectedMethod === 'wallet' && (
          <WalletInline
            prefill={prefill}
            molamIdToken={molamIdToken}
            onEvent={emitEvent}
            autoFocus={autoFocus}
          />
        )}
        {selectedMethod === 'card' && (
          <CardInline
            onEvent={emitEvent}
            config={config?.features?.hostedFields !== false ? { useHostedFields: true } : undefined}
            autoFocus={autoFocus}
          />
        )}
        {selectedMethod === 'bank' && (
          <BankInline
            prefill={prefill}
            country={country}
            onEvent={emitEvent}
            autoFocus={autoFocus}
          />
        )}
        {selectedMethod === 'qr' && (
          <QRInline
            amount={amount}
            currency={currency}
            onEvent={emitEvent}
          />
        )}
        {selectedMethod === 'ussd' && (
          <USSDInline
            country={country}
            onEvent={emitEvent}
          />
        )}
      </div>

      {/* High-risk warning */}
      {sira?.requireAdditionalVerification && (
        <div className="molam-security-notice" role="alert">
          🔐 Additional verification will be required for this transaction
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="molam-error" role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠️</span> {error}
        </div>
      )}

      {/* Submit button */}
      <div className="molam-actions">
        <button
          type="submit"
          className="molam-submit-button"
          onClick={handleSubmit}
          disabled={loading}
          aria-busy={loading}
          aria-label={loading ? strings.processing : `${strings.pay} ${formatCurrency(amount, currency, locale)}`}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {strings.processing}
            </>
          ) : (
            `${strings.pay} ${formatCurrency(amount, currency, locale)}`
          )}
        </button>
      </div>

      {/* Footer */}
      <footer className="molam-footer">
        <div className="security-badges">
          <span>🔒 Secure payment</span>
          <span>PCI DSS compliant</span>
        </div>
      </footer>
    </div>
  );
};

/**
 * Get icon for payment method
 */
function getMethodIcon(method: PaymentMethod): string {
  const icons: Record<PaymentMethod, string> = {
    wallet: '💳',
    card: '💳',
    bank: '🏦',
    qr: '📱',
    ussd: '📞',
  };
  return icons[method];
}

export default CheckoutInline;
