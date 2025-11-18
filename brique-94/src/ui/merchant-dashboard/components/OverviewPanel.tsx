import React, { useState, useEffect } from 'react';

interface Stats {
  total_intents: number;
  successful_payments: number;
  failed_payments: number;
  total_revenue: number;
  api_keys_count: number;
  recent_logs_count: number;
}

interface Props {
  merchantId: string;
}

const OverviewPanel: React.FC<Props> = ({ merchantId }) => {
  const [stats, setStats] = useState<Stats>({
    total_intents: 0,
    successful_payments: 0,
    failed_payments: 0,
    total_revenue: 0,
    api_keys_count: 0,
    recent_logs_count: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [merchantId]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // In production, this would be a single API call
      // For now, we'll simulate with mock data
      await new Promise(resolve => setTimeout(resolve, 500));

      setStats({
        total_intents: 1247,
        successful_payments: 1089,
        failed_payments: 158,
        total_revenue: 54329.50,
        api_keys_count: 4,
        recent_logs_count: 342
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading overview...</div>;
  }

  const successRate = stats.total_intents > 0
    ? ((stats.successful_payments / stats.total_intents) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="panel overview-panel">
      <div className="panel-header">
        <h2>Overview</h2>
        <button className="btn btn-secondary" onClick={fetchStats}>
          🔄 Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-revenue">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">${stats.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-label">Successful Payments</div>
            <div className="stat-value">{stats.successful_payments.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card stat-failed">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-label">Failed Payments</div>
            <div className="stat-value">{stats.failed_payments.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card stat-rate">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-label">Success Rate</div>
            <div className="stat-value">{successRate}%</div>
          </div>
        </div>

        <div className="stat-card stat-intents">
          <div className="stat-icon">💳</div>
          <div className="stat-content">
            <div className="stat-label">Total Payment Intents</div>
            <div className="stat-value">{stats.total_intents.toLocaleString()}</div>
          </div>
        </div>

        <div className="stat-card stat-keys">
          <div className="stat-icon">🔑</div>
          <div className="stat-content">
            <div className="stat-label">Active API Keys</div>
            <div className="stat-value">{stats.api_keys_count}</div>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <a href="#" className="action-card" onClick={(e) => { e.preventDefault(); window.location.hash = '#api-keys'; }}>
            <div className="action-icon">🔑</div>
            <div className="action-title">Generate API Key</div>
            <div className="action-description">Create test or live API keys</div>
          </a>

          <a href="#" className="action-card" onClick={(e) => { e.preventDefault(); window.location.hash = '#config'; }}>
            <div className="action-icon">⚙️</div>
            <div className="action-title">Customize Checkout</div>
            <div className="action-description">Configure branding and settings</div>
          </a>

          <a href="#" className="action-card" onClick={(e) => { e.preventDefault(); window.location.hash = '#logs'; }}>
            <div className="action-icon">📝</div>
            <div className="action-title">View Logs</div>
            <div className="action-description">Monitor plugin activity</div>
          </a>

          <a href="https://docs.molam.com" target="_blank" rel="noopener noreferrer" className="action-card">
            <div className="action-icon">📚</div>
            <div className="action-title">Documentation</div>
            <div className="action-description">Integration guides and API reference</div>
          </a>
        </div>
      </div>

      <div className="integration-guide">
        <h3>Getting Started</h3>
        <div className="guide-steps">
          <div className="guide-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Generate API Keys</h4>
              <p>Create test and live API keys for your integration</p>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Install SDK</h4>
              <p>Choose from Web, Mobile, or Server SDKs</p>
              <code>npm install molam-sdk</code>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Integrate Checkout</h4>
              <p>Add the Molam checkout widget to your application</p>
              <code>&lt;molam-checkout publishable-key="pk_test_xxx" .../&gt;</code>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Go Live</h4>
              <p>Switch to live API keys and start accepting payments</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewPanel;
