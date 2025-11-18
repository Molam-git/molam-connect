/**
 * USSD payment method component
 * Supports offline payments via USSD codes
 */

import React, { useEffect, useState } from 'react';
import type { TelemetryEvent } from '../../types';

export interface USSDInlineProps {
  country?: string;
  onEvent?: (event: TelemetryEvent) => void;
}

interface USSDProvider {
  name: string;
  code: string;
  icon: string;
}

export const USSDInline: React.FC<USSDInlineProps> = ({
  country = 'SN',
  onEvent,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<USSDProvider | null>(null);
  const [ussdCode, setUssdCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Get USSD providers by country
  const providers = getUSSDProviders(country);

  useEffect(() => {
    if (providers.length > 0) {
      setSelectedProvider(providers[0]);
    }
  }, [country]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedProvider) {
      generateUSSDSession();
    }
  }, [selectedProvider]);

  const generateUSSDSession = async () => {
    if (!selectedProvider) return;

    onEvent?.({ name: 'ussd_session_start', payload: { provider: selectedProvider.name } });

    try {
      const response = await fetch('/api/payments/ussd-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider.name,
          country,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setUssdCode(data.ussdCode);
        setSessionId(data.sessionId);
        onEvent?.({ name: 'ussd_code_generated', payload: { provider: selectedProvider.name } });
      }
    } catch (error: any) {
      onEvent?.({ name: 'ussd_error', payload: { error: error.message } });
    }
  };

  const handleCopyCode = async () => {
    if (ussdCode) {
      try {
        await navigator.clipboard.writeText(ussdCode);
        onEvent?.({ name: 'ussd_code_copied' });
        // Show toast notification
      } catch (error) {
        console.warn('Failed to copy USSD code');
      }
    }
  };

  return (
    <div className="ussd-payment" role="group" aria-label="USSD payment">
      <div className="ussd-instructions">
        <h3>Pay via USSD</h3>
        <p>Dial the code below from your phone to complete payment</p>
      </div>

      {/* Provider selection */}
      <div className="ussd-providers">
        <label htmlFor="ussd-provider" className="field-label">
          Select your mobile operator
        </label>
        <div className="provider-list" role="radiogroup" aria-label="Mobile operators">
          {providers.map((provider) => (
            <label
              key={provider.code}
              className={`provider-option ${selectedProvider?.code === provider.code ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="ussd-provider"
                value={provider.code}
                checked={selectedProvider?.code === provider.code}
                onChange={() => setSelectedProvider(provider)}
                className="sr-only"
              />
              <span className="provider-icon" aria-hidden="true">{provider.icon}</span>
              <span className="provider-name">{provider.name}</span>
              {selectedProvider?.code === provider.code && (
                <span className="check-icon" aria-hidden="true">✓</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* USSD code display */}
      {ussdCode && (
        <div className="ussd-code-container">
          <div className="ussd-code-display" role="region" aria-label="USSD code">
            <div className="code-label">Dial this code:</div>
            <div className="ussd-code" aria-live="polite">
              <code>{ussdCode}</code>
            </div>
            <button
              type="button"
              className="copy-button"
              onClick={handleCopyCode}
              aria-label="Copy USSD code"
            >
              📋 Copy code
            </button>
          </div>

          <div className="ussd-steps">
            <h4>Steps to complete payment:</h4>
            <ol>
              <li>
                <strong>Dial</strong> <code>{ussdCode}</code> from your phone
              </li>
              <li>
                <strong>Follow</strong> the on-screen menu
              </li>
              <li>
                <strong>Confirm</strong> the payment
              </li>
              <li>
                <strong>Wait</strong> for confirmation SMS
              </li>
            </ol>
          </div>

          {sessionId && (
            <div className="ussd-reference" role="note">
              <p>Reference: {sessionId}</p>
              <p className="hint-text">Keep this reference for your records</p>
            </div>
          )}
        </div>
      )}

      <div className="ussd-offline-notice" role="note">
        <span className="info-icon" aria-hidden="true">ℹ️</span>
        <span>USSD works without internet connection</span>
      </div>

      <div className="ussd-help">
        <details>
          <summary>Need help?</summary>
          <div className="help-content">
            <p>If you encounter issues:</p>
            <ul>
              <li>Ensure you have network coverage</li>
              <li>Check your phone balance</li>
              <li>Make sure your SIM card is active</li>
              <li>Try dialing again if timeout occurs</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
};

/**
 * Get USSD providers by country
 */
function getUSSDProviders(country: string): USSDProvider[] {
  const providersByCountry: Record<string, USSDProvider[]> = {
    SN: [ // Senegal
      { name: 'Orange Money', code: '#144#', icon: '🟠' },
      { name: 'Free Money', code: '#555#', icon: '🔵' },
      { name: 'Wizall', code: '#166#', icon: '🟢' },
    ],
    CI: [ // Côte d'Ivoire
      { name: 'Orange Money', code: '#144#', icon: '🟠' },
      { name: 'MTN Mobile Money', code: '*133#', icon: '🟡' },
      { name: 'Moov Money', code: '#303#', icon: '🔵' },
    ],
    ML: [ // Mali
      { name: 'Orange Money', code: '#144#', icon: '🟠' },
      { name: 'Moov Money', code: '#333#', icon: '🔵' },
    ],
    BF: [ // Burkina Faso
      { name: 'Orange Money', code: '#144#', icon: '🟠' },
      { name: 'Moov Money', code: '#303#', icon: '🔵' },
    ],
    // Add more countries as needed
  };

  return providersByCountry[country] || providersByCountry['SN']; // Default to Senegal
}
