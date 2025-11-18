/**
 * Brique 98 — Offline Payment UI Components
 *
 * Apple-like React components for offline payment experiences.
 *
 * Components:
 * - OfflineStatusBanner - Shows online/offline status
 * - OfflinePaymentButton - Payment button with offline indicator
 * - OfflineTransactionList - List of pending offline transactions
 * - OfflineQRDisplay - QR code display for offline payment
 * - OfflineSyncProgress - Sync progress indicator
 */

import React, { useState, useEffect } from 'react';
import { OfflineSDK, CreateTransactionParams, SyncResult } from '../sdk/offline-sdk';

// =====================================================================
// Types
// =====================================================================

export interface OfflinePaymentContextValue {
  sdk: OfflineSDK | null;
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
}

// =====================================================================
// Context
// =====================================================================

const OfflinePaymentContext = React.createContext<OfflinePaymentContextValue>({
  sdk: null,
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncResult: null,
});

export const useOfflinePayment = () => React.useContext(OfflinePaymentContext);

// =====================================================================
// Provider Component
// =====================================================================

export interface OfflinePaymentProviderProps {
  sdk: OfflineSDK;
  children: React.ReactNode;
}

export const OfflinePaymentProvider: React.FC<OfflinePaymentProviderProps> = ({ sdk, children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    // Initialize SDK
    sdk.initialize().catch(console.error);

    // Update pending count periodically
    const updatePendingCount = () => {
      setPendingCount(sdk.getPendingCount());
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [sdk]);

  const value: OfflinePaymentContextValue = {
    sdk,
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncResult,
  };

  return <OfflinePaymentContext.Provider value={value}>{children}</OfflinePaymentContext.Provider>;
};

// =====================================================================
// Offline Status Banner
// =====================================================================

export interface OfflineStatusBannerProps {
  className?: string;
  onSyncClick?: () => void;
}

export const OfflineStatusBanner: React.FC<OfflineStatusBannerProps> = ({ className = '', onSyncClick }) => {
  const { isOnline, pendingCount, isSyncing } = useOfflinePayment();

  if (isOnline && pendingCount === 0) {
    return null; // No banner when online and no pending transactions
  }

  return (
    <div
      className={`offline-status-banner ${isOnline ? 'online' : 'offline'} ${className}`}
      style={{
        padding: '12px 16px',
        backgroundColor: isOnline ? '#fff3cd' : '#f8d7da',
        borderBottom: `2px solid ${isOnline ? '#ffc107' : '#dc3545'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isOnline ? '#28a745' : '#dc3545',
          }}
        />
        <span style={{ fontWeight: 500 }}>
          {isOnline ? (
            <>
              Online{pendingCount > 0 && ` — ${pendingCount} transaction${pendingCount > 1 ? 's' : ''} syncing`}
            </>
          ) : (
            <>Offline Mode — {pendingCount} pending transaction{pendingCount !== 1 ? 's' : ''}</>
          )}
        </span>
      </div>

      {isOnline && pendingCount > 0 && onSyncClick && (
        <button
          onClick={onSyncClick}
          disabled={isSyncing}
          style={{
            padding: '6px 12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            opacity: isSyncing ? 0.6 : 1,
          }}
        >
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      )}
    </div>
  );
};

// =====================================================================
// Offline Payment Button
// =====================================================================

export interface OfflinePaymentButtonProps {
  amount: number;
  currency: string;
  onPaymentCreated?: (localId: string) => void;
  onError?: (error: string) => void;
  transactionParams: Omit<CreateTransactionParams, 'amount' | 'currency'>;
  className?: string;
  disabled?: boolean;
}

export const OfflinePaymentButton: React.FC<OfflinePaymentButtonProps> = ({
  amount,
  currency,
  onPaymentCreated,
  onError,
  transactionParams,
  className = '',
  disabled = false,
}) => {
  const { sdk, isOnline } = useOfflinePayment();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async () => {
    if (!sdk || isProcessing || disabled) return;

    setIsProcessing(true);

    try {
      const result = await sdk.createOfflineTransaction({
        amount,
        currency,
        ...transactionParams,
      });

      if (result.success) {
        onPaymentCreated?.(result.localId);
      } else {
        onError?.(result.error || 'Payment failed');
      }
    } catch (error: any) {
      onError?.(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isProcessing || !sdk}
      className={`offline-payment-button ${className}`}
      style={{
        padding: '16px 24px',
        backgroundColor: isOnline ? '#007bff' : '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
        opacity: disabled || isProcessing ? 0.6 : 1,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s ease',
      }}
    >
      {isProcessing ? (
        <>
          <span className="spinner" style={{ width: '16px', height: '16px' }}>
            ⏳
          </span>
          Processing...
        </>
      ) : (
        <>
          {!isOnline && <span>📡</span>}
          Pay {amount.toLocaleString()} {currency}
          {!isOnline && ' (Offline)'}
        </>
      )}
    </button>
  );
};

// =====================================================================
// Offline Transaction List
// =====================================================================

export interface OfflineTransactionListProps {
  className?: string;
  maxHeight?: string;
}

export const OfflineTransactionList: React.FC<OfflineTransactionListProps> = ({
  className = '',
  maxHeight = '400px',
}) => {
  const { sdk } = useOfflinePayment();
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!sdk) return;

    const updateTransactions = () => {
      setTransactions(sdk.getPendingTransactions());
    };

    updateTransactions();
    const interval = setInterval(updateTransactions, 2000);

    return () => clearInterval(interval);
  }, [sdk]);

  if (transactions.length === 0) {
    return (
      <div
        className={`offline-transaction-list-empty ${className}`}
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#6c757d',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>✓</div>
        <div style={{ fontSize: '14px' }}>No pending offline transactions</div>
      </div>
    );
  }

  return (
    <div
      className={`offline-transaction-list ${className}`}
      style={{
        maxHeight,
        overflowY: 'auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {transactions.map((tx, index) => (
        <div
          key={tx.local_id}
          style={{
            padding: '16px',
            borderBottom: index < transactions.length - 1 ? '1px solid #e9ecef' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
              {tx.amount.toLocaleString()} {tx.currency}
            </div>
            <div style={{ fontSize: '13px', color: '#6c757d' }}>
              {tx.type.toUpperCase()} • {new Date(tx.initiated_at).toLocaleTimeString()}
            </div>
          </div>
          <div
            style={{
              padding: '4px 12px',
              backgroundColor: '#fff3cd',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#856404',
            }}
          >
            Pending
          </div>
        </div>
      ))}
    </div>
  );
};

// =====================================================================
// Offline QR Display
// =====================================================================

export interface OfflineQRDisplayProps {
  size?: number;
  className?: string;
  onGenerate?: (qrData: string) => void;
  onError?: (error: string) => void;
}

export const OfflineQRDisplay: React.FC<OfflineQRDisplayProps> = ({
  size = 256,
  className = '',
  onGenerate,
  onError,
}) => {
  const { sdk } = useOfflinePayment();
  const [qrData, setQrData] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!sdk || isGenerating) return;

    setIsGenerating(true);

    try {
      const result = await sdk.generateOfflineQR();

      if (result.success && result.qrData) {
        setQrData(result.qrData);
        onGenerate?.(result.qrData);
      } else {
        onError?.(result.error || 'QR generation failed');
      }
    } catch (error: any) {
      onError?.(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    handleGenerate();
  }, [sdk]);

  if (isGenerating) {
    return (
      <div
        className={`offline-qr-loading ${className}`}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <span style={{ fontSize: '24px' }}>⏳</span>
      </div>
    );
  }

  if (!qrData) {
    return (
      <div
        className={`offline-qr-error ${className}`}
        style={{
          width: size,
          height: size,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8d7da',
          borderRadius: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '16px',
        }}
      >
        <span style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</span>
        <span style={{ fontSize: '13px', color: '#721c24', textAlign: 'center' }}>
          No pending transactions
        </span>
        <button
          onClick={handleGenerate}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={`offline-qr-display ${className}`}
      style={{
        width: size,
        height: size,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Placeholder for actual QR code - use qrcode.react or similar library */}
      <div
        style={{
          width: size - 32,
          height: size - 32,
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: '#6c757d',
          textAlign: 'center',
          padding: '8px',
        }}
      >
        QR Code
        <br />
        (Use qrcode.react library)
      </div>
      <div style={{ marginTop: '12px', fontSize: '11px', color: '#6c757d' }}>Scan to pay offline</div>
    </div>
  );
};

// =====================================================================
// Offline Sync Progress
// =====================================================================

export interface OfflineSyncProgressProps {
  className?: string;
}

export const OfflineSyncProgress: React.FC<OfflineSyncProgressProps> = ({ className = '' }) => {
  const { isSyncing, lastSyncResult, pendingCount } = useOfflinePayment();

  if (!isSyncing && !lastSyncResult) {
    return null;
  }

  return (
    <div
      className={`offline-sync-progress ${className}`}
      style={{
        padding: '12px 16px',
        backgroundColor: isSyncing ? '#e7f3ff' : '#d4edda',
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {isSyncing ? (
        <>
          <span className="spinner">⏳</span>
          <span>Syncing {pendingCount} transaction{pendingCount !== 1 ? 's' : ''}...</span>
        </>
      ) : lastSyncResult ? (
        lastSyncResult.success ? (
          <>
            <span style={{ color: '#28a745' }}>✓</span>
            <span style={{ color: '#155724' }}>
              Synced {lastSyncResult.bundlesPushed} bundle{lastSyncResult.bundlesPushed !== 1 ? 's' : ''} successfully
            </span>
          </>
        ) : (
          <>
            <span style={{ color: '#dc3545' }}>✗</span>
            <span style={{ color: '#721c24' }}>
              Sync failed: {lastSyncResult.errors.join(', ')}
            </span>
          </>
        )
      ) : null}
    </div>
  );
};

// =====================================================================
// Exports
// =====================================================================

export default {
  OfflinePaymentProvider,
  OfflineStatusBanner,
  OfflinePaymentButton,
  OfflineTransactionList,
  OfflineQRDisplay,
  OfflineSyncProgress,
  useOfflinePayment,
};
