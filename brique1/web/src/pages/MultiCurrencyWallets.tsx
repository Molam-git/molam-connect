import React, { useState, useEffect } from 'react';

interface Wallet {
  id: string;
  user_id: string;
  currency: string;
  country: string;
  balance: number;
  is_default: boolean;
  status: 'active' | 'frozen' | 'closed';
  created_at: string;
  updated_at: string;
}

interface CurrencyOption {
  code: string;
  name: string;
  flag: string;
  country: string;
  countryCode: string;
}

const availableCurrencies: CurrencyOption[] = [
  { code: 'XOF', name: 'West African CFA', flag: '🇸🇳', country: 'Senegal', countryCode: 'SN' },
  { code: 'XOF', name: 'West African CFA', flag: '🇨🇮', country: 'Côte d\'Ivoire', countryCode: 'CI' },
  { code: 'XAF', name: 'Central African CFA', flag: '🇨🇲', country: 'Cameroon', countryCode: 'CM' },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸', country: 'United States', countryCode: 'US' },
  { code: 'EUR', name: 'Euro', flag: '🇫🇷', country: 'France', countryCode: 'FR' },
];

const MultiCurrencyWallets: React.FC = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyOption | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      const token = localStorage.getItem('molam_token');
      const response = await fetch('/api/v1/wallets', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load wallets');
      }

      const data = await response.json();
      setWallets(data.wallets || []);
    } catch (error) {
      console.error('Error loading wallets:', error);
    }
  };

  const createWallet = async () => {
    if (!selectedCurrency) {
      alert('Please select a currency');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('molam_token');
      const response = await fetch('/api/v1/wallets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currency: selectedCurrency.code,
          country: selectedCurrency.countryCode
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create wallet');
      }

      await loadWallets();
      setShowModal(false);
      setSelectedCurrency(null);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBalance = (balance: number, currency: string) => {
    const minorUnit = currency === 'XOF' || currency === 'XAF' ? 0 : 2;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: minorUnit,
      maximumFractionDigits: minorUnit
    }).format(balance / Math.pow(10, minorUnit));
  };

  const getCurrencyFlag = (currency: string, country: string) => {
    const curr = availableCurrencies.find(c => c.code === currency && c.countryCode === country);
    return curr?.flag || '💰';
  };

  const getCountryName = (country: string) => {
    const curr = availableCurrencies.find(c => c.countryCode === country);
    return curr?.country || country;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/30 text-green-50';
      case 'frozen':
        return 'bg-orange-500/30 text-orange-50';
      case 'closed':
        return 'bg-red-500/30 text-red-50';
      default:
        return 'bg-gray-500/30 text-gray-50';
    }
  };

  const totalWallets = wallets.length;
  const activeCurrencies = new Set(wallets.map(w => w.currency)).size;
  const countries = new Set(wallets.map(w => w.country)).size;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md text-white p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="8" fill="url(#gradient)"/>
              <path d="M12 20L18 26L28 14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                  <stop offset="0%" stopColor="#667eea"/>
                  <stop offset="100%" stopColor="#764ba2"/>
                </linearGradient>
              </defs>
            </svg>
            <h1 className="text-2xl font-bold">Multi-Currency Wallets</h1>
          </div>
          <a href="/dashboard" className="text-white hover:underline">
            ← Dashboard
          </a>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Multi-Devises & Multi-Pays</h2>
          <p className="text-white/80">Manage your wallets in multiple currencies (XOF, XAF, USD, EUR)</p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Total Wallets</div>
            <div className="text-4xl font-bold text-gray-800">{totalWallets}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Active Currencies</div>
            <div className="text-4xl font-bold text-gray-800">{activeCurrencies}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border-2 border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Countries</div>
            <div className="text-4xl font-bold text-gray-800">{countries}</div>
          </div>
        </div>

        {/* Wallets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`relative p-8 rounded-2xl shadow-xl text-white transition-transform hover:-translate-y-1 ${
                wallet.is_default ? 'ring-4 ring-yellow-400' : ''
              }`}
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              {wallet.is_default && (
                <div className="absolute top-4 right-4 text-2xl">⭐</div>
              )}
              <div className="text-4xl font-bold mb-2">
                {getCurrencyFlag(wallet.currency, wallet.country)} {wallet.currency}
              </div>
              <div className="text-sm opacity-90 mb-5">{getCountryName(wallet.country)}</div>
              <div className="text-5xl font-bold mb-1">{formatBalance(wallet.balance, wallet.currency)}</div>
              <div className="text-xs opacity-80 uppercase tracking-wider mb-3">Balance</div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(wallet.status)}`}>
                {wallet.status}
              </span>
            </div>
          ))}

          {/* Add Wallet Card */}
          <div
            onClick={() => setShowModal(true)}
            className="bg-white border-4 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-indigo-500 hover:bg-gray-50"
          >
            <div className="text-6xl mb-3 opacity-50">➕</div>
            <div className="text-gray-700 font-semibold">Add New Wallet</div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-white/10 backdrop-blur-md border-l-4 border-indigo-300 rounded-lg p-6 text-white">
          <h3 className="font-bold text-lg mb-2">🌍 Brique 1 - Multi-Currency Features</h3>
          <ul className="list-disc list-inside space-y-1 text-sm opacity-90">
            <li>Multi-currency support: XOF, XAF, USD, EUR</li>
            <li>Multi-country support: SN, CI, CM, FR, US</li>
            <li>One wallet per currency per user</li>
            <li>Automatic formatting based on minor_unit (XOF/XAF: 0 decimals, USD/EUR: 2 decimals)</li>
            <li>Wallet status: active, frozen, closed</li>
            <li>Default wallet selection</li>
          </ul>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-10 max-w-xl w-full shadow-2xl">
            <h3 className="text-3xl font-bold text-gray-800 mb-6">Add New Wallet</h3>
            <p className="text-gray-600 mb-6">Select a currency and country for your new wallet</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {availableCurrencies.map((currency, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedCurrency(currency)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all text-center ${
                    selectedCurrency === currency
                      ? 'border-indigo-500 bg-gray-100'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-4xl mb-2">{currency.flag}</div>
                  <div className="font-semibold text-gray-800 mb-1">{currency.code}</div>
                  <div className="text-xs text-gray-600">{currency.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{currency.country}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedCurrency(null);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={createWallet}
                disabled={!selectedCurrency || loading}
                className="flex-1 px-6 py-3 text-white font-semibold rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
              >
                {loading ? 'Creating...' : 'Create Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiCurrencyWallets;
