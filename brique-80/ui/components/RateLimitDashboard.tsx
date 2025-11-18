// =====================================================================
// Rate Limit Dashboard - Ops Console
// =====================================================================
// React component for managing rate limits, overrides, and blocks
// Date: 2025-11-12
// =====================================================================

import React, { useState, useEffect } from 'react';

// =====================================================================
// Types
// =====================================================================

interface RateLimitPlan {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  config: {
    rate_per_second: number;
    burst_capacity: number;
    daily_quota: number;
    monthly_quota: number;
  };
  price_monthly?: number;
  tenant_count?: number;
}

interface RateLimitBlock {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  reason_detail?: string;
  expires_at?: string;
  created_at: string;
}

interface RateLimitStatus {
  key_id: string;
  config: any;
  status: {
    tokens_available: number;
    daily_usage: number;
    monthly_usage: number;
    daily_usage_percent: number;
    monthly_usage_percent: number;
  };
  blocked: boolean;
  block_info?: RateLimitBlock;
}

// =====================================================================
// Dashboard Component
// =====================================================================

export const RateLimitDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'plans' | 'blocks' | 'status'>('plans');
  const [plans, setPlans] = useState<RateLimitPlan[]>([]);
  const [blocks, setBlocks] = useState<RateLimitBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load plans
  useEffect(() => {
    if (activeTab === 'plans') {
      loadPlans();
    } else if (activeTab === 'blocks') {
      loadBlocks();
    }
  }, [activeTab]);

  const loadPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rate-limits/plans');
      const data = await response.json();
      setPlans(data.plans);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBlocks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rate-limits/blocks?active=true');
      const data = await response.json();
      setBlocks(data.blocks);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rate-limit-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Rate Limit Management</h1>
        <p>Manage rate limiting plans, overrides, and blocks</p>
      </div>

      {/* Tabs */}
      <div className="dashboard-tabs">
        <button
          className={activeTab === 'plans' ? 'active' : ''}
          onClick={() => setActiveTab('plans')}
        >
          Plans
        </button>
        <button
          className={activeTab === 'blocks' ? 'active' : ''}
          onClick={() => setActiveTab('blocks')}
        >
          Blocks
        </button>
        <button
          className={activeTab === 'status' ? 'active' : ''}
          onClick={() => setActiveTab('status')}
        >
          Check Status
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Content */}
      <div className="dashboard-content">
        {loading && <div className="loading">Loading...</div>}

        {!loading && activeTab === 'plans' && (
          <PlansView plans={plans} onRefresh={loadPlans} />
        )}

        {!loading && activeTab === 'blocks' && (
          <BlocksView blocks={blocks} onRefresh={loadBlocks} />
        )}

        {!loading && activeTab === 'status' && <StatusView />}
      </div>
    </div>
  );
};

// =====================================================================
// Plans View
// =====================================================================

const PlansView: React.FC<{ plans: RateLimitPlan[]; onRefresh: () => void }> = ({
  plans,
  onRefresh,
}) => {
  return (
    <div className="plans-view">
      <div className="view-header">
        <h2>Rate Limit Plans</h2>
        <button onClick={onRefresh} className="btn-refresh">
          Refresh
        </button>
      </div>

      <table className="plans-table">
        <thead>
          <tr>
            <th>Plan</th>
            <th>Rate/sec</th>
            <th>Burst</th>
            <th>Daily Quota</th>
            <th>Monthly Quota</th>
            <th>Price</th>
            <th>Tenants</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan.id}>
              <td>
                <strong>{plan.display_name}</strong>
                <br />
                <span className="text-muted">{plan.name}</span>
              </td>
              <td>{plan.config.rate_per_second.toLocaleString()}</td>
              <td>{plan.config.burst_capacity.toLocaleString()}</td>
              <td>{plan.config.daily_quota.toLocaleString()}</td>
              <td>{plan.config.monthly_quota.toLocaleString()}</td>
              <td>
                {plan.price_monthly
                  ? `$${plan.price_monthly.toFixed(2)}`
                  : 'Free'}
              </td>
              <td>{plan.tenant_count || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {plans.length === 0 && (
        <div className="empty-state">No plans found</div>
      )}
    </div>
  );
};

// =====================================================================
// Blocks View
// =====================================================================

