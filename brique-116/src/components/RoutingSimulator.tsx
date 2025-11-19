/**
 * Sous-Brique 116ter: Predictive Routing Simulator (Sira)
 * Interface pour simuler le routing avant exécution
 */

import React, { useState } from 'react';

interface RouteSimulation {
  predicted_success_rate_pct: number;
  predicted_latency_ms: number;
  predicted_fees_usd: number;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  recommendation: 'recommended' | 'acceptable' | 'caution' | 'avoid';
}

interface SimulationResult {
  simulation_id: string;
  routes: Record<string, RouteSimulation>;
  recommendation: RouteSimulation & { route: string };
  sira_version: string;
}

interface SimulationHistory {
  id: number;
  simulation_id: string;
  method: string;
  amount: number;
  currency: string;
  chosen_route: string | null;
  actual_outcome: string | null;
  was_prediction_correct: boolean | null;
  created_at: string;
  executed_at: string | null;
}

export default function RoutingSimulator({ merchantId }: { merchantId: string }) {
  const [amount, setAmount] = useState<string>('100.00');
  const [currency, setCurrency] = useState<string>('USD');
  const [method, setMethod] = useState<string>('card');
  const [countryCode, setCountryCode] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [history, setHistory] = useState<SimulationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/charges/simulate-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          method,
          amount: parseFloat(amount),
          currency,
          country_code: countryCode || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Simulation failed');
      }

      const data = await res.json();
      setSimulation(data);
      fetchHistory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/routing/simulations/${merchantId}?limit=10`);
      const data = await res.json();
      setHistory(data.simulations || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const executeSimulation = async (simulationId: string, chosenRoute: string) => {
    try {
      await fetch(`/api/routing/simulations/${simulationId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosen_route: chosenRoute,
          actual_outcome: 'success' // This would come from actual payment result
        })
      });
      fetchHistory();
    } catch (err) {
      console.error('Failed to record execution:', err);
    }
  };

  const getRiskBadgeClass = (risk: string) => {
    switch (risk) {
      case 'low': return 'badge-success';
      case 'medium': return 'badge-warning';
      case 'high': return 'badge-error';
      case 'critical': return 'badge-critical';
      default: return 'badge-neutral';
    }
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case 'recommended': return <span className="badge badge-success">✓ Recommended</span>;
      case 'acceptable': return <span className="badge badge-info">○ Acceptable</span>;
      case 'caution': return <span className="badge badge-warning">⚠ Caution</span>;
      case 'avoid': return <span className="badge badge-error">✗ Avoid</span>;
      default: return <span className="badge badge-neutral">-</span>;
    }
  };

  React.useEffect(() => {
    fetchHistory();
  }, [merchantId]);

  return (
    <div className="routing-simulator">
      <h2>🔮 Predictive Routing Simulator</h2>
      <p className="subtitle">Preview routing outcomes before execution to avoid failures</p>

      {/* Simulation Form */}
      <div className="simulator-form">
        <h3>Configure Simulation</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
              min="0"
            />
          </div>
          <div className="form-field">
            <label>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="XOF">XOF</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div className="form-field">
            <label>Payment Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="card">Card</option>
              <option value="wallet">Mobile Wallet</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <div className="form-field">
            <label>Country Code (optional)</label>
            <input
              type="text"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="US, SN, FR..."
              maxLength={2}
            />
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={runSimulation}
          disabled={loading || !amount || !currency}
        >
          {loading ? 'Simulating...' : '🔮 Run Simulation'}
        </button>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Simulation Results */}
      {simulation && (
        <div className="simulation-results">
          <h3>Simulation Results</h3>
          <div className="result-header">
            <span className="simulation-id">ID: {simulation.simulation_id.substring(0, 8)}...</span>
            <span className="sira-version">Sira {simulation.sira_version}</span>
          </div>

          {/* Recommended Route */}
          <div className="recommended-route">
            <div className="route-label">
              <span className="icon">⭐</span>
              <h4>Recommended Route</h4>
            </div>
            <div className="route-card highlight">
              <div className="route-name">{simulation.recommendation.route}</div>
              <div className="route-metrics">
                <div className="metric">
                  <span className="metric-label">Success Rate</span>
                  <span className={`metric-value ${simulation.recommendation.predicted_success_rate_pct >= 90 ? 'text-success' : 'text-warning'}`}>
                    {simulation.recommendation.predicted_success_rate_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Latency</span>
                  <span className="metric-value">{simulation.recommendation.predicted_latency_ms.toFixed(0)} ms</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Fees</span>
                  <span className="metric-value">${simulation.recommendation.predicted_fees_usd.toFixed(2)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Confidence</span>
                  <span className="metric-value">{(simulation.recommendation.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="route-badges">
                <span className={`badge ${getRiskBadgeClass(simulation.recommendation.risk_level)}`}>
                  {simulation.recommendation.risk_level.toUpperCase()} RISK
                </span>
                {getRecommendationBadge(simulation.recommendation.recommendation)}
              </div>
            </div>
          </div>

          {/* All Routes Comparison */}
          <div className="all-routes">
            <h4>All Available Routes</h4>
            <div className="routes-grid">
              {Object.entries(simulation.routes).map(([route, data]) => (
                <div key={route} className="route-card">
                  <div className="route-name">{route}</div>
                  <div className="route-metrics">
                    <div className="metric-small">
                      <span className="metric-label">Success</span>
                      <span className="metric-value">{data.predicted_success_rate_pct.toFixed(1)}%</span>
                    </div>
                    <div className="metric-small">
                      <span className="metric-label">Latency</span>
                      <span className="metric-value">{data.predicted_latency_ms.toFixed(0)} ms</span>
                    </div>
                    <div className="metric-small">
                      <span className="metric-label">Fees</span>
                      <span className="metric-value">${data.predicted_fees_usd.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="route-badges">
                    <span className={`badge-sm ${getRiskBadgeClass(data.risk_level)}`}>
                      {data.risk_level}
                    </span>
                    {data.recommendation === 'recommended' && <span className="star">⭐</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Simulation History */}
      {history.length > 0 && (
        <div className="simulation-history">
          <h3>Recent Simulations</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Chosen Route</th>
                <th>Outcome</th>
                <th>Prediction</th>
              </tr>
            </thead>
            <tbody>
              {history.map((sim) => (
                <tr key={sim.id}>
                  <td>{new Date(sim.created_at).toLocaleString()}</td>
                  <td>
                    <span className="method-badge">{sim.method}</span>
                  </td>
                  <td>{sim.amount.toFixed(2)} {sim.currency}</td>
                  <td>
                    {sim.chosen_route ? (
                      <code>{sim.chosen_route}</code>
                    ) : (
                      <span className="text-muted">Not executed</span>
                    )}
                  </td>
                  <td>
                    {sim.actual_outcome ? (
                      <span className={`badge ${sim.actual_outcome === 'success' ? 'badge-success' : 'badge-error'}`}>
                        {sim.actual_outcome}
                      </span>
                    ) : (
                      <span className="badge badge-pending">Pending</span>
                    )}
                  </td>
                  <td>
                    {sim.was_prediction_correct !== null ? (
                      sim.was_prediction_correct ? (
                        <span className="badge badge-success">✓ Correct</span>
                      ) : (
                        <span className="badge badge-error">✗ Incorrect</span>
                      )
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .routing-simulator {
          padding: 2rem;
          max-width: 1400px;
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

        h4 {
          font-size: 1.1rem;
          color: #4b5563;
          margin: 0;
        }

        .simulator-form {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .form-field label {
          display: block;
          font-size: 0.9rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .form-field input,
        .form-field select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 1rem;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-primary:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .error-message {
          margin-top: 1rem;
          padding: 1rem;
          background: #fee2e2;
          color: #991b1b;
          border-radius: 6px;
        }

        .simulation-results {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #e5e7eb;
        }

        .simulation-id {
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.9rem;
        }

        .sira-version {
          background: #dbeafe;
          color: #1e40af;
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .recommended-route {
          margin-bottom: 2rem;
        }

        .route-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .icon {
          font-size: 1.5rem;
        }

        .route-card {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
        }

        .route-card.highlight {
          border-color: #3b82f6;
          background: linear-gradient(135deg, #dbeafe 0%, #f9fafb 100%);
        }

        .route-name {
          font-size: 1.3rem;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 1rem;
        }

        .route-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .metric {
          display: flex;
          flex-direction: column;
        }

        .metric-label {
          font-size: 0.85rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .metric-value {
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

        .route-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
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

        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .badge-critical {
          background: #7f1d1d;
          color: white;
        }

        .badge-neutral {
          background: #e5e7eb;
          color: #4b5563;
        }

        .badge-pending {
          background: #e5e7eb;
          color: #6b7280;
        }

        .all-routes {
          margin-top: 2rem;
        }

        .routes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .metric-small {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .metric-small:last-child {
          border-bottom: none;
        }

        .metric-small .metric-label {
          font-size: 0.8rem;
          color: #6b7280;
        }

        .metric-small .metric-value {
          font-size: 0.9rem;
          font-weight: 600;
          color: #1f2937;
        }

        .badge-sm {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .star {
          font-size: 1rem;
        }

        .simulation-history {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .history-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }

        .history-table th {
          text-align: left;
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
          font-size: 0.9rem;
        }

        .history-table td {
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .method-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          background: #e0e7ff;
          color: #3730a3;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        code {
          font-family: monospace;
          background: #f3f4f6;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-size: 0.9rem;
        }

        .text-muted {
          color: #9ca3af;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
