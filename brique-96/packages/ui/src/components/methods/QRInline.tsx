/**
 * QR code payment method component
 * Supports offline payments via QR scanning
 */

import React, { useEffect, useState } from 'react';
import type { TelemetryEvent } from '../../types';

export interface QRInlineProps {
  amount: number;
  currency: string;
  onEvent?: (event: TelemetryEvent) => void;
}

export const QRInline: React.FC<QRInlineProps> = ({
  amount,
  currency,
  onEvent,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiresIn, setExpiresIn] = useState(300); // 5 minutes

  useEffect(() => {
    generateQRCode();
  }, [amount, currency]);

  useEffect(() => {
    if (expiresIn <= 0) return;

    const timer = setInterval(() => {
      setExpiresIn((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresIn]);

  const generateQRCode = async () => {
    setLoading(true);
    onEvent?.({ name: 'qr_code_generation_start', payload: { amount, currency } });

    try {
      const response = await fetch('/api/payments/qr-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency }),
      });

      if (response.ok) {
        const data = await response.json();
        setQrCode(data.qrCodeDataUrl);
        setExpiresIn(data.expiresIn || 300);
        onEvent?.({ name: 'qr_code_generated', payload: { expiresIn: data.expiresIn } });
      } else {
        throw new Error('Failed to generate QR code');
      }
    } catch (error: any) {
      onEvent?.({ name: 'qr_code_error', payload: { error: error.message } });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="qr-payment" role="group" aria-label="QR code payment">
      <div className="qr-instructions">
        <h3>Scan to pay</h3>
        <p>Use your mobile money app to scan this QR code</p>
      </div>

      {loading ? (
        <div className="qr-loading" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Generating QR code...</p>
        </div>
      ) : qrCode ? (
        <>
          <div className="qr-code-container" role="img" aria-label="Payment QR code">
            <img
              src={qrCode}
              alt="Payment QR code"
              className="qr-code-image"
            />
          </div>

          <div className="qr-timer" role="timer" aria-live="polite">
            <span className="timer-icon" aria-hidden="true">⏱️</span>
            <span>Expires in {formatTime(expiresIn)}</span>
          </div>

          {expiresIn <= 30 && (
            <button
              type="button"
              className="qr-refresh"
              onClick={generateQRCode}
              aria-label="Refresh QR code"
            >
              🔄 Refresh QR code
            </button>
          )}
        </>
      ) : (
        <div className="qr-error" role="alert">
          Failed to generate QR code. Please try again.
          <button type="button" onClick={generateQRCode}>
            Retry
          </button>
        </div>
      )}

      <div className="qr-apps">
        <p>Compatible apps:</p>
        <div className="app-icons" aria-label="Compatible mobile money apps">
          <span>Orange Money</span>
          <span>MTN</span>
          <span>Moov Money</span>
          <span>Wave</span>
        </div>
      </div>

      <div className="qr-offline-notice" role="note">
        <span className="info-icon" aria-hidden="true">ℹ️</span>
        <span>QR payment works offline - scan and confirm on your phone</span>
      </div>
    </div>
  );
};
