/**
 * Molam Ma (Wallet) - Example Implementation
 * Demonstrates full wallet home page with real data
 */
import React, { useState } from 'react';
import { MolamMaHome } from '../src/pages/MolamMaHome';
import type { Transaction } from '../src/pages/MolamMaHome';

function MolamMaExample() {
  const [transactions] = useState<Transaction[]>([
    {
      id: 'tx-001',
      type: 'credit',
      amount: 50000,
      currency: 'XOF',
      description: 'Reçu de Papa Diallo',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'transfer'
    },
    {
      id: 'tx-002',
      type: 'debit',
      amount: 12500,
      currency: 'XOF',
      description: 'Paiement Supermarché Casino',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'payment'
    },
    {
      id: 'tx-003',
      type: 'credit',
      amount: 100000,
      currency: 'XOF',
      description: 'Dépôt Wave',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'cash-in'
    },
    {
      id: 'tx-004',
      type: 'debit',
      amount: 25000,
      currency: 'XOF',
      description: 'Retrait distributeur UBA',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'cash-out'
    },
    {
      id: 'tx-005',
      type: 'debit',
      amount: 8500,
      currency: 'XOF',
      description: 'Transfert vers Aissatou Sow',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'transfer'
    },
    {
      id: 'tx-006',
      type: 'credit',
      amount: 75000,
      currency: 'XOF',
      description: 'Salaire Janvier',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'salary'
    },
    {
      id: 'tx-007',
      type: 'debit',
      amount: 3500,
      currency: 'XOF',
      description: 'Abonnement Netflix',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'subscription'
    },
    {
      id: 'tx-008',
      type: 'debit',
      amount: 15000,
      currency: 'XOF',
      description: 'Paiement Pharmacie',
      timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'payment'
    },
    {
      id: 'tx-009',
      type: 'credit',
      amount: 30000,
      currency: 'XOF',
      description: 'Remboursement Moussa',
      timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      category: 'transfer'
    },
    {
      id: 'tx-010',
      type: 'debit',
      amount: 45000,
      currency: 'XOF',
      description: 'Paiement Loyer',
      timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      category: 'payment'
    },
    {
      id: 'tx-011',
      type: 'debit',
      amount: 5000,
      currency: 'XOF',
      description: 'Transfert échoué',
      timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'failed',
      category: 'transfer'
    }
  ]);

  // Calculate balance from transactions
  const balance = 175000; // XOF

  // User data
  const userName = 'Amadou Diallo';
  const qrCodeData = 'molam://pay/user-amadou-123';

  // Handlers
  const handleTransferClick = () => {
    console.log('Navigate to Transfer page');
    alert('Transfert - Fonctionnalité à venir');
  };

  const handlePaymentClick = () => {
    console.log('Navigate to Payment page');
    alert('Paiement - Scanner QR code marchand');
  };

  const handleCashInOutClick = () => {
    console.log('Navigate to Cash In/Out page');
    alert('Dépôt/Retrait - Sélectionner méthode');
  };

  const handleSettingsClick = () => {
    console.log('Navigate to Settings');
    alert('Paramètres - Configuration compte');
  };

  const handleNotificationsClick = () => {
    console.log('Open Notifications');
    alert('Notifications - 3 nouvelles notifications');
  };

  const handleTransactionClick = (transactionId: string) => {
    console.log('View transaction:', transactionId);
    const tx = transactions.find(t => t.id === transactionId);
    if (tx) {
      alert(`Transaction: ${tx.description}\nMontant: ${tx.amount} ${tx.currency}\nStatut: ${tx.status}`);
    }
  };

  return (
    <div>
      <MolamMaHome
        userName={userName}
        balance={balance}
        currency="XOF"
        transactions={transactions}
        qrCodeData={qrCodeData}
        onTransferClick={handleTransferClick}
        onPaymentClick={handlePaymentClick}
        onCashInOutClick={handleCashInOutClick}
        onSettingsClick={handleSettingsClick}
        onNotificationsClick={handleNotificationsClick}
        onTransactionClick={handleTransactionClick}
      />

      {/* Demo Controls (for testing) */}
      <div className="fixed bottom-4 right-4 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 max-w-xs">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Molam Ma Demo
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-600">Balance:</span>
            <span className="font-medium">{balance.toLocaleString()} XOF</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Transactions:</span>
            <span className="font-medium">{transactions.length}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">En attente:</span>
            <span className="font-medium text-yellow-600">
              {transactions.filter(t => t.status === 'pending').length}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Échouées:</span>
            <span className="font-medium text-red-600">
              {transactions.filter(t => t.status === 'failed').length}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            🎯 Cliquez sur les boutons pour tester
          </p>
        </div>
      </div>
    </div>
  );
}

export default MolamMaExample;
