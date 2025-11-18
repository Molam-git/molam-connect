// =====================================================================
// Overage Preview Page (Merchant View)
// =====================================================================
// React component for merchants to review and act on overage charges
// Date: 2025-11-12
// =====================================================================

import React, { useEffect, useState } from 'react';

// =====================================================================
// Types
// =====================================================================

interface Preview {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  final_amount: number;
  currency: string;
  status: string;
  merchant_notes?: string;
  notification_sent_at?: string;
}

interface PreviewLine {
  id: string;
  metric: string;
  unit_count: number;
  unit_price: number;
  amount: number;
  billing_model: string;
  line_status: string;
}

// =====================================================================
// Component
// =====================================================================

export default function OveragePreviewPage({ previewId }: { previewId: string }) {
  const [data, setData] = useState<{
    preview: Preview;
    lines: PreviewLine[];
    audit_log: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [contestReason, setContestReason] = useState('');
  const [showContestModal, setShowContestModal] = useState(false);

  // Fetch preview data
  useEffect(() => {
    fetch(`/api/previews/${previewId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [previewId]);

  // Handle accept
  const handleAccept = async () => {
    if (!window.confirm('Are you sure you want to accept these charges?')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/previews/${previewId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Accepted via UI' }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      alert('Charges accepted successfully!');
      window.location.reload();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle contest
  const handleContest = async () => {
    if (!contestReason.trim()) {
      alert('Please provide a reason for contesting');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/previews/${previewId}/contest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: contestReason }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      alert('Charges contested successfully! Our billing team will review.');
      setShowContestModal(false);
      window.location.reload();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading preview...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="error">Preview not found</div>;

  const { preview, lines } = data;
  const canTakeAction = ['pending', 'notified'].includes(preview.status);

  return (
    <div className="overage-preview-page">
      {/* Header */}
      <div className="preview-header">
        <h1>Overage Charges Preview</h1>
        <span className={`status-badge status-${preview.status}`}>{preview.status}</span>
      </div>

      {/* Summary Card */}
      <div className="card summary-card">
        <h2>Summary</h2>
        <div className="summary-grid">
          <div className="summary-item">
            <label>Billing Period</label>
            <value>{preview.period_start} to {preview.period_end}</value>
          </div>
          <div className="summary-item">
            <label>Total Charges</label>
            <value className="amount">{formatCurrency(preview.total_amount, preview.currency)}</value>
          </div>
          <div className="summary-item">
            <label>Final Amount</label>
            <value className="amount-large">{formatCurrency(preview.final_amount, preview.currency)}</value>
          </div>
          <div className="summary-item">
            <label>Number of Charges</label>
            <value>{lines.length}</value>
          </div>
        </div>
      </div>

      {/* Lines Table */}
      <div className="card lines-card">
        <h2>Charge Breakdown</h2>
        <table className="lines-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Units</th>
              <th>Unit Price</th>
              <th>Model</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{formatMetric(line.metric)}</td>
                <td>{formatNumber(line.unit_count)}</td>
                <td>{formatCurrency(line.unit_price, preview.currency)}</td>
                <td>{line.billing_model}</td>
                <td className="amount-cell">{formatCurrency(line.amount, preview.currency)}</td>
                <td>
                  <span className={`line-status line-status-${line.line_status}`}>
                    {line.line_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Total</strong></td>
              <td className="amount-cell"><strong>{formatCurrency(preview.total_amount, preview.currency)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Action Buttons */}
      {canTakeAction && (
        <div className="action-bar">
          <button
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={actionLoading}
          >
            {actionLoading ? 'Processing...' : 'Accept Charges'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowContestModal(true)}
            disabled={actionLoading}
          >
            Contest Charges
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            Print / Download
          </button>
        </div>
      )}

      {/* Contest Modal */}
      {showContestModal && (
        <div className="modal-overlay" onClick={() => setShowContestModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Contest Charges</h2>
            <p>Please provide a detailed reason for contesting these charges:</p>
            <textarea
              className="contest-textarea"
              value={contestReason}
              onChange={(e) => setContestReason(e.target.value)}
              placeholder="E.g., Incorrect unit count, already billed, service disruption..."
              rows={5}
            />
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleContest}
                disabled={!contestReason.trim() || actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Submit Contest'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowContestModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="info-box">
        <h3>What happens next?</h3>
        <ul>
          <li><strong>If you accept:</strong> Charges will be included in your next invoice</li>
          <li><strong>If you contest:</strong> Our billing team will review and contact you within 48 hours</li>
          <li><strong>If no action is taken:</strong> Charges will be automatically billed after {preview.period_end}</li>
        </ul>
      </div>
    </div>
  );
}

// =====================================================================
// Helper Functions
// =====================================================================

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatMetric(metric: string): string {
  return metric
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// =====================================================================
// Styles (CSS)
// =====================================================================
const styles = `
.overage-preview-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-pending { background: #fff3cd; color: #856404; }
.status-notified { background: #d1ecf1; color: #0c5460; }
.status-accepted { background: #d4edda; color: #155724; }
.status-contested { background: #f8d7da; color: #721c24; }
.status-approved_by_ops { background: #d4edda; color: #155724; }

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.summary-item label {
  display: block;
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}

.summary-item value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.amount {
  color: #667eea;
}

.amount-large {
  font-size: 32px !important;
  color: #667eea;
}

.lines-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.lines-table th,
.lines-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.lines-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #666;
}

.amount-cell {
  font-weight: 600;
}

.line-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.line-status-included { background: #d4edda; color: #155724; }
.line-status-excluded { background: #f8d7da; color: #721c24; }
.line-status-adjusted { background: #fff3cd; color: #856404; }

.action-bar {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin: 30px 0;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-outline {
  background: white;
  border: 1px solid #ddd;
  color: #333;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.contest-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  margin: 15px 0;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.info-box {
  background: #f8f9fa;
  border-left: 4px solid #667eea;
  padding: 20px;
  border-radius: 4px;
  margin-top: 30px;
}

.info-box h3 {
  margin-top: 0;
  color: #667eea;
}

.info-box ul {
  margin: 15px 0 0 0;
  padding-left: 20px;
}

.info-box li {
  margin-bottom: 10px;
}
`;
