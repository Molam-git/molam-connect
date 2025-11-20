/**
 * Molam Ma (Wallet) - Page d'accueil
 *
 * Page d'accueil pour utilisateurs finaux avec:
 * - QR Code Molam au centre (mobile) / bien placé (desktop)
 * - Boutons principaux en cercles
 * - Historique transactions
 * - Balance visible
 */
import React, { useState } from 'react';
import {
  QrCode,
  Send,
  ShoppingBag,
  Wallet,
  Settings,
  Bell,
  ChevronRight,
  Plus,
  Minus,
  Clock,
  Filter
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  category?: string;
}

interface MolamMaHomeProps {
  userName: string;
  balance: number;
  currency?: string;
  transactions?: Transaction[];
  qrCodeData?: string;
  onTransferClick?: () => void;
  onPaymentClick?: () => void;
  onCashInOutClick?: () => void;
  onSettingsClick?: () => void;
  onNotificationsClick?: () => void;
  onTransactionClick?: (transactionId: string) => void;
}

export function MolamMaHome({
  userName,
  balance,
  currency = 'XOF',
  transactions = [],
  qrCodeData,
  onTransferClick,
  onPaymentClick,
  onCashInOutClick,
  onSettingsClick,
  onNotificationsClick,
  onTransactionClick
}: MolamMaHomeProps) {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Format currency
  const formatAmount = (amount: number, curr: string = currency) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'all') return true;

    const txDate = new Date(tx.timestamp);
    const now = new Date();

    if (filter === 'today') {
      return txDate.toDateString() === now.toDateString();
    }

    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return txDate >= weekAgo;
    }

    if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return txDate >= monthAgo;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Bonjour, {userName}
            </h1>
            <p className="text-sm text-gray-500">Molam Ma</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNotificationsClick}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-6 h-6 text-gray-700" />
            </button>

            <button
              onClick={onSettingsClick}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Paramètres"
            >
              <Settings className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-20">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 mb-6 text-white shadow-xl">
          <p className="text-blue-200 text-sm mb-2">Solde disponible</p>
          <p className="text-4xl font-bold mb-4">{formatAmount(balance)}</p>

          <div className="flex items-center gap-2 text-blue-100 text-sm">
            <Wallet className="w-4 h-4" />
            <span>Compte Molam Ma</span>
          </div>
        </div>

        {/* QR Code Section - Centered for mobile, side by side with actions for desktop */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* QR Code */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200 flex flex-col items-center justify-center">
            <p className="text-sm font-medium text-gray-700 mb-4 text-center">
              Mon QR Code Molam
            </p>

            <div className="bg-white p-4 rounded-2xl border-2 border-gray-200 mb-4">
              {qrCodeData ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}`}
                  alt="QR Code Molam"
                  className="w-48 h-48"
                />
              ) : (
                <div className="w-48 h-48 bg-gray-100 rounded-xl flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-gray-400" />
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center max-w-xs">
              Partagez ce code pour recevoir de l'argent instantanément
            </p>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-4">
              Actions rapides
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Transfer */}
              <button
                onClick={onTransferClick}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-blue-50 transition-all group"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Send className="w-8 h-8 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  Transfert
                </span>
              </button>

              {/* Payment */}
              <button
                onClick={onPaymentClick}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-green-50 transition-all group"
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <ShoppingBag className="w-8 h-8 text-green-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  Payer
                </span>
              </button>

              {/* Cash In/Out */}
              <button
                onClick={onCashInOutClick}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-purple-50 transition-all group col-span-2"
              >
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Wallet className="w-8 h-8 text-purple-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  Dépôt / Retrait
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Transactions History */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header with filters */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Historique
              </h2>

              <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                <Filter className="w-4 h-4" />
                Filtrer
              </button>
            </div>

            {/* Period filters */}
            <div className="flex gap-2">
              {(['all', 'today', 'week', 'month'] as const).map(period => (
                <button
                  key={period}
                  onClick={() => setFilter(period)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === period
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period === 'all' && 'Tout'}
                  {period === 'today' && "Aujourd'hui"}
                  {period === 'week' && 'Cette semaine'}
                  {period === 'month' && 'Ce mois'}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions list */}
          <div className="divide-y divide-gray-100">
            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Aucune transaction</p>
              </div>
            ) : (
              filteredTransactions.map(tx => (
                <button
                  key={tx.id}
                  onClick={() => onTransactionClick?.(tx.id)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      tx.type === 'credit'
                        ? 'bg-green-100'
                        : 'bg-red-100'
                    }`}
                  >
                    {tx.type === 'credit' ? (
                      <Plus className="w-6 h-6 text-green-600" />
                    ) : (
                      <Minus className="w-6 h-6 text-red-600" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">
                        {formatTime(tx.timestamp)}
                      </p>
                      {tx.status !== 'completed' && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            tx.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {tx.status === 'pending' ? 'En attente' : 'Échoué'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex items-center gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        tx.type === 'credit'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {tx.type === 'credit' ? '+' : '-'}
                      {formatAmount(tx.amount, tx.currency)}
                    </p>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              ))
            )}
          </div>

          {/* View all */}
          {filteredTransactions.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Voir toutes les transactions
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default MolamMaHome;
