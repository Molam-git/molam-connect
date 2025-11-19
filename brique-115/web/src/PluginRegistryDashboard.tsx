/**
 * Brique 115 - Plugin Versioning & Migration Strategy
 * Ops Dashboard: Plugin Registry Management
 */

import React, { useEffect, useState } from "react";

interface PluginVersion {
  id: string;
  name: string;
  version: string;
  api_min_version: string;
  api_max_version: string;
  status: string;
  release_notes?: string;
  checksum: string;
  build_date: string;
  backwards_compatible: boolean;
  migration_required: boolean;
  security_advisory?: string;
}

interface UpgradeLog {
  id: string;
  merchant_id: string;
  plugin_name: string;
  from_version: string;
  to_version: string;
  status: string;
  created_at: string;
  duration_ms?: number;
}

export default function PluginRegistryDashboard() {
  const [selectedPlugin, setSelectedPlugin] = useState<string>("woocommerce");
  const [versions, setVersions] = useState<PluginVersion[]>([]);
  const [upgradeLogs, setUpgradeLogs] = useState<UpgradeLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedPlugin]);

  async function loadData() {
    try {
      setLoading(true);
      const [versionsRes, logsRes, statsRes] = await Promise.all([
        fetch(`/api/plugins/registry/${selectedPlugin}/all`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch("/api/plugins/upgrade-logs?limit=50", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch("/api/plugins/stats", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
      ]);

      const versionsData = await versionsRes.json();
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();

      setVersions(versionsData);
      setUpgradeLogs(logsData.rows || []);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateVersionStatus(version: string, status: string, reason?: string) {
    try {
      await fetch(`/api/plugins/registry/${selectedPlugin}/${version}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ status, reason })
      });

      await loadData();
      alert("Status updated successfully");
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Error updating status");
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      deprecated: "bg-yellow-100 text-yellow-800",
      blocked: "bg-red-100 text-red-800",
      beta: "bg-blue-100 text-blue-800",
      rc: "bg-purple-100 text-purple-800"
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
        {status.toUpperCase()}
      </span>
    );
  }

  if (loading) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Plugin Registry & Versioning</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-600">Total Versions</div>
            <div className="text-2xl font-bold">
              {stats.version_distribution?.reduce((sum: number, v: any) => sum + Number(v.total_versions), 0) || 0}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-600">Successful Upgrades</div>
            <div className="text-2xl font-bold text-green-600">
              {stats.upgrade_statistics?.successful || 0}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-600">Failed Upgrades</div>
            <div className="text-2xl font-bold text-red-600">
              {stats.upgrade_statistics?.failed || 0}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-600">Avg Duration</div>
            <div className="text-2xl font-bold">
              {stats.upgrade_statistics?.avg_duration_ms
                ? Math.round(stats.upgrade_statistics.avg_duration_ms) + "ms"
                : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Plugin Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Plugin</label>
        <select
          value={selectedPlugin}
          onChange={(e) => setSelectedPlugin(e.target.value)}
          className="border rounded-lg px-3 py-2"
        >
          <option value="woocommerce">WooCommerce</option>
          <option value="prestashop">PrestaShop</option>
          <option value="shopify">Shopify</option>
          <option value="magento">Magento</option>
          <option value="sdk-php">SDK PHP</option>
          <option value="sdk-node">SDK Node</option>
          <option value="sdk-python">SDK Python</option>
        </select>
      </div>

      {/* Versions Table */}
      <div className="bg-white border rounded-lg shadow-sm mb-6">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Versions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Version</th>
                <th className="px-4 py-3 text-left">API Range</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Build Date</th>
                <th className="px-4 py-3 text-left">Backwards Compat</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{v.version}</td>
                  <td className="px-4 py-3">
                    {v.api_min_version} → {v.api_max_version}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(v.status)}</td>
                  <td className="px-4 py-3">
                    {new Date(v.build_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {v.backwards_compatible ? "✅" : "❌"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={v.status}
                      onChange={(e) => updateVersionStatus(v.version, e.target.value)}
                      className="text-xs border rounded px-2 py-1"
                    >
                      <option value="active">Active</option>
                      <option value="deprecated">Deprecated</option>
                      <option value="blocked">Blocked</option>
                      <option value="beta">Beta</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upgrade Logs */}
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Upgrade Logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Plugin</th>
                <th className="px-4 py-3 text-left">From → To</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Duration</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {upgradeLogs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{log.plugin_name}</td>
                  <td className="px-4 py-3">
                    {log.from_version} → {log.to_version}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        log.status === "success"
                          ? "bg-green-100 text-green-800"
                          : log.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.duration_ms ? `${log.duration_ms}ms` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

