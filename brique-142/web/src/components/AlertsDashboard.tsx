/**
 * BRIQUE 142 — Alerts Dashboard
 * Real-time alerts monitoring and management
 */

import React, { useEffect, useState } from 'react';

interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  status: string;
  priority: number;
  detected_at: string;
  playbooks_executed: number;
  notifications_sent: number;
}

export default function AlertsDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState({ status: '', severity: '', type: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
    loadStats();

    // Real-time polling (replace with WebSocket in production)
    const interval = setInterval(() => {
      loadAlerts();
      loadStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [filter]);

  async function loadAlerts() {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.severity) params.append('severity', filter.severity);
      if (filter.type) params.append('type', filter.type);

      const resp = await fetch(`/api/alerts?${params}`);
      const data = await resp.json();
      setAlerts(data);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const resp = await fetch('/api/alerts/stats');
      const data = await resp.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function acknowledgeAlert(id: string) {
    try {
      await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
      loadAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  async function resolveAlert(id: string) {
    try {
      await fetch(`/api/alerts/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: 'Resolved from dashboard' }),
      });
      loadAlerts();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-900';
      case 'warning':
        return 'bg-yellow-100 border-yellow-300 text-yellow-900';
      case 'info':
        return 'bg-blue-100 border-blue-300 text-blue-900';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-900';
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      new: 'bg-red-500 text-white',
      acknowledged: 'bg-yellow-500 text-white',
      in_progress: 'bg-blue-500 text-white',
      resolved: 'bg-green-500 text-white',
      dismissed: 'bg-gray-500 text-white',
    };
    return colors[status] || 'bg-gray-500 text-white';
  }

  if (loading) {
    return <div className="p-6">Loading alerts...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Alerts Center</h1>
        <p className="text-sm text-gray-600">Real-time monitoring and incident response</p>
      </header>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-600">Total (24h)</div>
            <div className="text-2xl font-bold">
              {stats.by_status.reduce((sum: number, s: any) => sum + parseInt(s.count), 0)}
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-700">Critical</div>
            <div className="text-2xl font-bold text-red-900">
              {stats.by_severity.find((s: any) => s.severity === 'critical')?.count || 0}
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-sm text-yellow-700">Warning</div>
            <div className="text-2xl font-bold text-yellow-900">
              {stats.by_severity.find((s: any) => s.severity === 'warning')?.count || 0}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-700">Info</div>
            <div className="text-2xl font-bold text-blue-900">
              {stats.by_severity.find((s: any) => s.severity === 'info')?.count || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              className="w-full border px-3 py-2 rounded"
              value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}
            >
              <option value="">All</option>
              <option value="payout_delay">Payout Delay</option>
              <option value="fraud_detected">Fraud Detected</option>
              <option value="bank_failover">Bank Failover</option>
              <option value="suspicious_txn">Suspicious Transaction</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 border-2 rounded-lg shadow-sm ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(alert.status)}`}>
                    {alert.status}
                  </span>
                  <span className="text-xs px-2 py-1 bg-white rounded font-mono">
                    {alert.type}
                  </span>
                  <span className="text-xs text-gray-600">
                    Priority: {alert.priority}
                  </span>
                </div>
                <h3 className="font-semibold">{alert.message}</h3>
              </div>
              <div className="text-xs text-gray-600">
                {new Date(alert.detected_at).toLocaleString()}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div className="text-xs text-gray-700">
                📋 {alert.playbooks_executed} playbooks • 📧 {alert.notifications_sent} notifications
              </div>

              <div className="ml-auto flex gap-2">
                {alert.status === 'new' && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                  >
                    Acknowledge
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {alerts.length === 0 && (
          <div className="text-center py-12 text-gray-500">No alerts matching filters</div>
        )}
      </div>
    </div>
  );
}
