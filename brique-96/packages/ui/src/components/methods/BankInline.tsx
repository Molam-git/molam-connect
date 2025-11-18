/**
 * Bank transfer payment method component
 */

import React, { useState } from 'react';
import type { UserPrefill, TelemetryEvent } from '../../types';

export interface BankInlineProps {
  prefill?: UserPrefill | null;
  country?: string;
  onEvent?: (event: TelemetryEvent) => void;
  autoFocus?: boolean;
}

export const BankInline: React.FC<BankInlineProps> = ({
  prefill,
  country,
  onEvent,
  autoFocus = false,
}) => {
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');

  const ibanCountries = ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF', 'NE'];
  const useIban = country && ibanCountries.includes(country);

  return (
    <div className="bank-form" role="group" aria-label="Bank transfer details">
      <div className="bank-notice">
        <span className="info-icon" aria-hidden="true">ℹ️</span>
        <span>Bank transfer will be processed within 1-2 business days</span>
      </div>

      {useIban ? (
        <div className="field-group">
          <label htmlFor="iban" className="field-label">
            IBAN
            <span className="required" aria-label="required">*</span>
          </label>
          <input
            id="iban"
            type="text"
            placeholder="SN12 1234 5678 9012 3456 7890 12"
            className="bank-input"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            autoFocus={autoFocus}
            aria-required="true"
            pattern="[A-Z]{2}[0-9]{2}[A-Z0-9]+"
          />
          <div className="field-hint">
            Your International Bank Account Number
          </div>
        </div>
      ) : (
        <>
          <div className="field-group">
            <label htmlFor="account-number" className="field-label">
              Account number
              <span className="required" aria-label="required">*</span>
            </label>
            <input
              id="account-number"
              type="text"
              placeholder="1234567890"
              className="bank-input"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              autoFocus={autoFocus}
              aria-required="true"
            />
          </div>

          <div className="field-group">
            <label htmlFor="bank-code" className="field-label">
              Bank code
              <span className="required" aria-label="required">*</span>
            </label>
            <input
              id="bank-code"
              type="text"
              placeholder="Enter your bank code"
              className="bank-input"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              aria-required="true"
            />
          </div>
        </>
      )}

      {prefill?.email && (
        <div className="field-group">
          <label htmlFor="email" className="field-label">
            Email (for confirmation)
          </label>
          <input
            id="email"
            type="email"
            className="bank-input"
            value={prefill.email}
            readOnly
            aria-readonly="true"
          />
        </div>
      )}

      <div className="bank-info">
        <h4>What happens next?</h4>
        <ol>
          <li>You'll receive bank transfer instructions via email</li>
          <li>Complete the transfer from your bank</li>
          <li>We'll confirm your payment within 1-2 business days</li>
        </ol>
      </div>
    </div>
  );
};