const BlocksView: React.FC<{ blocks: RateLimitBlock[]; onRefresh: () => void }> = ({
  blocks,
  onRefresh,
}) => {
  const [showBlockModal, setShowBlockModal] = useState(false);

  const handleRemoveBlock = async (blockId: string) => {
    if (!confirm('Are you sure you want to remove this block?')) {
      return;
    }

    try {
      await fetch(`/api/rate-limits/blocks/${blockId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Manual removal by Ops' }),
      });

      onRefresh();
    } catch (err: any) {
      alert(`Failed to remove block: ${err.message}`);
    }
  };

  return (
    <div className="blocks-view">
      <div className="view-header">
        <h2>Active Blocks</h2>
        <div>
          <button onClick={() => setShowBlockModal(true)} className="btn-primary">
            Create Block
          </button>
          <button onClick={onRefresh} className="btn-refresh">
            Refresh
          </button>
        </div>
      </div>

      <table className="blocks-table">
        <thead>
          <tr>
            <th>Target</th>
            <th>Reason</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td>
                <span className="badge">{block.target_type}</span>
                <br />
                <code>{block.target_id}</code>
              </td>
              <td>
                <strong>{block.reason}</strong>
                {block.reason_detail && (
                  <>
                    <br />
                    <span className="text-muted">{block.reason_detail}</span>
                  </>
                )}
              </td>
              <td>{new Date(block.created_at).toLocaleString()}</td>
              <td>
                {block.expires_at
                  ? new Date(block.expires_at).toLocaleString()
                  : 'Never'}
              </td>
              <td>
                <button
                  onClick={() => handleRemoveBlock(block.id)}
                  className="btn-danger btn-sm"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {blocks.length === 0 && (
        <div className="empty-state">No active blocks</div>
      )}

      {showBlockModal && (
        <BlockModal
          onClose={() => setShowBlockModal(false)}
          onSuccess={() => {
            setShowBlockModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};

// =====================================================================
// Status View
// =====================================================================

const StatusView: React.FC = () => {
  const [keyId, setKeyId] = useState('');
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!keyId.trim()) {
      setError('Please enter an API key ID');
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/rate-limits/status/${keyId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch status');
      }

      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!keyId.trim()) {
      return;
    }

    if (!confirm('Are you sure you want to reset rate limits for this key?')) {
      return;
    }

    try {
      await fetch(`/api/rate-limits/reset/${keyId}`, {
        method: 'POST',
      });

      alert('Rate limit reset successfully');
      handleCheck(); // Refresh status
    } catch (err: any) {
      alert(`Failed to reset: ${err.message}`);
    }
  };

  return (
    <div className="status-view">
      <h2>Check Rate Limit Status</h2>

      <div className="status-search">
        <input
          type="text"
          placeholder="Enter API Key ID (e.g., MK_live_...)"
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCheck()}
        />
        <button onClick={handleCheck} disabled={loading}>
          {loading ? 'Checking...' : 'Check Status'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {status && (
        <div className="status-result">
          <div className="status-card">
            <h3>Status Overview</h3>

            {status.blocked && (
              <div className="alert alert-warning">
                <strong>⚠️ Blocked</strong>
                <p>
                  Reason: {status.block_info?.reason}
                  <br />
                  {status.block_info?.expires_at && (
                    <>Expires: {new Date(status.block_info.expires_at).toLocaleString()}</>
                  )}
                </p>
              </div>
            )}

            <div className="status-grid">
              <div className="status-item">
                <label>Tokens Available</label>
                <div className="value">{status.status.tokens_available.toFixed(0)}</div>
              </div>

              <div className="status-item">
                <label>Daily Usage</label>
                <div className="value">
                  {status.status.daily_usage.toLocaleString()} / {status.config.daily_quota.toLocaleString()}
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${status.status.daily_usage_percent}%` }}
                    />
                  </div>
                  <small>{status.status.daily_usage_percent.toFixed(1)}%</small>
                </div>
              </div>

              <div className="status-item">
                <label>Monthly Usage</label>
                <div className="value">
                  {status.status.monthly_usage.toLocaleString()} / {status.config.monthly_quota.toLocaleString()}
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${status.status.monthly_usage_percent}%` }}
                    />
                  </div>
                  <small>{status.status.monthly_usage_percent.toFixed(1)}%</small>
                </div>
              </div>
            </div>

            <div className="status-actions">
              <button onClick={handleReset} className="btn-warning">
                Reset Rate Limit
              </button>
            </div>
          </div>

          <div className="status-card">
            <h3>Configuration</h3>
            <table className="config-table">
              <tbody>
                <tr>
                  <td>Rate per Second</td>
                  <td>{status.config.rate_per_second}</td>
                </tr>
                <tr>
                  <td>Burst Capacity</td>
                  <td>{status.config.burst_capacity}</td>
                </tr>
                <tr>
                  <td>Daily Quota</td>
                  <td>{status.config.daily_quota.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Monthly Quota</td>
                  <td>{status.config.monthly_quota.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// Block Modal
// =====================================================================

const BlockModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [targetType, setTargetType] = useState<string>('api_key');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState<string>('ops_manual');
  const [reasonDetail, setReasonDetail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoRemove, setAutoRemove] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetId.trim()) {
      alert('Please enter a target ID');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/rate-limits/blocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason,
          reason_detail: reasonDetail || undefined,
          expires_at: expiresAt || undefined,
          auto_remove: autoRemove,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create block');
      }

      onSuccess();
    } catch (err: any) {
      alert(`Failed to create block: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Rate Limit Block</h3>
          <button onClick={onClose} className="close-btn">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Target Type</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="api_key">API Key</option>
              <option value="tenant">Tenant</option>
              <option value="ip">IP Address</option>
              <option value="region">Region</option>
            </select>
          </div>

          <div className="form-group">
            <label>Target ID</label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g., MK_live_ABC123"
              required
            />
          </div>

          <div className="form-group">
            <label>Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="ops_manual">Ops Manual</option>
              <option value="sira_fraud">SIRA Fraud</option>
              <option value="sira_abuse">SIRA Abuse</option>
              <option value="security">Security</option>
              <option value="payment_failed">Payment Failed</option>
              <option value="tos_violation">TOS Violation</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Reason Detail (Optional)</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Additional context..."
            />
          </div>

          <div className="form-group">
            <label>Expires At (Optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <small>Leave empty for manual removal</small>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={autoRemove}
                onChange={(e) => setAutoRemove(e.target.checked)}
              />
              Auto-remove when expired
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Block'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RateLimitDashboard;
