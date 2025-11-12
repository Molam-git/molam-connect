import React, { useState, useEffect } from 'react';

interface Dispute {
  id: string;
  connect_tx_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  dispute_type: string;
  respond_by?: string;
  created_at: string;
  network_ref?: string;
}

interface DisputeStats {
  total_disputes: number;
  open: number;
  won: number;
  lost: number;
  win_rate: number;
  total_fees: number;
}

export default function DisputeWorkbench() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [merchantId, setMerchantId] = useState<string>('');

  useEffect(() => {
    if (merchantId) {
      fetchDisputes();
      fetchStats();
    }
  }, [merchantId, filter]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ merchant_id: merchantId });
      if (filter !== 'all') params.append('status', filter);

      const response = await fetch(`http://localhost:4066/api/disputes?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch disputes');
      }

      const data = await response.json();
      setDisputes(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching disputes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`http://localhost:4066/api/disputes/stats/${merchantId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800',
      evidence_submitted: 'bg-blue-100 text-blue-800',
      under_review: 'bg-purple-100 text-purple-800',
      won: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      chargeback: 'bg-red-100 text-red-800',
      inquiry: 'bg-blue-100 text-blue-800',
      retrieval: 'bg-yellow-100 text-yellow-800',
      fraud_claim: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getDaysRemaining = (respondBy?: string) => {
    if (!respondBy) return null;
    const now = new Date();
    const deadline = new Date(respondBy);
    const days = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dispute Workbench</h1>
        <p className="text-gray-600 mt-2">Manage chargebacks and disputes</p>
      </div>

      {/* Merchant Input */}
      {!merchantId && (
        <div className="mb-6 bg-white shadow rounded-lg p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter Merchant ID to view disputes
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="merchant-123"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  setMerchantId((e.target as HTMLInputElement).value);
                }
              }}
            />
            <button
              onClick={() => {
                const input = document.querySelector('input') as HTMLInputElement;
                setMerchantId(input.value);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Load Disputes
            </button>
          </div>
        </div>
      )}

      {merchantId && (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-sm text-gray-600">Total Disputes</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total_disputes}</div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-sm text-gray-600">Open</div>
                <div className="text-2xl font-bold text-yellow-600 mt-1">{stats.open}</div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-sm text-gray-600">Won</div>
                <div className="text-2xl font-bold text-green-600 mt-1">{stats.won}</div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-sm text-gray-600">Lost</div>
                <div className="text-2xl font-bold text-red-600 mt-1">{stats.lost}</div>
              </div>
              <div className="bg-white shadow rounded-lg p-4">
                <div className="text-sm text-gray-600">Win Rate</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{stats.win_rate}%</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="flex gap-2">
              {['all', 'open', 'evidence_submitted', 'under_review', 'won', 'lost'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {f.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Disputes List */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading disputes...</div>
            ) : error ? (
              <div className="p-6">
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              </div>
            ) : disputes.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No disputes found</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transaction
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deadline
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {disputes.map((dispute) => {
                    const daysRemaining = getDaysRemaining(dispute.respond_by);
                    return (
                      <tr key={dispute.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {dispute.connect_tx_id}
                          </div>
                          {dispute.network_ref && (
                            <div className="text-xs text-gray-500">Ref: {dispute.network_ref}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(
                              dispute.dispute_type
                            )}`}
                          >
                            {dispute.dispute_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{dispute.reason}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {formatCurrency(dispute.amount, dispute.currency)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                              dispute.status
                            )}`}
                          >
                            {dispute.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {daysRemaining !== null && (
                            <div
                              className={`${
                                daysRemaining <= 3
                                  ? 'text-red-600 font-bold'
                                  : 'text-gray-900'
                              }`}
                            >
                              {daysRemaining} days
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <button
                            onClick={() => {
                              window.location.href = `/disputes/${dispute.id}`;
                            }}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}