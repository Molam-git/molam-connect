// ============================================================================
// Splits Dashboard Component
// Purpose: View and manage split payments and settlements
// ============================================================================

import React, { useState, useEffect } from 'react';

interface Split {
  id: string;
  payment_id: string;
  recipient_type: string;
  recipient_id: string;
  split_amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'reversed';
  created_at: string;
  settled_at?: string;
}

interface Settlement {
  id: string;
  settlement_batch_id: string;
  recipient_type: string;
  total_splits_count: number;
  total_amount: number;
  currency: string;
  status: 'scheduled' | 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled';
  scheduled_at: string;
  completed_at?: string;
}

interface Statistics {
  total_splits: number;
  total_amount: number;
  by_status: Record<string, { count: number; amount: number }>;
  by_recipient_type: Record<string, { count: number; amount: number }>;
}

interface SplitsDashboardProps {
  platformId: string;
  apiBaseUrl?: string;
  authToken?: string;
}

export default function SplitsDashboard({
  platformId,
  apiBaseUrl = 'http://localhost:4064/api',
  authToken = 'mock-token',
}: SplitsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'splits' | 'settlements'>('overview');
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [splits, setSplits] = useState<Split[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch statistics
  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/splits/platform/${platformId}/statistics`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch statistics');

      const data = await response.json();
      setStatistics(data.data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching statistics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch splits
  const fetchSplits = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/splits/rules?platform_id=${platformId}&limit=50`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch splits');

      const data = await response.json();
      setSplits(data.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching splits:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch settlements
  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/settlements?platform_id=${platformId}&limit=50`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch settlements');

      const data = await response.json();
      setSettlements(data.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching settlements:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStatistics();
    fetchSplits();
    fetchSettlements();
  }, [platformId]);

  // Format currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount / 100);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'settled':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-orange-100 text-orange-800';
      case 'cancelled':
      case 'reversed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Split Payments Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage marketplace split payments and settlements</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {['overview', 'splits', 'settlements'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`
                  py-2 px-1 border-b-2 font-medium text-sm capitalize
                  ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        )}

        {/* Overview Tab */}
        {!loading && activeTab === 'overview' && statistics && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Total Splits</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {statistics.total_splits.toLocaleString()}
                </p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {formatCurrency(statistics.total_amount, 'USD')}
                </p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Settled</h3>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {statistics.by_status?.settled?.count || 0}
                </p>
              </div>
            </div>

            {/* By Status */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Splits by Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(statistics.by_status || {}).map(([status, data]) => (
                  <div key={status} className="border rounded p-4">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                    <p className="text-2xl font-bold mt-2">{data.count}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(data.amount, 'USD')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* By Recipient Type */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Splits by Recipient Type</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(statistics.by_recipient_type || {}).map(([type, data]) => (
                  <div key={type} className="border rounded p-4">
                    <p className="text-sm font-medium text-gray-700 capitalize">{type}</p>
                    <p className="text-2xl font-bold mt-2">{data.count}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(data.amount, 'USD')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Splits Tab */}
        {!loading && activeTab === 'splits' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recent Splits</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {splits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No splits found
                      </td>
                    </tr>
                  ) : (
                    splits.map((split) => (
                      <tr key={split.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {split.payment_id?.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="capitalize">{split.recipient_type}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(split.split_amount, split.currency)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              split.status
                            )}`}
                          >
                            {split.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(split.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Settlements Tab */}
        {!loading && activeTab === 'settlements' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recent Settlements</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Batch ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recipient Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Splits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Scheduled
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No settlements found
                      </td>
                    </tr>
                  ) : (
                    settlements.map((settlement) => (
                      <tr key={settlement.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {settlement.settlement_batch_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="capitalize">{settlement.recipient_type}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {settlement.total_splits_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(settlement.total_amount, settlement.currency)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              settlement.status
                            )}`}
                          >
                            {settlement.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(settlement.scheduled_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
