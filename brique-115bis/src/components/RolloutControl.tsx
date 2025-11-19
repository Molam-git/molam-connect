/**
 * Sous-Brique 115ter: Progressive Rollout Control Dashboard
 * Dashboard React pour créer et gérer les rollouts progressifs
 */

import React, { useEffect, useState } from 'react';

interface Rollout {
  id: number;
  plugin_name: string;
  version: string;
  rollout_percentage: number;
  rollout_strategy: 'random' | 'geo' | 'merchant_tier';
  status: 'active' | 'paused' | 'completed' | 'rolled_back';
  target_countries?: string[];
  target_tiers?: string[];
  sira_monitoring: boolean;
  error_threshold: number;
  created_at: string;
  updated_at: string;
  merchants_upgraded?: number;
  error_rate?: number;
}

interface RolloutFormData {
  plugin_name: string;
  version: string;
  percentage: number;
  strategy: 'random' | 'geo' | 'merchant_tier';
  target_countries: string;
  target_tiers: string;
  error_threshold: number;
}

export default function RolloutControl() {
  const [rollouts, setRollouts] = useState<Rollout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<RolloutFormData>({
    plugin_name: 'woocommerce',
    version: '',
    percentage: 5,
    strategy: 'random',
    target_countries: '',
    target_tiers: '',
    error_threshold: 0.03,
  });

  useEffect(() => {
    fetchRollouts();
    // Refresh every 30 seconds
    const interval = setInterval(fetchRollouts, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRollouts = async () => {
    try {
      const response = await fetch('/api/plugins/rollouts?include_metrics=true');
      const data = await response.json();
      setRollouts(data.rollouts || []);
    } catch (error) {
      console.error('Failed to fetch rollouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRollout = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        plugin_name: formData.plugin_name,
        version: formData.version,
        percentage: formData.percentage,
        strategy: formData.strategy,
        target_countries:
          formData.strategy === 'geo' && formData.target_countries
            ? formData.target_countries.split(',').map((c) => c.trim())
            : null,
        target_tiers:
          formData.strategy === 'merchant_tier' && formData.target_tiers
            ? formData.target_tiers.split(',').map((t) => t.trim())
            : null,
        error_threshold: formData.error_threshold,
      };

      const response = await fetch('/api/plugins/rollouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create rollout');
      }

      alert('Rollout created successfully!');
      setShowCreateForm(false);
      fetchRollouts();
    } catch (error) {
      console.error('Error creating rollout:', error);
      alert('Failed to create rollout: ' + error);
    }
  };

  const handleUpdatePercentage = async (rolloutId: number, newPercentage: number) => {
    try {
      const response = await fetch(`/api/plugins/rollouts/${rolloutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage: newPercentage }),
      });

      if (!response.ok) {
        throw new Error('Failed to update percentage');
      }

      alert(`Rollout percentage updated to ${newPercentage}%`);
      fetchRollouts();
    } catch (error) {
      console.error('Error updating percentage:', error);
      alert('Failed to update percentage');
    }
  };

  const handlePauseResume = async (rolloutId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    const action = currentStatus === 'active' ? 'pause' : 'resume';

    try {
      const response = await fetch(`/api/plugins/rollouts/${rolloutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} rollout`);
      }

      alert(`Rollout ${action}d successfully`);
      fetchRollouts();
    } catch (error) {
      console.error(`Error ${action}ing rollout:`, error);
      alert(`Failed to ${action} rollout`);
    }
  };

  const handleCompleteRollout = async (rolloutId: number) => {
    if (!confirm('Mark this rollout as completed? This will make it available to all merchants.')) {
      return;
    }

    try {
      const response = await fetch(`/api/plugins/rollouts/${rolloutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete rollout');
      }

      alert('Rollout marked as completed');
      fetchRollouts();
    } catch (error) {
      console.error('Error completing rollout:', error);
      alert('Failed to complete rollout');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'badge-success',
      paused: 'badge-warning',
      completed: 'badge-info',
      rolled_back: 'badge-error',
    };

    return <span className={`badge ${colors[status as keyof typeof colors]}`}>{status.toUpperCase()}</span>;
  };

  const getStrategyBadge = (strategy: string) => {
    const colors = {
      random: 'badge-info',
      geo: 'badge-geo',
      merchant_tier: 'badge-tier',
    };

    return <span className={`badge ${colors[strategy as keyof typeof colors]}`}>{strategy}</span>;
  };

  if (loading) {
    return <div className="loading">Loading rollouts...</div>;
  }

  return (
    <div className="rollout-control">
      <div className="header">
        <h2>🚀 Progressive Rollout Control</h2>
        <button className="btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : '+ Create New Rollout'}
        </button>
      </div>

      {/* Create Rollout Form */}
      {showCreateForm && (
        <div className="create-form-card">
          <h3>Create New Rollout</h3>
          <form onSubmit={handleCreateRollout}>
            <div className="form-row">
              <div className="form-group">
                <label>Plugin Name</label>
                <select
                  value={formData.plugin_name}
                  onChange={(e) => setFormData({ ...formData, plugin_name: e.target.value })}
                  required
                >
                  <option value="woocommerce">WooCommerce</option>
                  <option value="prestashop">PrestaShop</option>
                  <option value="shopify">Shopify</option>
                  <option value="magento">Magento</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Version</label>
                <input
                  type="text"
                  placeholder="e.g., 4.0.0"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Initial Percentage (%)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.percentage}
                  onChange={(e) => setFormData({ ...formData, percentage: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Rollout Strategy</label>
                <select
                  value={formData.strategy}
                  onChange={(e) =>
                    setFormData({ ...formData, strategy: e.target.value as RolloutFormData['strategy'] })
                  }
                >
                  <option value="random">Random Selection</option>
                  <option value="geo">Geographic Targeting</option>
                  <option value="merchant_tier">Merchant Tier Targeting</option>
                </select>
              </div>

              {formData.strategy === 'geo' && (
                <div className="form-group">
                  <label>Target Countries (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g., US, FR, SN"
                    value={formData.target_countries}
                    onChange={(e) => setFormData({ ...formData, target_countries: e.target.value })}
                  />
                </div>
              )}

              {formData.strategy === 'merchant_tier' && (
                <div className="form-group">
                  <label>Target Tiers (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g., enterprise, pro"
                    value={formData.target_tiers}
                    onChange={(e) => setFormData({ ...formData, target_tiers: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Error Threshold (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={formData.error_threshold * 100}
                  onChange={(e) => setFormData({ ...formData, error_threshold: parseFloat(e.target.value) / 100 })}
                />
                <small>Sira will auto-pause if error rate exceeds this</small>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Rollout
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Rollouts List */}
      <div className="rollouts-section">
        <h3>Active & Recent Rollouts</h3>

        {rollouts.length === 0 ? (
          <div className="empty-state">No rollouts configured. Create one to get started.</div>
        ) : (
          <div className="rollouts-grid">
            {rollouts.map((rollout) => (
              <div key={rollout.id} className={`rollout-card status-${rollout.status}`}>
                <div className="rollout-header">
                  <div>
                    <h4>
                      {rollout.plugin_name} v{rollout.version}
                    </h4>
                    <div className="rollout-badges">
                      {getStatusBadge(rollout.status)}
                      {getStrategyBadge(rollout.rollout_strategy)}
                    </div>
                  </div>
                  <div className="rollout-actions">
                    {rollout.status === 'active' && (
                      <>
                        <button className="btn-icon btn-pause" onClick={() => handlePauseResume(rollout.id, rollout.status)}>
                          ⏸ Pause
                        </button>
                        <button className="btn-icon btn-complete" onClick={() => handleCompleteRollout(rollout.id)}>
                          ✓ Complete
                        </button>
                      </>
                    )}
                    {rollout.status === 'paused' && (
                      <button className="btn-icon btn-resume" onClick={() => handlePauseResume(rollout.id, rollout.status)}>
                        ▶ Resume
                      </button>
                    )}
                  </div>
                </div>

                <div className="rollout-metrics">
                  <div className="metric">
                    <div className="metric-label">Rollout %</div>
                    <div className="metric-value">{rollout.rollout_percentage}%</div>
                  </div>
                  {rollout.merchants_upgraded !== undefined && (
                    <div className="metric">
                      <div className="metric-label">Merchants</div>
                      <div className="metric-value">{rollout.merchants_upgraded}</div>
                    </div>
                  )}
                  {rollout.error_rate !== undefined && (
                    <div className={`metric ${rollout.error_rate > rollout.error_threshold ? 'metric-danger' : ''}`}>
                      <div className="metric-label">Error Rate</div>
                      <div className="metric-value">{(rollout.error_rate * 100).toFixed(2)}%</div>
                    </div>
                  )}
                </div>

                <div className="progress-bar-container">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${rollout.rollout_percentage}%`,
                        backgroundColor: rollout.status === 'active' ? '#10b981' : '#6b7280',
                      }}
                    />
                  </div>
                  <div className="progress-label">{rollout.rollout_percentage}% deployed</div>
                </div>

                {rollout.status === 'active' && (
                  <div className="percentage-controls">
                    <button
                      className="btn-percentage"
                      onClick={() => handleUpdatePercentage(rollout.id, Math.min(rollout.rollout_percentage + 10, 100))}
                      disabled={rollout.rollout_percentage >= 100}
                    >
                      +10%
                    </button>
                    <button
                      className="btn-percentage"
                      onClick={() => handleUpdatePercentage(rollout.id, Math.min(rollout.rollout_percentage + 25, 100))}
                      disabled={rollout.rollout_percentage >= 100}
                    >
                      +25%
                    </button>
                    <button
                      className="btn-percentage"
                      onClick={() => handleUpdatePercentage(rollout.id, 100)}
                      disabled={rollout.rollout_percentage >= 100}
                    >
                      100%
                    </button>
                  </div>
                )}

                <div className="rollout-details">
                  {rollout.target_countries && rollout.target_countries.length > 0 && (
                    <div className="detail-row">
                      <strong>Target Countries:</strong> {rollout.target_countries.join(', ')}
                    </div>
                  )}
                  {rollout.target_tiers && rollout.target_tiers.length > 0 && (
                    <div className="detail-row">
                      <strong>Target Tiers:</strong> {rollout.target_tiers.join(', ')}
                    </div>
                  )}
                  <div className="detail-row">
                    <strong>Sira Monitoring:</strong> {rollout.sira_monitoring ? '✓ Enabled' : '✗ Disabled'}
                  </div>
                  <div className="detail-row">
                    <strong>Error Threshold:</strong> {(rollout.error_threshold * 100).toFixed(2)}%
                  </div>
                  <div className="detail-row">
                    <strong>Created:</strong> {new Date(rollout.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .rollout-control {
          padding: 2rem;
          max-width: 1400px;
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

        h4 {
          font-size: 1.1rem;
          color: #1f2937;
          margin: 0 0 0.5rem 0;
        }

        .btn-primary {
          padding: 0.75rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          padding: 0.75rem 1.5rem;
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-secondary:hover {
          background: #4b5563;
        }

        .create-form-card {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #374151;
        }

        .form-group input,
        .form-group select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group small {
          margin-top: 0.25rem;
          color: #6b7280;
          font-size: 0.85rem;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .rollouts-section {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .rollouts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 1.5rem;
          margin-top: 1rem;
        }

        .rollout-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          transition: border-color 0.2s;
        }

        .rollout-card.status-active {
          border-color: #10b981;
        }

        .rollout-card.status-paused {
          border-color: #f59e0b;
        }

        .rollout-card.status-completed {
          border-color: #3b82f6;
        }

        .rollout-card.status-rolled_back {
          border-color: #ef4444;
        }

        .rollout-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .rollout-badges {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .badge-info {
          background: #dbeafe;
          color: #1e40af;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .badge-geo {
          background: #e0e7ff;
          color: #3730a3;
        }

        .badge-tier {
          background: #fce7f3;
          color: #831843;
        }

        .rollout-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-icon {
          padding: 0.5rem 0.75rem;
          border: none;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-icon:hover {
          opacity: 0.8;
        }

        .btn-pause {
          background: #fef3c7;
          color: #92400e;
        }

        .btn-resume {
          background: #d1fae5;
          color: #065f46;
        }

        .btn-complete {
          background: #dbeafe;
          color: #1e40af;
        }

        .rollout-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .metric {
          text-align: center;
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

        .metric-danger .metric-value {
          color: #dc2626;
        }

        .progress-bar-container {
          margin: 1rem 0;
        }

        .progress-bar {
          width: 100%;
          height: 20px;
          background: #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .progress-label {
          font-size: 0.85rem;
          color: #6b7280;
          text-align: center;
        }

        .percentage-controls {
          display: flex;
          gap: 0.5rem;
          margin: 1rem 0;
        }

        .btn-percentage {
          flex: 1;
          padding: 0.5rem;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-percentage:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .btn-percentage:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rollout-details {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .detail-row {
          font-size: 0.9rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .detail-row strong {
          color: #374151;
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
