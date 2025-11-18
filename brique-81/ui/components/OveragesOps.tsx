// =====================================================================
// Ops Overage Dashboard
// =====================================================================
// Global view with override capabilities (void, credit, adjust)
// Date: 2025-11-12
// =====================================================================

import React, { useState, useEffect } from 'react';

// =====================================================================
// Types
// =====================================================================

interface OverageSummary {
  total_overages: number;
  total_amount: number;
  currency: string;
  billing_status: string;
  unique_tenants: number;
  unique_metrics: number;
}

interface Overage {
  id: string;
  event_id: string;
  tenant_id: string;
  api_key_id: string;
  plan_id: string;
  country: string;
  metric: string;
  units: number;
  unit_price: number;
  amount: number;
  currency: string;
  billing_model: string;
  billing_status: string;
  billed_at: string | null;
  overage_timestamp: string;
  tier_breakdown: any;
  override_by: string | null;
  override_reason: string | null;
}

interface PricingRule {
  metric: string;
  unit_price: number;
  currency: string;
  billing_model: string;
  plan_id: string | null;
  country: string | null;
}

interface PreviewResult {
  amount: number;
  currency: string;
  units: number;
  billing_model: string;
  unit_price: number;
  tier_breakdown?: any[];
  formatted_amount: string;
  tier_breakdown_formatted?: string;
}

// =====================================================================
// Component
// =====================================================================

