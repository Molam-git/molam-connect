/**
 * Molam Ma Wallet Home (Desktop Layout)
 * Three-column layout: Actions | Balance+QR | History
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

export default function WalletHomeDesktop() {
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [qrToken, setQrToken] = useState<QrTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  useEffect(() => {
    fetchWalletData();
    const interval = setInterval(() => fetchBalance(), 30000);
    return () => clearInterval(interval);
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

  const fetchBalance = async () => {
    try {
      const token = localStorage.getItem('molam_token');
      const response = await fetch('/api/wallet/balance', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setWalletData(prev => prev ? {
          ...prev,
          balance: data
        } : null);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
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

      // Auto-hide after 15 minutes
      setTimeout(() => {
        setShowQr(false);
        setQrToken(null);
      }, 15 * 60 * 1000);
    } catch (error) {
      console.error('Error generating QR:', error);
      alert('Failed to generate QR code');
    }
  };

  const handleActionClick = (actionKey: string) => {
    setSelectedAction(actionKey);
    console.log('Desktop action:', actionKey);
    // Open modal or navigate to action page
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600 text-xl">Loading wallet...</div>
      </div>
    );
  }

  if (!walletData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600 text-xl">Failed to load wallet</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Molam Ma</h1>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              {walletData.user.country} • {walletData.user.currency}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button className="px-4 py-2 text-gray-700 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button className="px-4 py-2 text-gray-700 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Three Columns */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Actions */}
          <div className="col-span-3">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>

              <div className="space-y-2">
                {walletData.actions.map((action) => (
                  <div key={action.k}>
                    <button
                      onClick={() => action.sub ? setSelectedAction(selectedAction === action.k ? null : action.k) : handleActionClick(action.k)}
                      className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-2xl">{action.e}</span>
                      <span className="flex-1 text-gray-700 font-medium text-sm">{action.l}</span>
                      {action.sub && (
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${selectedAction === action.k ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>

                    {action.sub && selectedAction === action.k && (
                      <div className="ml-4 mt-1 space-y-1">
                        {action.sub.map((subAction) => (
                          <button
                            key={subAction.k}
                            onClick={() => handleActionClick(subAction.k)}
                            className="w-full flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                          >
                            <span className="text-lg">{subAction.e}</span>
                            <span className="text-gray-600 text-sm">{subAction.l}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center Column - Balance & QR */}
          <div className="col-span-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg p-8 text-white">
              <p className="text-blue-100 text-sm mb-2">Available Balance</p>
              <h2 className="text-5xl font-bold mb-6">
                {formatAmount(walletData.balance.balance, walletData.balance.currency)}
              </h2>

              {/* QR Code */}
              <div className="bg-white rounded-xl p-6 mb-6">
                {showQr && qrToken ? (
                  <div className="text-center">
                    <div className="inline-block bg-white p-4 rounded-lg">
                      <QRCode value={qrToken.qr_url} size={220} />
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      Valid until: {new Date(qrToken.expires_at).toLocaleTimeString()}
                    </p>
                    <button
                      onClick={() => setShowQr(false)}
                      className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Hide QR Code
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <p className="text-gray-600 text-sm mb-4">Generate QR to receive payment</p>
                    <button
                      onClick={generateQrCode}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      Generate QR Code
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-blue-100 text-xs mb-1">This Month</p>
                  <p className="text-white font-semibold">
                    {walletData.history.filter(h => new Date(h.timestamp).getMonth() === new Date().getMonth()).length} transactions
                  </p>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-blue-100 text-xs mb-1">Status</p>
                  <p className="text-white font-semibold capitalize">{walletData.balance.status}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Transaction History */}
          <div className="col-span-5">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  View All
                </button>
              </div>

              {walletData.history.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {walletData.history.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.amount < 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                          <svg className={`w-5 h-5 ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {tx.amount < 0 ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                            )}
                          </svg>
                        </div>
                        <div>
                          <p className="text-gray-900 font-medium text-sm">{tx.label}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{formatDate(tx.timestamp)}</p>
                        </div>
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
        </div>
      </div>
    </div>
  );
}
