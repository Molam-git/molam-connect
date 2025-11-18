// =====================================================================
// Overage Ops Queue (Ops View)
// =====================================================================
// React component for Ops to review, approve, reject contested previews
// Date: 2025-11-12
// =====================================================================

import React, { useEffect, useState } from 'react';

interface Preview {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  currency: string;
  status: string;
  merchant_notes?: string;
  line_count: number;
  metrics: string[];
}

export default function OveragesOpsQueue() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPreview, setSelectedPreview] = useState<Preview | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch('/api/previews/ops/list?status=contested')
      .then((r) => r.json())
      .then((data) => setPreviews(data.previews))
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async () => {
    if (!selectedPreview || !action) return;

    const endpoint = action === 'approve' ? 'ops/approve' : 'ops/reject';
    const body = action === 'approve' ? { notes } : { reason: notes };

    try {
      await fetch(`/api/previews/${selectedPreview.id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      alert(`Preview ${action}d successfully`);
      setSelectedPreview(null);
      setAction(null);
      window.location.reload();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="ops-queue">
      <h1>Contested Previews Queue</h1>
      <table>
        <thead>
          <tr>
            <th>Tenant ID</th>
            <th>Period</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {previews.map((p) => (
            <tr key={p.id}>
              <td><code>{p.tenant_id.slice(0,8)}...</code></td>
              <td>{p.period_start} to {p.period_end}</td>
              <td>{p.total_amount} {p.currency}</td>
              <td><span className={`status-${p.status}`}>{p.status}</span></td>
              <td>{p.merchant_notes || '-'}</td>
              <td>
                <button onClick={() => { setSelectedPreview(p); setAction('approve'); }}>Approve</button>
                <button onClick={() => { setSelectedPreview(p); setAction('reject'); }}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedPreview && action && (
        <div className="modal-overlay" onClick={() => setSelectedPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{action === 'approve' ? 'Approve' : 'Reject'} Preview</h2>
            <p>Preview ID: {selectedPreview.id}</p>
            <p>Amount: {selectedPreview.total_amount} {selectedPreview.currency}</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={action === 'approve' ? 'Optional notes' : 'Rejection reason (required)'}
              rows={4}
            />
            <div className="modal-actions">
              <button onClick={handleAction} disabled={action === 'reject' && !notes.trim()}>
                Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
              <button onClick={() => setSelectedPreview(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
