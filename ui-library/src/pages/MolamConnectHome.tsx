/**
 * Molam Connect - Page d'accueil
 *
 * Page d'accueil pour marchands/entreprises avec:
 * - Pas de QR code centré (usage marchand)
 * - Boutons rapides en header (actions Ops/Finance)
 * - Statistiques et tableaux
 * - Alertes SIRA
 * - Menu latéral
 */
import React, { useState } from 'react';
import {
  FileText,
  Download,
  UserPlus,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  ShoppingCart,
  Activity,
  Menu,
  X,
  ChevronRight,
  BarChart3,
  AlertCircle
} from 'lucide-react';

interface MerchantStats {
  totalSales: number;
  totalRevenue: number;
  totalMargin: number;
  totalCustomers: number;
  pendingTransactions: number;
  failedTransactions: number;
  balance: number;
  pendingPayouts: number;
}

interface TopProduct {
  id: string;
  name: string;
  sales: number;
  revenue: number;
}

interface TopCustomer {
  id: string;
  name: string;
  totalSpent: number;
  transactionCount: number;
}

interface SiraAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'fraud' | 'anomaly' | 'security' | 'compliance';
  title: string;
  description: string;
  timestamp: string;
}

interface MolamConnectHomeProps {
  merchantName: string;
  currency?: string;
  stats: MerchantStats;
  topProducts?: TopProduct[];
  topCustomers?: TopCustomer[];
  siraAlerts?: SiraAlert[];
  onCreateInvoice?: () => void;
  onExportReport?: () => void;
  onAddCollaborator?: () => void;
  onAlertClick?: (alertId: string) => void;
}

export function MolamConnectHome({
  merchantName,
  currency = 'XOF',
  stats,
  topProducts = [],
  topCustomers = [],
  siraAlerts = [],
  onCreateInvoice,
  onExportReport,
  onAddCollaborator,
  onAlertClick
}: MolamConnectHomeProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Format currency
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Format number
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num);
  };

  // Get alert color
  const getAlertColor = (severity: SiraAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-900';
      case 'high':
        return 'bg-orange-100 border-orange-300 text-orange-900';
      case 'medium':
        return 'bg-yellow-100 border-yellow-300 text-yellow-900';
      default:
        return 'bg-blue-100 border-blue-300 text-blue-900';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Quick Actions */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Menu"
            >
              {isSidebarOpen ? (
                <X className="w-6 h-6 text-gray-700" />
              ) : (
                <Menu className="w-6 h-6 text-gray-700" />
              )}
            </button>

            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {merchantName}
              </h1>
              <p className="text-sm text-gray-500">Molam Connect</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onCreateInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Créer facture</span>
            </button>

            <button
              onClick={onExportReport}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={onAddCollaborator}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-gray-200 z-40
          transform transition-transform duration-300 lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              M
            </div>
            <div>
              <p className="font-semibold text-gray-900">Molam</p>
              <p className="text-xs text-gray-500">Connect</p>
            </div>
          </div>
        </div>

        <nav className="p-4">
          <div className="space-y-1">
            <a
              href="#dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 text-blue-700 font-medium"
            >
              <BarChart3 className="w-5 h-5" />
              <span>Dashboard</span>
            </a>

            <a
              href="#transactions"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Activity className="w-5 h-5" />
              <span>Transactions</span>
            </a>

            <a
              href="#customers"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Users className="w-5 h-5" />
              <span>Clients</span>
            </a>

            <a
              href="#products"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <ShoppingCart className="w-5 h-5" />
              <span>Produits</span>
            </a>

            <a
              href="#payouts"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <DollarSign className="w-5 h-5" />
              <span>Virements</span>
            </a>

            <a
              href="#reports"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <FileText className="w-5 h-5" />
              <span>Rapports</span>
            </a>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 max-w-7xl">
        {/* SIRA Alerts */}
        {siraAlerts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Alertes SIRA
            </h2>

            <div className="space-y-3">
              {siraAlerts.slice(0, 3).map(alert => (
                <button
                  key={alert.id}
                  onClick={() => onAlertClick?.(alert.id)}
                  className={`w-full p-4 rounded-xl border-2 transition-all hover:shadow-md text-left ${getAlertColor(alert.severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-white bg-opacity-50">
                          {alert.severity}
                        </span>
                        <span className="text-xs font-medium uppercase">
                          {alert.type}
                        </span>
                      </div>
                      <p className="font-semibold mb-1">{alert.title}</p>
                      <p className="text-sm opacity-90">{alert.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 flex-shrink-0 ml-2" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Total Revenue */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +12.5%
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {formatAmount(stats.totalRevenue)}
            </p>
            <p className="text-sm text-gray-500">Chiffre d'affaires</p>
          </div>

          {/* Total Sales */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +8.3%
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(stats.totalSales)}
            </p>
            <p className="text-sm text-gray-500">Ventes totales</p>
          </div>

          {/* Total Customers */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +15.2%
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {formatNumber(stats.totalCustomers)}
            </p>
            <p className="text-sm text-gray-500">Clients actifs</p>
          </div>

          {/* Margin */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-yellow-600" />
              </div>
              <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                -2.1%
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {formatAmount(stats.totalMargin)}
            </p>
            <p className="text-sm text-gray-500">Marge nette</p>
          </div>
        </div>

        {/* Transactions Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Balance */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-sm p-6 text-white">
            <p className="text-blue-200 text-sm mb-2">Balance marchande</p>
            <p className="text-3xl font-bold mb-4">{formatAmount(stats.balance)}</p>
            <button className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg text-sm font-medium transition-colors">
              Demander virement
            </button>
          </div>

          {/* Pending */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(stats.pendingTransactions)}
                </p>
                <p className="text-sm text-gray-500">En attente</p>
              </div>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Voir détails →
            </button>
          </div>

          {/* Failed */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(stats.failedTransactions)}
                </p>
                <p className="text-sm text-gray-500">Échouées</p>
              </div>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Analyser →
            </button>
          </div>
        </div>

        {/* Top Products & Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Produits
              </h3>
            </div>

            <div className="divide-y divide-gray-100">
              {topProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Aucun produit
                </div>
              ) : (
                topProducts.map((product, index) => (
                  <div key={product.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatNumber(product.sales)} ventes
                      </p>
                    </div>

                    <p className="font-semibold text-gray-900">
                      {formatAmount(product.revenue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Customers */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Clients
              </h3>
            </div>

            <div className="divide-y divide-gray-100">
              {topCustomers.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Aucun client
                </div>
              ) : (
                topCustomers.map((customer, index) => (
                  <div key={customer.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600 font-bold text-sm">
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {customer.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatNumber(customer.transactionCount)} transactions
                      </p>
                    </div>

                    <p className="font-semibold text-gray-900">
                      {formatAmount(customer.totalSpent)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default MolamConnectHome;
