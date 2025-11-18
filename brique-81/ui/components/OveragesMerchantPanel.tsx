// =====================================================================
// Merchant Overage Dashboard
// =====================================================================
// Tenant-scoped view of overage charges with trends and recommendations
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
  unique_keys: number;
  unique_metrics: number;
}

interface Overage {
  id: string;
  event_id: string;
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
}

interface Trend {
  metric: string;
  trend_direction: 'up' | 'down' | 'stable';
  growth_rate_percent: number;
  avg_monthly_amount: number;
  currency: string;
  recommendation: string;
  analyzed_at: string;
}

// =====================================================================
// Component
// =====================================================================

export const OveragesMerchantPanel: React.FC = () => {
  const [summary, setSummary] = useState<OverageSummary[]>([]);
  const [overages, setOverages] = useState<Overage[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [metric, setMetric] = useState<string>('');
  const [billingStatus, setBillingStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const limit = 20;

  // Fetch summary
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await fetch(`/api/overages/merchant/summary?${params}`);
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
      if (metric) params.append('metric', metric);
      if (billingStatus) params.append('billing_status', billingStatus);
      params.append('limit', limit.toString());
      params.append('offset', ((page - 1) * limit).toString());

      const response = await fetch(`/api/overages/merchant/list?${params}`);
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

  // Fetch trends
  const fetchTrends = async () => {
    try {
      const response = await fetch('/api/overages/merchant/trends');
      if (!response.ok) throw new Error('Failed to fetch trends');

      const data = await response.json();
      setTrends(data.trends);
    } catch (err: any) {
      console.error('Error fetching trends:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchTrends();
  }, [startDate, endDate]);

  useEffect(() => {
    fetchOverages();
  }, [startDate, endDate, metric, billingStatus, page]);

  // Calculate totals by status
  const totalsByStatus = summary.reduce((acc, item) => {
    if (!acc[item.billing_status]) {
      acc[item.billing_status] = { amount: 0, currency: item.currency };
    }
    acc[item.billing_status].amount += item.total_amount;
    return acc;
  }, {} as Record<string, { amount: number; currency: string }>);

  return (
    <div className="overage-merchant-panel">
      <h1>Overage Charges</h1>

      {error && <div className="error-banner">{error}</div>}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="card">
          <h3>Pending Charges</h3>
          <p className="amount">
            {totalsByStatus.pending
              ? `${formatCurrency(totalsByStatus.pending.amount, totalsByStatus.pending.currency)}`
              : '$0.00'}
          </p>
          <p className="label">Awaiting billing</p>
        </div>

        <div className="card">
          <h3>Billed This Month</h3>
          <p className="amount">
            {totalsByStatus.billed
              ? `${formatCurrency(totalsByStatus.billed.amount, totalsByStatus.billed.currency)}`
              : '$0.00'}
          </p>
          <p className="label">Already invoiced</p>
        </div>

        <div className="card">
          <h3>Voided</h3>
          <p className="amount">
            {totalsByStatus.voided
              ? `${formatCurrency(totalsByStatus.voided.amount, totalsByStatus.voided.currency)}`
              : '$0.00'}
          </p>
          <p className="label">Credits and voids</p>
        </div>
      </div>

      {/* Trends Section */}
      {trends.length > 0 && (
        <div className="trends-section">
          <h2>Usage Trends & Recommendations</h2>
          <div className="trends-list">
            {trends.map((trend, idx) => (
              <div key={idx} className="trend-card">
                <div className="trend-header">
                  <span className="metric">{formatMetric(trend.metric)}</span>
                  <span className={`trend-badge trend-${trend.trend_direction}`}>
                    {trend.trend_direction === 'up' ? '↑' : trend.trend_direction === 'down' ? '↓' : '→'}
                    {Math.abs(trend.growth_rate_percent)}%
                  </span>
                </div>
                <p className="avg-amount">
                  Avg: {formatCurrency(trend.avg_monthly_amount, trend.currency)}/month
                </p>
                <p className="recommendation">{trend.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
              <th>Metric</th>
              <th>Units</th>
              <th>Unit Price</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>Loading...</td>
              </tr>
            ) : overages.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>No overages found</td>
              </tr>
            ) : (
              overages.map((overage) => (
                <tr key={overage.id}>
                  <td>{new Date(overage.overage_timestamp).toLocaleString()}</td>
                  <td>{formatMetric(overage.metric)}</td>
                  <td>{overage.units.toLocaleString()}</td>
                  <td>{formatCurrency(overage.unit_price, overage.currency)}</td>
                  <td className="amount-cell">
                    {formatCurrency(overage.amount, overage.currency)}
                  </td>
                  <td>
                    <span className={`status-badge status-${overage.billing_status}`}>
                      {overage.billing_status}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => viewDetails(overage)}>Details</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {Math.ceil(total / limit)}
        </span>
        <button
          disabled={page >= Math.ceil(total / limit)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
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

function viewDetails(overage: Overage): void {
  // Open modal or navigate to details page
  console.log('View details for overage:', overage);
  alert(`Event ID: ${overage.event_id}\nAmount: ${formatCurrency(overage.amount, overage.currency)}\nStatus: ${overage.billing_status}`);
}

// =====================================================================
// Styles (CSS-in-JS or external stylesheet)
// =====================================================================

const styles = `
.overage-merchant-panel {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.error-banner {
  background: #fee;
  border: 1px solid #c33;
  color: #c33;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card h3 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card .amount {
  font-size: 32px;
  font-weight: bold;
  margin: 10px 0;
  color: #333;
}

.card .label {
  font-size: 12px;
  color: #999;
}

.trends-section {
  margin-bottom: 30px;
}

.trends-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
}

.trend-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.trend-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 12px;
}

.trend-up { background: #fee; color: #c33; }
.trend-down { background: #efe; color: #3c3; }
.trend-stable { background: #eef; color: #33c; }

.recommendation {
  font-size: 13px;
  color: #666;
  margin-top: 10px;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filters input,
.filters select,
.filters button {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filters button {
  background: #007bff;
  color: white;
  cursor: pointer;
  border: none;
}

.filters button:hover {
  background: #0056b3;
}

.overages-table {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.amount-cell {
  font-weight: 600;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
}

.status-pending { background: #fff3cd; color: #856404; }
.status-billed { background: #d4edda; color: #155724; }
.status-voided { background: #f8d7da; color: #721c24; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}

.pagination button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination button:not(:disabled):hover {
  background: #f8f9fa;
}
`;
