// components/AutoHealingConsole.tsx
// Auto-Healing Console UI for Ops Dashboard

import React, { useState, useEffect } from 'react';

interface HealingLog {
  id: string;
  plugin_id: string;
  merchant_id: string;
  cms: string;
  plugin_version: string;
  detected_issue: string;
  issue_severity: 'low' | 'medium' | 'high' | 'critical';
  patch_type: string;
  applied_patch: any;
  status: 'pending' | 'applied' | 'rolled_back' | 'failed';
  sira_decision: any;
  sira_confidence: number;
  rollback_reason?: string;
  created_at: string;
  applied_at?: string;
  rolled_back_at?: string;
}

interface Stats {
  total_patches: number;
  applied: number;
  rolled_back: number;
  failed: number;
  avg_confidence: number;
  success_rate: number;
}

export default function AutoHealingConsole() {
  const [logs, setLogs] = useState<HealingLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: '',
    severity: '',
    limit: 50
  });
  const [selectedLog, setSelectedLog] = useState<HealingLog | null>(null);

  useEffect(() => {
    loadData();
  }, [filter]);

  async function loadData() {
    setLoading(true);
    try {
      // Load healing logs
      const logsRes = await fetch(`/api/v1/plugins/autoheal/logs?${new URLSearchParams({
        status: filter.status,
        issue_severity: filter.severity,
        limit: filter.limit.toString()
      })}`);
      const logsData = await logsRes.json();
      setLogs(logsData);

      // Load stats
      const statsRes = await fetch('/api/v1/plugins/autoheal/stats?days=30');
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function applyPatch(logId: string, patch: any) {
    if (!confirm('Are you sure you want to apply this patch?')) return;

    try {
      const res = await fetch(`/api/v1/plugins/autoheal/${logId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch })
      });

      if (res.ok) {
        alert('Patch applied successfully');
        loadData();
      } else {
        alert('Failed to apply patch');
      }
    } catch (error) {
      console.error('Apply patch failed:', error);
      alert('Error applying patch');
    }
  }

  async function rollbackPatch(logId: string) {
    const reason = prompt('Reason for rollback:');
    if (!reason) return;

    try {
      const res = await fetch(`/api/v1/plugins/autoheal/${logId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        alert('Patch rolled back successfully');
        loadData();
      } else {
        alert('Failed to rollback patch');
      }
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Error rolling back patch');
    }
  }

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'applied': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'rolled_back': return 'bg-orange-100 text-orange-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Auto-Healing Console</h1>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <StatCard label="Total Patches" value={stats.total_patches} />
            <StatCard label="Applied" value={stats.applied} color="green" />
            <StatCard label="Rolled Back" value={stats.rolled_back} color="orange" />
            <StatCard label="Failed" value={stats.failed} color="red" />
            <StatCard label="Avg Confidence" value={`${stats.avg_confidence}%`} />
            <StatCard label="Success Rate" value={`${stats.success_rate}%`} color="blue" />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="applied">Applied</option>
                <option value="rolled_back">Rolled Back</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={filter.severity}
                onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Limit</label>
              <select
                value={filter.limit}
                onChange={(e) => setFilter({ ...filter, limit: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Healing Logs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plugin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{log.cms}</div>
                    <div className="text-sm text-gray-500">{log.plugin_version}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-md truncate" title={log.detected_issue}>
                      {log.detected_issue}
                    </div>
                    <div className="text-xs text-gray-500">{log.patch_type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(log.issue_severity)}`}>
                      {log.issue_severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">{log.sira_confidence}%</div>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            log.sira_confidence >= 80 ? 'bg-green-600' :
                            log.sira_confidence >= 60 ? 'bg-yellow-600' :
                            'bg-red-600'
                          }`}
                          style={{ width: `${log.sira_confidence}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      View
                    </button>
                    {log.status === 'pending' && (
                      <button
                        onClick={() => applyPatch(log.id, log.sira_decision?.proposed_patch)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        Apply
                      </button>
                    )}
                    {log.status === 'applied' && (
                      <button
                        onClick={() => rollbackPatch(log.id)}
                        className="text-orange-600 hover:text-orange-900"
                      >
                        Rollback
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No healing logs found
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Healing Log Details</h2>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Plugin</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedLog.cms} - {selectedLog.plugin_version}</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Detected Issue</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded border border-gray-200 text-sm text-gray-900">
                      {selectedLog.detected_issue}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Applied Patch</label>
                    <pre className="mt-1 p-3 bg-gray-900 text-green-400 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.applied_patch, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Sira Decision</label>
                    <pre className="mt-1 p-3 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.sira_decision, null, 2)}
                    </pre>
                  </div>

                  {selectedLog.rollback_reason && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Rollback Reason</label>
                      <div className="mt-1 p-3 bg-red-50 rounded border border-red-200 text-sm text-red-900">
                        {selectedLog.rollback_reason}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-800',
    green: 'bg-green-100 text-green-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800'
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses]}`}>
        {value}
      </div>
    </div>
  );
}
