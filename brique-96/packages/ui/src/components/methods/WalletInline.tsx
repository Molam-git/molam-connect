/**
 * Wallet payment method component
 */

import React, { useState, useEffect } from 'react';
import type { UserPrefill, TelemetryEvent } from '../../types';

export interface WalletInlineProps {
  prefill?: UserPrefill | null;
  molamIdToken?: string;
  onEvent?: (event: TelemetryEvent) => void;
  autoFocus?: boolean;
}

export const WalletInline: React.FC<WalletInlineProps> = ({
  prefill,
  molamIdToken,
  onEvent,
  autoFocus = false,
}) => {
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (molamIdToken) {
      fetchWalletBalance();
    }
  }, [molamIdToken]);

  const fetchWalletBalance = async () => {
    if (!molamIdToken) return;

    setLoading(true);
    try {
      const response = await fetch('/api/wallet/balance', {
        headers: {
          Authorization: `Bearer ${molamIdToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWalletBalance(data.balance);
        onEvent?.({ name: 'wallet_balance_fetched', payload: { hasBalance: data.balance > 0 } });
      }
    } catch (error) {
      console.warn('Failed to fetch wallet balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMolamIdSignIn = () => {
    onEvent?.({ name: 'molam_id_signin_clicked', payload: { method: 'wallet' } });

    // Open Molam ID modal/SDK
    if (typeof window !== 'undefined' && (window as any).MolamID) {
      (window as any).MolamID.signIn({
        onSuccess: (token: string) => {
          onEvent?.({ name: 'molam_id_signin_success' });
          // Token will be passed back to parent component
        },
        onError: (error: any) => {
          onEvent?.({ name: 'molam_id_signin_error', payload: { error: error.message } });
        },
      });
    } else {
      // Fallback: redirect to Molam ID page
      window.location.href = `/auth/molam-id?redirect=${encodeURIComponent(window.location.href)}`;
    }
  };

  if (!molamIdToken || !prefill?.phone) {
    return (
      <div className="wallet-signin" role="group" aria-label="Molam Wallet sign in">
        <div className="wallet-message">
          <p>Sign in with Molam ID to use your wallet</p>
        </div>
        <button
          type="button"
          className="molam-id-button"
          onClick={handleMolamIdSignIn}
          autoFocus={autoFocus}
          aria-label="Sign in with Molam ID"
        >
          <span className="molam-id-icon" aria-hidden="true">🔑</span>
          Sign in with Molam ID
        </button>
        <div className="wallet-benefits">
          <ul>
            <li>✓ Instant payment</li>
            <li>✓ Lower fees</li>
            <li>✓ Secure & encrypted</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-details" role="group" aria-label="Molam Wallet payment details">
      <div className="wallet-user-info">
        <div className="user-avatar" aria-hidden="true">
          {prefill.firstName?.[0] || prefill.phone[0]}
        </div>
        <div className="user-details">
          <div className="user-name">
            {prefill.firstName && prefill.lastName
              ? `${prefill.firstName} ${prefill.lastName}`
              : prefill.phone}
          </div>
          <div className="user-phone">{prefill.phone}</div>
        </div>
      </div>

      {loading ? (
        <div className="wallet-loading" aria-live="polite">
          Loading wallet balance...
        </div>
      ) : walletBalance !== null ? (
        <div className="wallet-balance" aria-label={`Wallet balance: ${walletBalance}`}>
          <span className="balance-label">Available balance:</span>
          <span className="balance-amount">
            {new Intl.NumberFormat(prefill.language || 'en', {
              style: 'currency',
              currency: prefill.currency || 'XOF',
            }).format(walletBalance)}
          </span>
        </div>
      ) : null}

      <div className="wallet-security">
        <span className="security-icon" aria-hidden="true">🔒</span>
        <span>Your payment is secured by Molam</span>
      </div>
    </div>
  );
};
