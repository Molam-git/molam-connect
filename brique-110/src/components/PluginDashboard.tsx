// src/components/PluginDashboard.tsx
// Ops Dashboard for Plugin Monitoring

import React, { useState, useEffect } from 'react';

interface Plugin {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
  cms: string;
  plugin_version: string;
  latest_version: string;
  status: string;
  error_rate: number;
  last_heartbeat: string;
  errors_24h: number;
  environment: string;
}

interface PluginStats {
  active_count: number;
  outdated_count: number;
  blocked_count: number;
  error_count: number;
  high_error_rate_count: number;
  stale_count: number;
  avg_error_rate: number;
  cms_breakdown: Array<{ cms: string; count: number }>;
}

export default function PluginDashboard() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [stats, setStats] = useState<PluginStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', cms: '' });

  useEffect(() => {
    loadPlugins();
    loadStats();
  }, [filter]);

  async function loadPlugins() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.cms) params.append('cms', filter.cms);

      const response = await fetch(`/api/v1/plugins/list?${params}`);
      const data = await response.json();
      setPlugins(data);
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const response = await fetch('/api/v1/plugins/stats/overview');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function forceBlock(pluginId: string) {
    if (!confirm('Are you sure you want to block this plugin?')) return;

    try {
      await fetch(`/api/v1/plugins/${pluginId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toggle_key: 'block_plugin',
          toggle_value: true,
          reason: 'Manually blocked by Ops'
        })
      });

      alert('Plugin blocked successfully');
      loadPlugins();
    } catch (error) {
      alert('Failed to block plugin: ' + error);
    }
  }

  async function sendUpgradeNotification(pluginId: string) {
    try {
      await fetch(`/api/v1/plugins/${pluginId}/notify-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email' })
      });

      alert('Upgrade notification sent');
    } catch (error) {
      alert('Failed to send notification: ' + error);
    }
  }

  function getStatusBadgeColor(status: string) {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'outdated': return 'bg-yellow-100 text-yellow-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Plugin Monitoring Dashboard</h1>
        <p className="text-gray-600 mt-2">Monitor and manage all Molam Form plugin installations</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Active Plugins</div>
            <div className="text-2xl font-bold text-green-600">{stats.active_count}</div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Outdated</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.outdated_count}</div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">High Error Rate</div>
            <div className="text-2xl font-bold text-red-600">{stats.high_error_rate_count}</div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Avg Error Rate</div>
            <div className="text-2xl font-bold text-gray-900">{parseFloat(stats.avg_error_rate).toFixed(2)}%</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="border border-gray-300 rounded px-3 py-2"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="outdated">Outdated</option>
              <option value="blocked">Blocked</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CMS</label>
            <select
              className="border border-gray-300 rounded px-3 py-2"
              value={filter.cms}
              onChange={(e) => setFilter({ ...filter, cms: e.target.value })}
            >
              <option value="">All</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="prestashop">PrestaShop</option>
              <option value="shopify">Shopify</option>
              <option value="magento">Magento</option>
              <option value="noncms">Non-CMS</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadPlugins}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Plugins Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Merchant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CMS</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Heartbeat</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : plugins.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No plugins found
                </td>
              </tr>
            ) : (
              plugins.map((plugin) => (
                <tr key={plugin.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{plugin.merchant_name}</div>
                    <div className="text-sm text-gray-500">{plugin.merchant_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{plugin.cms}</div>
                    <div className="text-xs text-gray-500">{plugin.environment}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{plugin.plugin_version}</div>
                    {plugin.latest_version && plugin.plugin_version !== plugin.latest_version && (
                      <div className="text-xs text-blue-600">→ {plugin.latest_version}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(plugin.status)}`}>
                      {plugin.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {parseFloat(plugin.error_rate.toString()).toFixed(2)}%
                    </div>
                    {plugin.errors_24h > 0 && (
                      <div className="text-xs text-red-600">{plugin.errors_24h} errors (24h)</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{formatDate(plugin.last_heartbeat)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {plugin.status === 'outdated' && (
                        <button
                          onClick={() => sendUpgradeNotification(plugin.id)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                        >
                          Notify
                        </button>
                      )}
                      {plugin.status !== 'blocked' && (
                        <button
                          onClick={() => forceBlock(plugin.id)}
                          className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                        >
                          Block
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
