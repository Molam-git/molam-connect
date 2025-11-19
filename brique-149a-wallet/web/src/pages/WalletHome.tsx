/**
 * Molam Ma Wallet Home (Mobile-First)
 * QR Code centered, balance, actions, transaction history
 */
import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

interface WalletData {
  user: {
    id: string;
    locale: string;
    currency: string;
    country: string;
  };
  balance: {
    balance: number;
    currency: string;
    status: string;
  };
  actions: Array<{
    k: string;
    l: string;
    e: string;
    icon: string;
    sub?: Array<{ k: string; l: string; e: string; icon: string }>;
  }>;
  history: Array<{
    id: string;
    label: string;
    amount: number;
    currency: string;
    type: string;
    category: string;
    timestamp: string;
  }>;
}

interface QrTokenData {
  token: string;
  expires_at: string;
  qr_url: string;
  deep_link: string;
}

export default function WalletHome() {
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [qrToken, setQrToken] = useState<QrTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const token = localStorage.getItem('molam_token');
      const response = await fetch('/api/wallet/home', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch wallet data');

      const data = await response.json();
      setWalletData(data);
    } catch (error) {
      console.error('Error fetching wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateQrCode = async () => {
    try {
      const token = localStorage.getItem('molam_token');
      const response = await fetch('/api/wallet/qr/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          purpose: 'receive',
          expiryMinutes: 15
        })
      });

      if (!response.ok) throw new Error('Failed to generate QR');

      const data = await response.json();
      setQrToken(data);
      setShowQr(true);
    } catch (error) {
      console.error('Error generating QR:', error);
      alert('Failed to generate QR code');
    }
  };

  const handleActionClick = (actionKey: string) => {
    setSelectedAction(actionKey);

    if (actionKey === 'transfer' || actionKey === 'merchant_payment') {
      // Open QR scanner or payment flow
      console.log('Action:', actionKey);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const absAmount = Math.abs(amount);
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    }).format(absAmount);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!walletData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-700 flex items-center justify-center">
        <div className="text-white text-xl">Failed to load wallet</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-500 to-blue-700">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex justify-between items-center">
          <h1 className="text-white text-2xl font-bold">Molam Ma</h1>
          <button className="text-white p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Balance Card */}
      <div className="px-6 pb-6">
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">Your Balance</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {formatAmount(walletData.balance.balance, walletData.balance.currency)}
            </h2>

            {/* QR Code Section */}
            {showQr && qrToken ? (
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl">
                <div className="bg-white p-4 rounded-xl inline-block">
                  <QRCode value={qrToken.qr_url} size={200} />
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Expires: {new Date(qrToken.expires_at).toLocaleTimeString()}
                </p>
                <button
                  onClick={() => setShowQr(false)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Hide QR
                </button>
              </div>
            ) : (
              <button
                onClick={generateQrCode}
                className="mb-4 px-8 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors"
              >
                Show QR to Receive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Actions Grid */}
      <div className="px-6 pb-6">
        <h3 className="text-white text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-4">
          {walletData.actions.filter(a => !a.sub).slice(0, 6).map((action) => (
            <button
              key={action.k}
              onClick={() => handleActionClick(action.k)}
              className="bg-white/20 backdrop-blur-md rounded-2xl p-4 flex flex-col items-center justify-center hover:bg-white/30 transition-all"
            >
              <span className="text-3xl mb-2">{action.e}</span>
              <span className="text-white text-xs text-center font-medium">{action.l}</span>
            </button>
          ))}
        </div>

        {/* Bill Payment with Sub-actions */}
        {walletData.actions.find(a => a.sub) && (
          <div className="mt-4">
            <button
              onClick={() => setSelectedAction(selectedAction === 'bills' ? null : 'bills')}
              className="w-full bg-white/20 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between hover:bg-white/30 transition-all"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">📡</span>
                <span className="text-white font-medium">Bills & Services</span>
              </div>
              <svg
                className={`w-5 h-5 text-white transition-transform ${selectedAction === 'bills' ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {selectedAction === 'bills' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {walletData.actions.find(a => a.sub)?.sub?.map((subAction) => (
                  <button
                    key={subAction.k}
                    onClick={() => handleActionClick(subAction.k)}
                    className="bg-white/15 backdrop-blur-md rounded-xl p-3 flex items-center hover:bg-white/25 transition-all"
                  >
                    <span className="text-xl mr-2">{subAction.e}</span>
                    <span className="text-white text-sm">{subAction.l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-t-3xl px-6 py-6 min-h-[40vh]">
        <h3 className="text-gray-900 text-lg font-semibold mb-4">Recent Transactions</h3>

        {walletData.history.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {walletData.history.slice(0, 20).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-gray-900 font-medium text-sm">{tx.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{formatDate(tx.timestamp)}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.amount < 0 ? '-' : '+'} {formatAmount(tx.amount, tx.currency)}
                  </p>
                  <p className="text-gray-400 text-xs capitalize">{tx.category}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
