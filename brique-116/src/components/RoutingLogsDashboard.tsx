/**
 * Brique 116: Routing Logs Dashboard
 * Vue d'ensemble des performances de routing de paiements
 */

import React, { useEffect, useState } from 'react';

interface RoutingStat {
  route: string;
  method: string;
  total: number;
  success: number;
  failed: number;
  success_rate: number;
  avg_latency: number;
  p95_latency: number;
  total_volume: number;
  currency: string;
}

interface Recommendation {
  route: string;
  recommendation: string;
  reason: string;
  metrics: {
    total_attempts: number;
    success_rate_pct: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
}

interface Anomaly {
  merchant_id: string;
  route: string;
  anomaly_type: string;
  current_value: number;
  threshold: number;
  detected_at: string;
}

export default function RoutingLogsDashboard() {
  const [stats, setStats] = useState<RoutingStat[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchantId, setMerchantId] = useState('merchant-demo-001');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [merchantId, selectedMethod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch stats
      const statsUrl = selectedMethod === 'all'
        ? `/api/charges/routing-stats/${merchantId}`
        : `/api/charges/routing-stats/${merchantId}?method=${selectedMethod}`;

      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();
      setStats(statsData.stats || []);

      // Fetch recommendations
      const recsRes = await fetch(`/api/charges/routing-recommendations/${merchantId}`);
      const recsData = await recsRes.json();
      setRecommendations(recsData.recommendations || []);

      // Fetch anomalies
      const anomaliesRes = await fetch('/api/charges/routing-anomalies');
      const anomaliesData = await anomaliesRes.json();
      setAnomalies(anomaliesData.anomalies || []);
    } catch (error) {
      console.error('Failed to fetch routing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationBadge = (rec: string) => {
    const colors = {
      disable: 'bg-red-100 text-red-800',
      monitor: 'bg-yellow-100 text-yellow-800',
      optimize_latency: 'bg-orange-100 text-orange-800',
      prioritize: 'bg-green-100 text-green-800',
      ok: 'bg-gray-100 text-gray-800',
    };
    return colors[rec as keyof typeof colors] || colors.ok;
  };

  const getMethodIcon = (method: string) => {
    const icons = {
      wallet: '💳',
      card: '🏦',
      bank: '🏛️',
    };
    return icons[method as keyof typeof icons] || '💰';
  };

  if (loading && stats.length === 0) {
    return <div className="loading">Loading routing data...</div>;
  }

  return (
    <div className="routing-dashboard">
      <div className="header">
        <h2>🚦 Charge Routing Logs & Analytics</h2>
        <div className="controls">
          <input
            type="text"
            placeholder="Merchant ID"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="input-merchant-id"
          />
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="select-method"
          >
            <option value="all">All Methods</option>
            <option value="wallet">Wallet</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
          </select>
          <button onClick={fetchData} className="btn-refresh">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Anomalies Alert */}
      {anomalies.length > 0 && (
        <div className="anomalies-alert">
          <h3>⚠️ Anomalies Détectées</h3>
          {anomalies.map((anomaly, i) => (
            <div key={i} className="anomaly-item">
              <span className="anomaly-route">{anomaly.route}</span>
              <span className="anomaly-type">{anomaly.anomaly_type}</span>
              <span className="anomaly-value">
                {anomaly.current_value.toFixed(2)} (threshold: {anomaly.threshold})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="recommendations-section">
          <h3>💡 Recommandations Sira</h3>
          <div className="recommendations-grid">
            {recommendations.map((rec, i) => (
              <div key={i} className="recommendation-card">
                <div className="rec-header">
                  <span className="rec-route">{rec.route}</span>
                  <span className={`rec-badge ${getRecommendationBadge(rec.recommendation)}`}>
                    {rec.recommendation}
                  </span>
                </div>
                <p className="rec-reason">{rec.reason}</p>
                <div className="rec-metrics">
                  <div className="rec-metric">
                    <span>Success Rate:</span>
                    <strong>{rec.metrics.success_rate_pct}%</strong>
                  </div>
                  <div className="rec-metric">
                    <span>Avg Latency:</span>
                    <strong>{Math.round(rec.metrics.avg_latency_ms)}ms</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routing Stats Table */}
      <div className="stats-section">
        <h3>📊 Statistiques par Route</h3>
        {stats.length === 0 ? (
          <div className="empty-state">Aucune donnée disponible pour ce marchand</div>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Method</th>
                <th>Total</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Success Rate</th>
                <th>Avg Latency</th>
                <th>P95 Latency</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, i) => (
                <tr key={i} className={stat.success_rate < 90 ? 'row-warning' : ''}>
                  <td>
                    <strong>{stat.route}</strong>
                  </td>
                  <td>
                    <span className="method-badge">
                      {getMethodIcon(stat.method)} {stat.method}
                    </span>
                  </td>
                  <td>{stat.total}</td>
                  <td className="text-success">{stat.success}</td>
                  <td className="text-error">{stat.failed}</td>
                  <td>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar"
                        style={{
                          width: `${stat.success_rate}%`,
                          backgroundColor:
                            stat.success_rate >= 95
                              ? '#10b981'
                              : stat.success_rate >= 85
                              ? '#f59e0b'
                              : '#ef4444',
                        }}
                      />
                      <span className="progress-label">{stat.success_rate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={stat.avg_latency > 1000 ? 'text-warning' : ''}>
                      {Math.round(stat.avg_latency)}ms
                    </span>
                  </td>
                  <td>
                    <span className={stat.p95_latency > 2000 ? 'text-error' : ''}>
                      {Math.round(stat.p95_latency)}ms
                    </span>
                  </td>
                  <td>
                    {stat.total_volume.toLocaleString()} {stat.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .routing-dashboard {
          padding: 2rem;
          max-width: 1600px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        h2 {
          font-size: 1.8rem;
          color: #1f2937;
          margin: 0;
        }

        h3 {
          font-size: 1.3rem;
          color: #374151;
          margin-bottom: 1rem;
        }

        .controls {
          display: flex;
          gap: 1rem;
        }

        .input-merchant-id,
        .select-method {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.95rem;
        }

        .btn-refresh {
          padding: 0.5rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-refresh:hover {
          background: #2563eb;
        }

        .anomalies-alert {
          background: #fef2f2;
          border: 2px solid #fecaca;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .anomalies-alert h3 {
          color: #dc2626;
          margin-top: 0;
        }

        .anomaly-item {
          display: flex;
          gap: 1rem;
          padding: 0.75rem;
          background: white;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .anomaly-route {
          font-weight: 600;
          color: #1f2937;
        }

        .anomaly-type {
          color: #6b7280;
          font-family: monospace;
        }

        .anomaly-value {
          margin-left: auto;
          color: #dc2626;
          font-weight: 600;
        }

        .recommendations-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .recommendations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .recommendation-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 1rem;
        }

        .rec-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .rec-route {
          font-weight: 600;
          color: #1f2937;
        }

        .rec-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .rec-reason {
          color: #6b7280;
          font-size: 0.9rem;
          margin-bottom: 0.75rem;
        }

        .rec-metrics {
          display: flex;
          gap: 1rem;
        }

        .rec-metric {
          display: flex;
          flex-direction: column;
          font-size: 0.85rem;
        }

        .rec-metric span {
          color: #9ca3af;
        }

        .rec-metric strong {
          color: #1f2937;
          font-size: 1rem;
        }

        .stats-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .stats-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        .stats-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .stats-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .stats-table tr.row-warning {
          background: #fef3c7;
        }

        .method-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: #e0e7ff;
          color: #3730a3;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .text-success {
          color: #059669;
          font-weight: 600;
        }

        .text-error {
          color: #dc2626;
          font-weight: 600;
        }

        .text-warning {
          color: #d97706;
          font-weight: 600;
        }

        .progress-bar-container {
          position: relative;
          width: 100%;
          height: 24px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          transition: width 0.3s ease;
        }

        .progress-label {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #1f2937;
          font-weight: 600;
          font-size: 0.85rem;
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
      `}</style>
    </div>
  );
}
