/**
 * Card payment method component with hosted fields support
 * Implements PCI scope reduction via iframe-based tokenization
 */

import React, { useEffect, useRef, useState } from 'react';
import type { TelemetryEvent, HostedFieldsConfig } from '../../types';
import { mountHostedFields, unmountHostedFields, type HostedFieldsInstance } from '../../utils/hosted-fields';

export interface CardInlineProps {
  onEvent?: (event: TelemetryEvent) => void;
  config?: {
    useHostedFields?: boolean;
    clientToken?: string;
  };
  autoFocus?: boolean;
}

export const CardInline: React.FC<CardInlineProps> = ({
  onEvent,
  config = { useHostedFields: true },
  autoFocus = false,
}) => {
  const [hostedFieldsReady, setHostedFieldsReady] = useState(false);
  const [cardToken, setCardToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientToken, setClientToken] = useState<string | null>(config.clientToken || null);

  const hostedFieldsRef = useRef<HostedFieldsInstance | null>(null);
  const cardNumberRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const cvvRef = useRef<HTMLDivElement>(null);

  // Fetch client token for hosted fields
  useEffect(() => {
    if (config.useHostedFields && !clientToken) {
      fetchClientToken();
    }
  }, [config.useHostedFields, clientToken]);

  const fetchClientToken = async () => {
    try {
      const response = await fetch('/api/hosted-fields/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setClientToken(data.token);
        onEvent?.({ name: 'hosted_fields_token_received' });
      } else {
        throw new Error('Failed to fetch client token');
      }
    } catch (error: any) {
      setError('Unable to load secure payment form');
      onEvent?.({ name: 'hosted_fields_token_error', payload: { error: error.message } });
    }
  };

  // Mount hosted fields when token is available
  useEffect(() => {
    if (!config.useHostedFields || !clientToken) return;
    if (!cardNumberRef.current || !expiryRef.current || !cvvRef.current) return;

    const initHostedFields = async () => {
      try {
        onEvent?.({ name: 'hosted_fields_init_start' });

        const hostedFieldsConfig: HostedFieldsConfig = {
          clientToken,
          styles: {
            base: {
              fontSize: '16px',
              color: '#0b1220',
              fontFamily: 'Inter, system-ui, sans-serif',
            },
            invalid: {
              color: '#ef4444',
            },
          },
          fields: {
            cardNumber: true,
            expiryDate: true,
            cvv: true,
            cardholderName: false, // Optional field
          },
        };

        const instance = await mountHostedFields(
          {
            cardNumber: cardNumberRef.current!,
            expiry: expiryRef.current!,
            cvv: cvvRef.current!,
          },
          hostedFieldsConfig
        );

        hostedFieldsRef.current = instance;
        setHostedFieldsReady(true);
        onEvent?.({ name: 'hosted_fields_mounted' });

        // Listen for tokenization
        instance.on('tokenized', (data) => {
          setCardToken(data.token);
          onEvent?.({ name: 'card_tokenized', payload: { hasToken: true } });
        });

        instance.on('error', (error) => {
          setError(error.message);
          onEvent?.({ name: 'hosted_fields_error', payload: { error: error.message } });
        });
      } catch (error: any) {
        setError('Failed to load secure payment form');
        onEvent?.({ name: 'hosted_fields_init_error', payload: { error: error.message } });
      }
    };

    initHostedFields();

    return () => {
      if (hostedFieldsRef.current) {
        unmountHostedFields(hostedFieldsRef.current);
        hostedFieldsRef.current = null;
      }
    };
  }, [config.useHostedFields, clientToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config.useHostedFields) {
    // Fallback: Direct input (NOT PCI COMPLIANT - for development only)
    return (
      <div className="card-form-direct" role="group" aria-label="Card payment details">
        <div className="warning-banner" role="alert">
          ⚠️ Development mode - Hosted fields disabled
        </div>
        <input
          type="text"
          placeholder="Card number"
          className="card-input"
          aria-label="Card number"
          autoFocus={autoFocus}
        />
        <div className="card-row">
          <input
            type="text"
            placeholder="MM/YY"
            className="card-input"
            aria-label="Expiry date"
          />
          <input
            type="text"
            placeholder="CVV"
            className="card-input"
            aria-label="CVV"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card-form-hosted" role="group" aria-label="Secure card payment">
      <div className="hosted-fields-notice">
        <span className="security-icon" aria-hidden="true">🔒</span>
        <span>Secure card entry (PCI compliant)</span>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {/* Hosted field containers */}
      <div className="card-field-group">
        <label htmlFor="card-number-field" className="field-label">
          Card number
        </label>
        <div
          id="card-number-field"
          ref={cardNumberRef}
          className="hosted-field"
          aria-label="Card number (secured)"
          tabIndex={autoFocus ? 0 : -1}
        />
      </div>

      <div className="card-row">
        <div className="card-field-group">
          <label htmlFor="expiry-field" className="field-label">
            Expiry
          </label>
          <div
            id="expiry-field"
            ref={expiryRef}
            className="hosted-field"
            aria-label="Expiry date (secured)"
          />
        </div>

        <div className="card-field-group">
          <label htmlFor="cvv-field" className="field-label">
            CVV
          </label>
          <div
            id="cvv-field"
            ref={cvvRef}
            className="hosted-field"
            aria-label="CVV security code (secured)"
          />
        </div>
      </div>

      {!hostedFieldsReady && (
        <div className="loading-indicator" aria-live="polite">
          Loading secure payment form...
        </div>
      )}

      <div className="card-security-badges">
        <span>Visa</span>
        <span>Mastercard</span>
        <span>3D Secure</span>
      </div>
    </div>
  );
};
