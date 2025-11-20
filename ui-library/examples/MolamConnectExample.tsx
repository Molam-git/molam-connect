/**
 * Molam Connect - Example Implementation
 * Demonstrates full merchant dashboard with analytics
 */
import React from 'react';
import { MolamConnectHome } from '../src/pages/MolamConnectHome';
import type { MerchantStats, TopProduct, TopCustomer, SiraAlert } from '../src/pages/MolamConnectHome';

function MolamConnectExample() {
  // Merchant stats
  const stats: MerchantStats = {
    totalSales: 1234,
    totalRevenue: 45750000, // XOF
    totalMargin: 5680000,   // XOF
    totalCustomers: 567,
    pendingTransactions: 23,
    failedTransactions: 5,
    balance: 12500000,      // XOF
    pendingPayouts: 3
  };

  // Top products
  const topProducts: TopProduct[] = [
    {
      id: 'p1',
      name: 'MacBook Pro M3 14"',
      sales: 45,
      revenue: 67500000
    },
    {
      id: 'p2',
      name: 'iPhone 15 Pro Max',
      sales: 89,
      revenue: 53400000
    },
    {
      id: 'p3',
      name: 'AirPods Pro 2',
      sales: 156,
      revenue: 31200000
    },
    {
      id: 'p4',
      name: 'iPad Air M2',
      sales: 67,
      revenue: 26800000
    },
    {
      id: 'p5',
      name: 'Apple Watch Series 9',
      sales: 123,
      revenue: 24600000
    }
  ];

  // Top customers
  const topCustomers: TopCustomer[] = [
    {
      id: 'c1',
      name: 'Amadou Tech SARL',
      totalSpent: 15750000,
      transactionCount: 45
    },
    {
      id: 'c2',
      name: 'Boutique Fatou & Cie',
      totalSpent: 12300000,
      transactionCount: 67
    },
    {
      id: 'c3',
      name: 'Moussa Diallo Enterprise',
      totalSpent: 9850000,
      transactionCount: 34
    },
    {
      id: 'c4',
      name: 'Sénégal Digital Hub',
      totalSpent: 8500000,
      transactionCount: 28
    },
    {
      id: 'c5',
      name: 'Aissatou Import-Export',
      totalSpent: 7200000,
      transactionCount: 52
    }
  ];

  // SIRA alerts
  const siraAlerts: SiraAlert[] = [
    {
      id: 'alert-1',
      severity: 'critical',
      type: 'fraud',
      title: 'Tentative de fraude détectée',
      description: 'Transaction de 500,000 XOF avec 3 cartes différentes en 5 minutes',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    },
    {
      id: 'alert-2',
      severity: 'high',
      type: 'anomaly',
      title: 'Pic d\'activité inhabituel',
      description: 'Volume de transactions 3x supérieur à la moyenne horaire',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'alert-3',
      severity: 'medium',
      type: 'security',
      title: 'Connexion depuis nouvelle localisation',
      description: 'Accès détecté depuis Abidjan (Côte d\'Ivoire)',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'alert-4',
      severity: 'low',
      type: 'compliance',
      title: 'Rapport mensuel requis',
      description: 'Le rapport de conformité KYC du mois de Janvier doit être soumis',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // Merchant data
  const merchantName = 'Boutique Amadou Tech';
  const currency = 'XOF';

  // Handlers
  const handleCreateInvoice = () => {
    console.log('Create invoice');
    alert('Créer une nouvelle facture');
  };

  const handleExportReport = () => {
    console.log('Export report');
    alert('Exporter rapport - Format: PDF, CSV, Excel');
  };

  const handleAddCollaborator = () => {
    console.log('Add collaborator');
    alert('Ajouter un collaborateur - Email + Rôle');
  };

  const handleAlertClick = (alertId: string) => {
    console.log('View alert:', alertId);
    const alert = siraAlerts.find(a => a.id === alertId);
    if (alert) {
      alert(`⚠️ ${alert.title}\n\n${alert.description}\n\nSévérité: ${alert.severity}\nType: ${alert.type}`);
    }
  };

  return (
    <div>
      <MolamConnectHome
        merchantName={merchantName}
        currency={currency}
        stats={stats}
        topProducts={topProducts}
        topCustomers={topCustomers}
        siraAlerts={siraAlerts}
        onCreateInvoice={handleCreateInvoice}
        onExportReport={handleExportReport}
        onAddCollaborator={handleAddCollaborator}
        onAlertClick={handleAlertClick}
      />

      {/* Demo Controls */}
      <div className="fixed bottom-4 right-4 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 max-w-sm z-50">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Molam Connect Demo
        </h3>

        <div className="space-y-3">
          {/* Stats Summary */}
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Chiffre d'affaires:</span>
              <span className="font-medium">
                {stats.totalRevenue.toLocaleString()} XOF
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Ventes totales:</span>
              <span className="font-medium">{stats.totalSales}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Clients actifs:</span>
              <span className="font-medium">{stats.totalCustomers}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Balance:</span>
              <span className="font-medium text-blue-600">
                {stats.balance.toLocaleString()} XOF
              </span>
            </div>
          </div>

          {/* Alerts Summary */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-700 mb-2">
              Alertes SIRA
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-gray-600">Critical:</span>
                <span className="font-medium">
                  {siraAlerts.filter(a => a.severity === 'critical').length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span className="text-gray-600">High:</span>
                <span className="font-medium">
                  {siraAlerts.filter(a => a.severity === 'high').length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-gray-600">Medium:</span>
                <span className="font-medium">
                  {siraAlerts.filter(a => a.severity === 'medium').length}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-gray-600">Low:</span>
                <span className="font-medium">
                  {siraAlerts.filter(a => a.severity === 'low').length}
                </span>
              </div>
            </div>
          </div>

          {/* Transactions Status */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-700 mb-2">
              Transactions
            </p>

            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-gray-600">En attente:</span>
                <span className="font-medium">{stats.pendingTransactions}</span>
              </div>

              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-gray-600">Échouées:</span>
                <span className="font-medium">{stats.failedTransactions}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            📊 Dashboard marchand complet
          </p>
        </div>
      </div>
    </div>
  );
}

export default MolamConnectExample;