export const OveragesOps: React.FC = () => {
  const [summary, setSummary] = useState<OverageSummary[]>([]);
  const [overages, setOverages] = useState<Overage[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [metric, setMetric] = useState<string>('');
  const [billingStatus, setBillingStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal states
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedOverage, setSelectedOverage] = useState<Overage | null>(null);

  const limit = 50;

  // Fetch summary
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (tenantId) params.append('tenant_id', tenantId);

      const response = await fetch(`/api/overages/ops/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch summary');

      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      console.error('Error fetching summary:', err);
      setError(err.message);
    }
  };

  // Fetch overages list
  const fetchOverages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (tenantId) params.append('tenant_id', tenantId);
      if (metric) params.append('metric', metric);
      if (billingStatus) params.append('billing_status', billingStatus);
      params.append('limit', limit.toString());
      params.append('offset', ((page - 1) * limit).toString());

      const response = await fetch(`/api/overages/ops/list?${params}`);
      if (!response.ok) throw new Error('Failed to fetch overages');

      const data = await response.json();
      setOverages(data.overages);
      setTotal(data.total);
    } catch (err: any) {
      console.error('Error fetching overages:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch pricing rules
  const fetchPricingRules = async () => {
    try {
      const response = await fetch('/api/overages/ops/pricing');
      if (!response.ok) throw new Error('Failed to fetch pricing rules');

      const data = await response.json();
      setPricingRules(data.pricing);
    } catch (err: any) {
      console.error('Error fetching pricing rules:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchPricingRules();
  }, [startDate, endDate, tenantId]);

  useEffect(() => {
    fetchOverages();
  }, [startDate, endDate, tenantId, metric, billingStatus, page]);

  // Override actions
  const handleVoid = async (overageId: string, reason: string) => {
    try {
      const response = await fetch('/api/overages/ops/override/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overage_id: overageId, reason }),
      });

      if (!response.ok) throw new Error('Failed to void overage');

      alert('Overage voided successfully');
      setShowVoidModal(false);
      fetchOverages();
      fetchSummary();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCredit = async (overageId: string, creditAmount: number, reason: string) => {
    try {
      const response = await fetch('/api/overages/ops/override/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overage_id: overageId, credit_amount: creditAmount, reason }),
      });

      if (!response.ok) throw new Error('Failed to issue credit');

      alert('Credit issued successfully');
      setShowCreditModal(false);
      fetchOverages();
      fetchSummary();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleAdjust = async (
    overageId: string,
    newAmount: number | undefined,
    newUnits: number | undefined,
    reason: string
  ) => {
    try {
      const response = await fetch('/api/overages/ops/override/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overage_id: overageId,
          new_amount: newAmount,
          new_units: newUnits,
          reason,
        }),
      });

      if (!response.ok) throw new Error('Failed to adjust overage');

      alert('Overage adjusted successfully');
      setShowAdjustModal(false);
      fetchOverages();
      fetchSummary();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="overage-ops-panel">
      <h1>Ops — Overage Management</h1>

      {error && <div className="error-banner">{error}</div>}

      {/* Summary Cards */}
      <div className="summary-cards">
        {summary.map((item, idx) => (
          <div key={idx} className="card">
            <h3>{item.billing_status}</h3>
            <p className="amount">
              {formatCurrency(item.total_amount, item.currency)}
            </p>
            <p className="stats">
              {item.total_overages} overages • {item.unique_tenants} tenants • {item.unique_metrics} metrics
            </p>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button onClick={() => setShowPricingModal(true)}>Manage Pricing Rules</button>
        <button onClick={() => setShowPreviewModal(true)}>Preview Pricing</button>
        <button onClick={() => { fetchOverages(); fetchSummary(); }}>Refresh Data</button>
      </div>

      {/* Filters */}
      <div className="filters">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start Date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End Date"
        />
        <input
          type="text"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="Tenant ID"
        />
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="">All Metrics</option>
          <option value="requests_per_second">Requests/Second</option>
          <option value="requests_per_day">Requests/Day</option>
          <option value="requests_per_month">Requests/Month</option>
          <option value="data_transfer_gb">Data Transfer (GB)</option>
          <option value="api_calls">API Calls</option>
          <option value="compute_seconds">Compute Seconds</option>
        </select>
        <select value={billingStatus} onChange={(e) => setBillingStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="billed">Billed</option>
          <option value="voided">Voided</option>
        </select>
        <button onClick={() => { setPage(1); fetchOverages(); }}>Apply Filters</button>
      </div>

      {/* Overages Table */}
      <div className="overages-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Tenant ID</th>
              <th>Plan</th>
              <th>Country</th>
              <th>Metric</th>
              <th>Units</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Override</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center' }}>Loading...</td>
              </tr>
            ) : overages.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center' }}>No overages found</td>
              </tr>
            ) : (
              overages.map((overage) => (
                <tr key={overage.id}>
                  <td>{new Date(overage.overage_timestamp).toLocaleString()}</td>
                  <td>
                    <code>{overage.tenant_id.slice(0, 8)}...</code>
                  </td>
                  <td>{overage.plan_id}</td>
                  <td>{overage.country}</td>
                  <td>{formatMetric(overage.metric)}</td>
                  <td>{overage.units.toLocaleString()}</td>
                  <td className="amount-cell">
                    {formatCurrency(overage.amount, overage.currency)}
                  </td>
                  <td>
                    <span className={`status-badge status-${overage.billing_status}`}>
                      {overage.billing_status}
                    </span>
                  </td>
                  <td>
                    {overage.override_by ? (
                      <span className="override-indicator" title={overage.override_reason || ''}>
                        ✓ Ops
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="action-buttons-cell">
                      <button
                        onClick={() => {
                          setSelectedOverage(overage);
                          setShowVoidModal(true);
                        }}
                        disabled={overage.billing_status === 'voided'}
                      >
                        Void
                      </button>
                      <button
                        onClick={() => {
                          setSelectedOverage(overage);
                          setShowCreditModal(true);
                        }}
                      >
                        Credit
                      </button>
                      <button
                        onClick={() => {
                          setSelectedOverage(overage);
                          setShowAdjustModal(true);
                        }}
                        disabled={overage.billing_status === 'voided'}
                      >
                        Adjust
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {Math.ceil(total / limit)} ({total} total)
        </span>
        <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>

      {/* Modals */}
      {showVoidModal && selectedOverage && (
        <VoidModal
          overage={selectedOverage}
          onVoid={handleVoid}
          onClose={() => setShowVoidModal(false)}
        />
      )}

      {showCreditModal && selectedOverage && (
        <CreditModal
          overage={selectedOverage}
          onCredit={handleCredit}
          onClose={() => setShowCreditModal(false)}
        />
      )}

      {showAdjustModal && selectedOverage && (
        <AdjustModal
          overage={selectedOverage}
          onAdjust={handleAdjust}
          onClose={() => setShowAdjustModal(false)}
        />
      )}

      {showPricingModal && (
        <PricingModal
          pricingRules={pricingRules}
          onClose={() => {
            setShowPricingModal(false);
            fetchPricingRules();
          }}
        />
      )}

      {showPreviewModal && (
        <PreviewModal onClose={() => setShowPreviewModal(false)} />
      )}
    </div>
  );
};

// =====================================================================
// Modal Components
// =====================================================================

const VoidModal: React.FC<{
  overage: Overage;
  onVoid: (id: string, reason: string) => void;
  onClose: () => void;
}> = ({ overage, onVoid, onClose }) => {
  const [reason, setReason] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Void Overage Charge</h2>
        <p>
          Amount: <strong>{formatCurrency(overage.amount, overage.currency)}</strong>
        </p>
        <p>Event ID: <code>{overage.event_id}</code></p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for voiding (required)"
          rows={4}
        />
        <div className="modal-actions">
          <button onClick={() => onVoid(overage.id, reason)} disabled={!reason.trim()}>
            Void Charge
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const CreditModal: React.FC<{
  overage: Overage;
  onCredit: (id: string, amount: number, reason: string) => void;
  onClose: () => void;
}> = ({ overage, onCredit, onClose }) => {
  const [creditAmount, setCreditAmount] = useState(overage.amount);
  const [reason, setReason] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Issue Credit</h2>
        <p>
          Original Amount: <strong>{formatCurrency(overage.amount, overage.currency)}</strong>
        </p>
        <label>
          Credit Amount:
          <input
            type="number"
            value={creditAmount}
            onChange={(e) => setCreditAmount(parseFloat(e.target.value))}
            step="0.01"
            min="0"
          />
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for credit (required)"
          rows={4}
        />
        <div className="modal-actions">
          <button onClick={() => onCredit(overage.id, creditAmount, reason)} disabled={!reason.trim()}>
            Issue Credit
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const AdjustModal: React.FC<{
  overage: Overage;
  onAdjust: (id: string, amount: number | undefined, units: number | undefined, reason: string) => void;
  onClose: () => void;
}> = ({ overage, onAdjust, onClose }) => {
  const [newAmount, setNewAmount] = useState(overage.amount);
  const [newUnits, setNewUnits] = useState(overage.units);
  const [reason, setReason] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Adjust Overage</h2>
        <p>
          Original: {overage.units} units @ {formatCurrency(overage.unit_price, overage.currency)} ={' '}
          <strong>{formatCurrency(overage.amount, overage.currency)}</strong>
        </p>
        <label>
          New Amount:
          <input
            type="number"
            value={newAmount}
            onChange={(e) => setNewAmount(parseFloat(e.target.value))}
            step="0.01"
          />
        </label>
        <label>
          New Units:
          <input
            type="number"
            value={newUnits}
            onChange={(e) => setNewUnits(parseFloat(e.target.value))}
          />
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for adjustment (required)"
          rows={4}
        />
        <div className="modal-actions">
          <button onClick={() => onAdjust(overage.id, newAmount, newUnits, reason)} disabled={!reason.trim()}>
            Adjust
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const PricingModal: React.FC<{
  pricingRules: PricingRule[];
  onClose: () => void;
}> = ({ pricingRules, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="modal modal-large">
        <h2>Pricing Rules</h2>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Plan</th>
              <th>Country</th>
              <th>Model</th>
              <th>Unit Price</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {pricingRules.map((rule, idx) => (
              <tr key={idx}>
                <td>{formatMetric(rule.metric)}</td>
                <td>{rule.plan_id || 'Global'}</td>
                <td>{rule.country || 'All'}</td>
                <td>{rule.billing_model}</td>
                <td>{rule.unit_price}</td>
                <td>{rule.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const PreviewModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [planId, setPlanId] = useState('free');
  const [country, setCountry] = useState('US');
  const [metric, setMetric] = useState('requests_per_day');
  const [units, setUnits] = useState(1000);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const handlePreview = async () => {
    try {
      const response = await fetch('/api/overages/ops/pricing/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          country,
          metric,
          units_exceeded: units,
        }),
      });

      if (!response.ok) throw new Error('Failed to preview pricing');

      const data = await response.json();
      setPreview(data.preview);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Preview Pricing</h2>
        <label>
          Plan:
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label>
          Country:
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <label>
          Metric:
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="requests_per_second">Requests/Second</option>
            <option value="requests_per_day">Requests/Day</option>
            <option value="requests_per_month">Requests/Month</option>
            <option value="data_transfer_gb">Data Transfer (GB)</option>
            <option value="api_calls">API Calls</option>
            <option value="compute_seconds">Compute Seconds</option>
          </select>
        </label>
        <label>
          Units Exceeded:
          <input type="number" value={units} onChange={(e) => setUnits(parseInt(e.target.value))} />
        </label>
        <button onClick={handlePreview}>Calculate</button>

        {preview && (
          <div className="preview-result">
            <h3>Result</h3>
            <p>
              <strong>Amount:</strong> {preview.formatted_amount}
            </p>
            <p>
              <strong>Model:</strong> {preview.billing_model}
            </p>
            <p>
              <strong>Unit Price:</strong> {formatCurrency(preview.unit_price, preview.currency)}
            </p>
            {preview.tier_breakdown_formatted && (
              <pre>{preview.tier_breakdown_formatted}</pre>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// Helper Functions
// =====================================================================

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

function formatMetric(metric: string): string {
  return metric
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
