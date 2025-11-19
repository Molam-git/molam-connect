/**
 * Sous-Brique 116bis: Smart Auto-Routing by Sira
 * Vue des décisions automatiques de routing prises par Sira
 */

import React, { useEffect, useState } from 'react';

interface RoutingDecision {
  id: number;
  transaction_id: string;
  merchant_id: string;
  chosen_route: string;
  confidence: number;
  fallback_route: string | null;
  sira_version: string;
  actual_status: string | null;
  was_correct: boolean | null;
  created_at: string;
  override_by: string | null;
  override_reason: string | null;
}

interface SiraPerformance {
  sira_version: string;
  total_decisions: number;
  correct_decisions: number;
  accuracy_pct: number;
  avg_confidence: number;
  high_confidence_correct: number;
  high_confidence_total: number;
}

export default function AutoRoutingDecisions({ merchantId }: { merchantId: string }) {
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [performance, setPerformance] = useState<SiraPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [merchantId]);

  const fetchData = async () => {
    try {
      // Fetch decisions
      const decisionsRes = await fetch(`/api/routing/decisions/${merchantId}`);
      const decisionsData = await decisionsRes.json();
      setDecisions(decisionsData.decisions || []);

      // Fetch Sira performance
      const perfRes = await fetch('/api/routing/sira-performance');
      const perfData = await perfRes.json();
      setPerformance(perfData.performance || []);
    } catch (error) {
      console.error('Failed to fetch auto-routing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return 'badge-success';
    if (confidence >= 0.6) return 'badge-warning';
    return 'badge-error';
  };

  const getStatusBadge = (wasCorrect: boolean | null) => {
    if (wasCorrect === null) return <span className="badge badge-pending">Pending</span>;
    if (wasCorrect) return <span className="badge badge-success">✓ Correct</span>;
    return <span className="badge badge-error">✗ Incorrect</span>;
  };

  if (loading) {
    return <div className="loading">Loading auto-routing decisions...</div>;
  }

  return (
    <div className="auto-routing-dashboard">
      <h2>🤖 Sira Smart Auto-Routing</h2>

      {/* Sira Performance Metrics */}
      {performance.length > 0 && (
        <div className="performance-section">
          <h3>Sira Performance</h3>
          <div className="performance-grid">
            {performance.map((perf, i) => (
              <div key={i} className="perf-card">
                <div className="perf-header">
                  <span className="perf-version">{perf.sira_version}</span>
                </div>
                <div className="perf-metrics">
                  <div className="perf-metric">
                    <span className="perf-label">Accuracy</span>
                    <span className={`perf-value ${perf.accuracy_pct >= 90 ? 'text-success' : 'text-warning'}`}>
                      {perf.accuracy_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-label">Avg Confidence</span>
                    <span className="perf-value">{perf.avg_confidence.toFixed(1)}%</span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-label">Total Decisions</span>
                    <span className="perf-value">{perf.total_decisions}</span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-label">High Conf Accuracy</span>
                    <span className="perf-value">
                      {perf.high_confidence_total > 0
                        ? ((perf.high_confidence_correct / perf.high_confidence_total) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions Table */}
      <div className="decisions-section">
        <h3>Recent Decisions</h3>
        {decisions.length === 0 ? (
          <div className="empty-state">No routing decisions yet</div>
        ) : (
          <table className="decisions-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Chosen Route</th>
                <th>Confidence</th>
                <th>Fallback</th>
                <th>Version</th>
                <th>Result</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision) => (
                <tr key={decision.id} className={decision.override_by ? 'row-override' : ''}>
                  <td>
                    <code>{decision.transaction_id.substring(0, 8)}...</code>
                  </td>
                  <td>
                    <strong>{decision.chosen_route}</strong>
                    {decision.override_by && (
                      <span className="override-badge" title={decision.override_reason || ''}>
                        🔧 Override
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${getConfidenceBadge(decision.confidence)}`}>
                      {(decision.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td>{decision.fallback_route || '-'}</td>
                  <td>
                    <span className="version-badge">{decision.sira_version}</span>
                  </td>
                  <td>{getStatusBadge(decision.was_correct)}</td>
                  <td>{new Date(decision.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        .auto-routing-dashboard {
          padding: 2rem;
          max-width: 1600px;
          margin: 0 auto;
        }

        h2 {
          font-size: 1.8rem;
          color: #1f2937;
          margin-bottom: 2rem;
        }

        h3 {
          font-size: 1.3rem;
          color: #374151;
          margin-bottom: 1rem;
        }

        .performance-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .performance-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1rem;
        }

        .perf-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 1.5rem;
        }

        .perf-header {
          margin-bottom: 1rem;
        }

        .perf-version {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .perf-metrics {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .perf-metric {
          display: flex;
          flex-direction: column;
        }

        .perf-label {
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .perf-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: #1f2937;
        }

        .text-success {
          color: #10b981;
        }

        .text-warning {
          color: #f59e0b;
        }

        .decisions-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .decisions-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        .decisions-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .decisions-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .decisions-table tr.row-override {
          background: #fef3c7;
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

        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .badge-pending {
          background: #e5e7eb;
          color: #4b5563;
        }

        .override-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.2rem 0.5rem;
          background: #fef3c7;
          color: #92400e;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: help;
        }

        .version-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          background: #e0e7ff;
          color: #3730a3;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
        }

        code {
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-size: 0.9rem;
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
