// ============================================================================
// SLA Alerts Dashboard - Ops UI
// ============================================================================

import React, { useEffect, useState } from "react";

interface Alert {
  id: string;
  metric: string;
  observed_value: number;
  threshold: number;
  severity: string;
  status: string;
  bank_name?: string;
  rail?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

interface Stats {
  open_alerts: number;
  acknowledged_alerts: number;
  resolved_alerts: number;
  critical_alerts: number;
  warning_alerts: number;
}

export default function SlaAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<string>("open");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
    fetchStats();
    const interval = setInterval(() => {
      fetchAlerts();
      fetchStats();
    }, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [filter]);

  async function fetchAlerts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sla/alerts?status=${filter}&limit=50`);
      const data = await res.json();
      setAlerts(data);
    } catch (e) {
      console.error("Failed to fetch alerts:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/sla/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }

  async function acknowledgeAlert(id: string) {
    try {
      await fetch(`/api/sla/alerts/${id}/ack`, { method: "POST" });
      fetchAlerts();
    } catch (e) {
      alert("Failed to acknowledge alert");
    }
  }

  async function resolveAlert(id: string) {
    try {
      await fetch(`/api/sla/alerts/${id}/resolve`, { method: "POST" });
      fetchAlerts();
    } catch (e) {
      alert("Failed to resolve alert");
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      case "warning": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "info": return "text-blue-600 bg-blue-50 border-blue-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "text-red-600 bg-red-50";
      case "acknowledged": return "text-yellow-600 bg-yellow-50";
      case "resolved": return "text-green-600 bg-green-50";
      case "suppressed": return "text-gray-600 bg-gray-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Settlement SLA Alerts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("open")}
            className={`px-3 py-1 rounded ${filter === "open" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Open
          </button>
          <button
            onClick={() => setFilter("acknowledged")}
            className={`px-3 py-1 rounded ${filter === "acknowledged" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Acknowledged
          </button>
          <button
            onClick={() => setFilter("resolved")}
            className={`px-3 py-1 rounded ${filter === "resolved" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Resolved
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
            <div className="text-sm text-gray-600">Open Alerts</div>
            <div className="text-2xl font-bold">{stats.open_alerts || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="text-sm text-gray-600">Acknowledged</div>
            <div className="text-2xl font-bold">{stats.acknowledged_alerts || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <div className="text-sm text-gray-600">Resolved (24h)</div>
            <div className="text-2xl font-bold">{stats.resolved_alerts || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-700">
            <div className="text-sm text-gray-600">Critical (24h)</div>
            <div className="text-2xl font-bold text-red-600">{stats.critical_alerts || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-700">
            <div className="text-sm text-gray-600">Warning (24h)</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.warning_alerts || 0}</div>
          </div>
        </div>
      )}

      {/* Alerts Table */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank/Rail</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Threshold</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No alerts found</td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className={`hover:bg-gray-50 border-l-4 ${getSeverityColor(alert.severity)}`}>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(alert.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">{alert.metric}</td>
                  <td className="px-4 py-3 text-sm">
                    {alert.bank_name || '-'} / {alert.rail || 'all'}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">{alert.observed_value.toFixed(4)}</td>
                  <td className="px-4 py-3 text-sm">{alert.threshold.toFixed(4)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded uppercase ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(alert.status)}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {alert.status === 'open' && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Acknowledge
                        </button>
                      )}
                      {(alert.status === 'open' || alert.status === 'acknowledged') && (
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="text-green-600 hover:underline text-sm"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
