/**
 * Sous-Brique 115bis: Rollback Monitoring Dashboard
 * Dashboard React pour surveiller les rollbacks de plugins
 */

import React, { useEffect, useState } from 'react';

interface RollbackLog {
  rollback_id: string;
  merchant_id: string;
  plugin_name: string;
  from_version: string;
  to_version: string;
  rollback_trigger: 'automatic' | 'manual' | 'operator_forced';
  success: boolean;
  duration_ms: number;
  created_at: string;
  error_message?: string;
  backup_path?: string;
}

interface RollbackStats {
  success_rate_by_plugin: Array<{
    plugin_name: string;
    total_rollbacks: number;
    successful_rollbacks: number;
    success_rate_pct: number;
    avg_duration_ms: number;
  }>;
  rollbacks_last_24h: number;
  failed_rollbacks_last_7d: number;
}

export default function RollbackDashboard() {
  const [logs, setLogs] = useState<RollbackLog[]>([]);
  const [stats, setStats] = useState<RollbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ plugin_name: '', merchant_id: '' });

  useEffect(() => {
    fetchRollbackData();
  }, []);

  const fetchRollbackData = async () => {
    setLoading(true);

    try {
      // Fetch rollback history
      const historyParams = new URLSearchParams({
        limit: '50',
        ...(filter.merchant_id && { merchant_id: filter.merchant_id }),
        ...(filter.plugin_name && { plugin_name: filter.plugin_name }),
      });

      const historyRes = await fetch(`/api/plugins/rollback/history?${historyParams}`);
      const historyData = await historyRes.json();
      setLogs(historyData.rollbacks || []);

      // Fetch stats
      const statsRes = await fetch('/api/plugins/rollback/stats');
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch rollback data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const applyFilters = () => {
    fetchRollbackData();
  };

  const getStatusBadge = (success: boolean) => {
    return success ? (
      <span className="badge badge-success">✓ Success</span>
    ) : (
      <span className="badge badge-error">✗ Failed</span>
    );
  };

  const getTriggerBadge = (trigger: string) => {
    const colors = {
      automatic: 'badge-info',
      manual: 'badge-warning',
      operator_forced: 'badge-error',
    };

    return <span className={`badge ${colors[trigger as keyof typeof colors]}`}>{trigger}</span>;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  if (loading) {
    return <div className="loading">Loading rollback data...</div>;
  }

  return (
    <div className="rollback-dashboard">
      <h2>🔄 Suivi des Rollbacks Plugins</h2>

      {/* Stats Overview */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.rollbacks_last_24h}</div>
            <div className="stat-label">Rollbacks (24h)</div>
          </div>

          <div className="stat-card alert">
            <div className="stat-value">{stats.failed_rollbacks_last_7d}</div>
            <div className="stat-label">Failed Rollbacks (7d)</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {stats.success_rate_by_plugin.length > 0
                ? Math.round(
                    stats.success_rate_by_plugin.reduce((acc, p) => acc + p.success_rate_pct, 0) /
                      stats.success_rate_by_plugin.length
                  )
                : 0}
              %
            </div>
            <div className="stat-label">Overall Success Rate</div>
          </div>
        </div>
      )}

      {/* Success Rate by Plugin */}
      {stats && stats.success_rate_by_plugin.length > 0 && (
        <div className="plugin-stats-section">
          <h3>Success Rate by Plugin</h3>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Plugin</th>
                <th>Total Rollbacks</th>
                <th>Success Rate</th>
                <th>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.success_rate_by_plugin.map((plugin) => (
                <tr key={plugin.plugin_name}>
                  <td><strong>{plugin.plugin_name}</strong></td>
                  <td>{plugin.total_rollbacks}</td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${plugin.success_rate_pct}%`,
                          backgroundColor: plugin.success_rate_pct >= 90 ? '#10b981' : plugin.success_rate_pct >= 70 ? '#f59e0b' : '#ef4444',
                        }}
                      >
                        {plugin.success_rate_pct.toFixed(1)}%
                      </div>
                    </div>
                  </td>
                  <td>{formatDuration(plugin.avg_duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <h3>Filters</h3>
        <div className="filters">
          <input
            type="text"
            name="merchant_id"
            placeholder="Merchant ID"
            value={filter.merchant_id}
            onChange={handleFilterChange}
          />
          <input
            type="text"
            name="plugin_name"
            placeholder="Plugin Name"
            value={filter.plugin_name}
            onChange={handleFilterChange}
          />
          <button onClick={applyFilters} className="btn-primary">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Rollback History Table */}
      <div className="history-section">
        <h3>Rollback History</h3>

        {logs.length === 0 ? (
          <div className="empty-state">No rollbacks found</div>
        ) : (
          <table className="rollback-table">
            <thead>
              <tr>
                <th>Merchant ID</th>
                <th>Plugin</th>
                <th>From → To</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.rollback_id} className={log.success ? '' : 'error-row'}>
                  <td>
                    <code>{log.merchant_id.substring(0, 8)}...</code>
                  </td>
                  <td>
                    <strong>{log.plugin_name}</strong>
                  </td>
                  <td>
                    <span className="version-badge">{log.from_version}</span>
                    {' → '}
                    <span className="version-badge">{log.to_version}</span>
                  </td>
                  <td>{getTriggerBadge(log.rollback_trigger)}</td>
                  <td>{getStatusBadge(log.success)}</td>
                  <td>{formatDuration(log.duration_ms)}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>
                    {log.error_message && (
                      <details>
                        <summary className="error-summary">Error</summary>
                        <pre className="error-details">{log.error_message}</pre>
                      </details>
                    )}
                    {log.backup_path && (
                      <div className="backup-info">
                        <small>Backup: {log.backup_path}</small>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .rollback-dashboard {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        h2 {
          font-size: 1.8rem;
          margin-bottom: 1.5rem;
          color: #1f2937;
        }

        h3 {
          font-size: 1.3rem;
          margin-bottom: 1rem;
          color: #374151;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          border-left: 4px solid #3b82f6;
        }

        .stat-card.alert {
          border-left-color: #ef4444;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #6b7280;
          margin-top: 0.5rem;
        }

        .plugin-stats-section,
        .filters-section,
        .history-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .stats-table,
        .rollback-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        .stats-table th,
        .rollback-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
        }

        .stats-table td,
        .rollback-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .rollback-table tr.error-row {
          background: #fef2f2;
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .badge-info {
          background: #dbeafe;
          color: #1e40af;
        }

        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .version-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
        }

        .progress-bar {
          width: 100%;
          height: 24px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 0.85rem;
          font-weight: 500;
          transition: width 0.3s ease;
        }

        .filters {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .filters input {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.95rem;
          min-width: 200px;
        }

        .btn-primary {
          padding: 0.5rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .error-summary {
          color: #dc2626;
          cursor: pointer;
          font-weight: 500;
        }

        .error-details {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 4px;
          font-size: 0.85rem;
          overflow-x: auto;
        }

        .backup-info {
          margin-top: 0.25rem;
        }

        .backup-info small {
          color: #6b7280;
          font-size: 0.8rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
          font-size: 1.1rem;
        }

        .loading {
          text-align: center;
          padding: 3rem;
          font-size: 1.1rem;
          color: #6b7280;
        }

        code {
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
