/**
 * Sous-Brique 116quater: AI Adaptive Routing Over Time (Sira)
 * Heatmap de performance temporelle et analyse de tendances
 */

import React, { useEffect, useState } from 'react';

interface PerformanceDay {
  date: string;
  success_rate: number;
  latency: number;
  total_txn: number;
  anomaly_score: number;
  health_status: 'normal' | 'warning' | 'critical';
}

interface RouteHeatmap {
  [route: string]: PerformanceDay[];
}

interface RouteTrend {
  route: string;
  adaptive_score: number;
  success_rate_pct: number;
  avg_latency_ms: number;
  avg_fee_pct: number;
  trend: 'improving' | 'degrading' | 'stable';
  seasonal_boost: number;
}

interface AdaptiveRecommendation {
  recommended_route: string;
  adaptive_score: number;
  success_rate_pct: number;
  avg_latency_ms: number;
  trend: string;
  alternatives: any;
}

export default function RoutingHeatmap({ merchantId }: { merchantId: string }) {
  const [heatmap, setHeatmap] = useState<RouteHeatmap>({});
  const [trends, setTrends] = useState<RouteTrend[]>([]);
  const [recommendation, setRecommendation] = useState<AdaptiveRecommendation | null>(null);
  const [method, setMethod] = useState<string>('card');
  const [currency, setCurrency] = useState<string>('USD');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [merchantId, method, currency]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch heatmap
      const heatmapRes = await fetch(`/api/routing/heatmap/${merchantId}`);
      const heatmapData = await heatmapRes.json();
      setHeatmap(heatmapData.heatmap || {});

      // Fetch trends
      const trendsRes = await fetch(`/api/routing/trends/${merchantId}?method=${method}&currency=${currency}`);
      const trendsData = await trendsRes.json();
      setTrends(trendsData.trends || []);

      // Fetch adaptive recommendation
      const recRes = await fetch(`/api/routing/adaptive-recommendation/${merchantId}?method=${method}&currency=${currency}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendation(recData);
      }
    } catch (error) {
      console.error('Failed to fetch routing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'critical': return '#dc2626';
      case 'warning': return '#f59e0b';
      case 'normal': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'degrading': return '📉';
      case 'stable': return '➡️';
      default: return '•';
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case 'improving': return <span className="badge badge-success">📈 Improving</span>;
      case 'degrading': return <span className="badge badge-error">📉 Degrading</span>;
      case 'stable': return <span className="badge badge-info">➡️ Stable</span>;
      default: return <span className="badge badge-neutral">-</span>;
    }
  };

  if (loading && Object.keys(heatmap).length === 0) {
    return <div className="loading">Loading routing performance data...</div>;
  }

  return (
    <div className="routing-heatmap-dashboard">
      <h2>🧠 AI Adaptive Routing Over Time</h2>
      <p className="subtitle">Sira learns from historical performance to optimize routing continuously</p>

      {/* Filters */}
      <div className="filters">
        <div className="filter-group">
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="card">Card</option>
            <option value="wallet">Mobile Wallet</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="XOF">XOF</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      {/* Adaptive Recommendation */}
      {recommendation && (
        <div className="recommendation-card">
          <h3>🎯 Sira's Adaptive Recommendation</h3>
          <div className="rec-content">
            <div className="rec-route">
              <span className="rec-label">Best Route</span>
              <span className="rec-value">{recommendation.recommended_route}</span>
            </div>
            <div className="rec-metrics">
              <div className="rec-metric">
                <span className="metric-label">Adaptive Score</span>
                <span className="metric-value score">{(recommendation.adaptive_score * 100).toFixed(1)}%</span>
              </div>
              <div className="rec-metric">
                <span className="metric-label">Success Rate</span>
                <span className="metric-value">{recommendation.success_rate_pct.toFixed(1)}%</span>
              </div>
              <div className="rec-metric">
                <span className="metric-label">Avg Latency</span>
                <span className="metric-value">{recommendation.avg_latency_ms.toFixed(0)} ms</span>
              </div>
              <div className="rec-metric">
                <span className="metric-label">Trend</span>
                {getTrendBadge(recommendation.trend)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Visualization */}
      <div className="heatmap-section">
        <h3>📊 Performance Heatmap (Last 7 Days)</h3>
        {Object.keys(heatmap).length === 0 ? (
          <div className="empty-state">No performance data available yet</div>
        ) : (
          <div className="heatmap-grid">
            {Object.entries(heatmap).map(([route, days]) => (
              <div key={route} className="route-heatmap">
                <div className="route-header">
                  <strong>{route}</strong>
                </div>
                <div className="days-grid">
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className="day-cell"
                      style={{
                        backgroundColor: getHealthColor(day.health_status),
                        opacity: 0.4 + (day.success_rate / 100) * 0.6
                      }}
                      title={`${new Date(day.date).toLocaleDateString()}: ${day.success_rate.toFixed(1)}% success, ${day.latency}ms latency (${day.total_txn} txn)`}
                    >
                      <span className="day-label">{new Date(day.date).getDate()}</span>
                      {day.anomaly_score > 0.5 && <span className="anomaly-indicator">⚠</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="heatmap-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
            <span>Normal</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div>
            <span>Warning</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#dc2626' }}></div>
            <span>Critical</span>
          </div>
          <div className="legend-item">
            <span className="anomaly-indicator">⚠</span>
            <span>Anomaly Detected</span>
          </div>
        </div>
      </div>

      {/* Trends Table */}
      <div className="trends-section">
        <h3>📈 Route Performance Trends (Last 30 Days)</h3>
        {trends.length === 0 ? (
          <div className="empty-state">No trend data available</div>
        ) : (
          <table className="trends-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Adaptive Score</th>
                <th>Success Rate</th>
                <th>Avg Latency</th>
                <th>Fees</th>
                <th>Trend</th>
                <th>Seasonal Factor</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((trend, i) => (
                <tr key={i} className={i === 0 ? 'best-route' : ''}>
                  <td>
                    <strong>{trend.route}</strong>
                    {i === 0 && <span className="best-badge">⭐ Best</span>}
                  </td>
                  <td>
                    <div className="score-bar-container">
                      <div
                        className="score-bar"
                        style={{ width: `${trend.adaptive_score * 100}%` }}
                      ></div>
                      <span className="score-text">{(trend.adaptive_score * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className={trend.success_rate_pct >= 95 ? 'text-success' : trend.success_rate_pct >= 85 ? 'text-warning' : 'text-error'}>
                    {trend.success_rate_pct.toFixed(1)}%
                  </td>
                  <td>{trend.avg_latency_ms.toFixed(0)} ms</td>
                  <td>{trend.avg_fee_pct.toFixed(2)}%</td>
                  <td>{getTrendBadge(trend.trend)}</td>
                  <td>
                    {trend.seasonal_boost > 1.0 ? (
                      <span className="seasonal-boost">+{((trend.seasonal_boost - 1) * 100).toFixed(0)}%</span>
                    ) : (
                      <span className="seasonal-normal">1.0x</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .routing-heatmap-dashboard {
          padding: 2rem;
          max-width: 1600px;
          margin: 0 auto;
        }

        h2 {
          font-size: 1.8rem;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: #6b7280;
          margin-bottom: 2rem;
        }

        h3 {
          font-size: 1.3rem;
          color: #374151;
          margin-bottom: 1rem;
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          padding: 1rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-group label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #374151;
        }

        .filter-group select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 1rem;
        }

        .recommendation-card {
          background: linear-gradient(135deg, #dbeafe 0%, #f9fafb 100%);
          border: 2px solid #3b82f6;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .rec-content {
          display: flex;
          gap: 2rem;
          align-items: center;
        }

        .rec-route {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .rec-label {
          font-size: 0.85rem;
          color: #6b7280;
        }

        .rec-value {
          font-size: 2rem;
          font-weight: bold;
          color: #1f2937;
        }

        .rec-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          flex: 1;
        }

        .rec-metric {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .metric-label {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
        }

        .metric-value {
          font-size: 1.2rem;
          font-weight: bold;
          color: #1f2937;
        }

        .metric-value.score {
          color: #3b82f6;
        }

        .heatmap-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .heatmap-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .route-heatmap {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .route-header {
          min-width: 150px;
          font-weight: 600;
        }

        .days-grid {
          display: flex;
          gap: 0.25rem;
          flex: 1;
        }

        .day-cell {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s;
          color: white;
          font-weight: 600;
        }

        .day-cell:hover {
          transform: scale(1.1);
        }

        .day-label {
          font-size: 0.9rem;
        }

        .anomaly-indicator {
          position: absolute;
          top: 2px;
          right: 2px;
          font-size: 0.75rem;
        }

        .heatmap-legend {
          display: flex;
          gap: 1.5rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-color {
          width: 20px;
          height: 20px;
          border-radius: 4px;
        }

        .trends-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .trends-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        .trends-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .trends-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .trends-table tr.best-route {
          background: #f0fdf4;
        }

        .best-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.2rem 0.5rem;
          background: #fef3c7;
          color: #92400e;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .score-bar-container {
          position: relative;
          width: 150px;
          height: 24px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .score-bar {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #10b981);
          transition: width 0.3s;
        }

        .score-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.85rem;
          font-weight: 600;
          color: #1f2937;
        }

        .text-success {
          color: #10b981;
          font-weight: 600;
        }

        .text-warning {
          color: #f59e0b;
          font-weight: 600;
        }

        .text-error {
          color: #dc2626;
          font-weight: 600;
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-info {
          background: #dbeafe;
          color: #1e40af;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .badge-neutral {
          background: #e5e7eb;
          color: #4b5563;
        }

        .seasonal-boost {
          color: #10b981;
          font-weight: 600;
        }

        .seasonal-normal {
          color: #6b7280;
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
