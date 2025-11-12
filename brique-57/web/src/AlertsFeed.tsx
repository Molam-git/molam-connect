import React, { useState, useEffect } from 'react';

interface Alert {
  id: string;
  payment_id: string;
  merchant_id: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  sira_score: any;
  velocity: any;
  created_at: string;
  action: any;
}

const AlertsFeed: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadAlerts();

    if (autoRefresh) {
      const interval = setInterval(loadAlerts, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadAlerts = async () => {
    try {
      const res = await fetch('/api/merchant-protection/alerts?limit=100', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setAlerts(data);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getActionBadge = (action: any) => {
    if (!action) return null;

    const actionType = action.action?.type;
    if (actionType === 'block') {
      return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">BLOCKED</span>;
    } else if (actionType === 'challenge') {
      return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">CHALLENGED</span>;
    } else if (actionType === 'hold_payout') {
      return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">PAYOUT HELD</span>;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading fraud alerts...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fraud Alerts</h1>
          <p className="text-gray-600 mt-1">Real-time high-risk payment notifications (last 24 hours)</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={loadAlerts}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Total Alerts</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{alerts.length}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Critical Alerts</div>
          <div className="text-3xl font-bold text-red-600 mt-2">
            {alerts.filter((a) => a.sira_score?.risk_level === 'critical').length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Blocked Payments</div>
          <div className="text-3xl font-bold text-orange-600 mt-2">
            {alerts.filter((a) => a.action?.action?.type === 'block').length}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            No fraud alerts in the last 24 hours
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-3 py-1 text-xs font-bold uppercase rounded border ${getRiskBadgeColor(
                        alert.sira_score?.risk_level
                      )}`}
                    >
                      {alert.sira_score?.risk_level || 'unknown'}
                    </span>
                    {getActionBadge(alert)}
                    <span className="text-sm text-gray-500">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500">Payment ID</div>
                      <div className="text-sm font-mono text-gray-900">{alert.payment_id.slice(0, 8)}...</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Amount</div>
                      <div className="text-sm font-bold text-gray-900">
                        {alert.amount.toFixed(2)} {alert.currency}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Customer</div>
                      <div className="text-sm font-mono text-gray-900">
                        {alert.customer_id ? alert.customer_id.slice(0, 8) + '...' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">SIRA Score</div>
                      <div className="text-sm font-bold text-gray-900">
                        {alert.sira_score?.score?.toFixed(2) || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Fraud Reasons */}
                  {alert.sira_score?.reasons && alert.sira_score.reasons.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">Fraud Indicators:</div>
                      <div className="flex flex-wrap gap-2">
                        {alert.sira_score.reasons.map((reason: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded border border-red-200"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Velocity */}
                  {alert.velocity && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Velocity:</div>
                      <div className="text-xs text-gray-700">
                        Last hour: {alert.velocity.count_1h || 0} payments, $
                        {(alert.velocity.sum_1h || 0).toFixed(2)} | Last 24h: {alert.velocity.count_24h || 0}{' '}
                        payments, ${(alert.velocity.sum_24h || 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">
                    View Details
                  </button>
                  <button className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsFeed;
