// Reconciliation Queue - Manual review interface
import React, { useState, useEffect } from 'react';
import { LineDetailModal } from './LineDetailModal';

interface QueueItem {
  id: string;
  reason: string;
  severity: string;
  status: string;
  line_id: string;
  value_date: string;
  amount: number;
  currency: string;
  description: string;
  reference: string | null;
  provider_ref: string | null;
  beneficiary_name: string | null;
  transaction_type: string;
  candidate_entities: any[];
  created_at: string;
}

interface Props {
  onUpdate: () => void;
}

export function ReconciliationQueue({ onUpdate }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: 'open',
    severity: '',
  });

  useEffect(() => {
    fetchQueue();
  }, [filters]);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.severity) params.append('severity', filters.severity);

      const response = await fetch(`/api/reco/queue?${params}`);
      const data = await response.json();
      setItems(data.data);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (queueId: string, matchData: any) => {
    try {
      const response = await fetch(`/api/reco/queue/${queueId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: getCurrentUserId(),
          ...matchData,
        }),
      });

      if (response.ok) {
        await fetchQueue();
        onUpdate();
        setSelectedLine(null);
      } else {
        throw new Error('Failed to resolve');
      }
    } catch (error) {
      console.error('Failed to resolve queue item:', error);
      alert('Failed to resolve item. Please try again.');
    }
  };

  const handleIgnore = async (queueId: string, notes: string) => {
    try {
      const response = await fetch(`/api/reco/queue/${queueId}/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: getCurrentUserId(),
          notes,
        }),
      });

      if (response.ok) {
        await fetchQueue();
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to ignore queue item:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#e53e3e';
      case 'high': return '#ed8936';
      case 'medium': return '#d69e2e';
      case 'low': return '#48bb78';
      default: return '#718096';
    }
  };

  return (
    <div className="reconciliation-queue">
      <div className="queue-filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="open">Open</option>
            <option value="in_review">In Review</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Severity:</label>
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading queue...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>No items in queue</p>
        </div>
      ) : (
        <div className="queue-list">
          {items.map((item) => (
            <div key={item.id} className="queue-item">
              <div className="item-header">
                <span
                  className="severity-badge"
                  style={{ background: getSeverityColor(item.severity) }}
                >
                  {item.severity}
                </span>
                <span className="reason">{item.reason.replace(/_/g, ' ')}</span>
                <span className="date">{new Date(item.value_date).toLocaleDateString()}</span>
              </div>

              <div className="item-details">
                <div className="detail-row">
                  <strong>Amount:</strong>
                  <span className={item.amount < 0 ? 'debit' : 'credit'}>
                    {item.currency} {Math.abs(item.amount).toFixed(2)}
                  </span>
                </div>
                <div className="detail-row">
                  <strong>Description:</strong>
                  <span>{item.description}</span>
                </div>
                {item.reference && (
                  <div className="detail-row">
                    <strong>Reference:</strong>
                    <span>{item.reference}</span>
                  </div>
                )}
                {item.beneficiary_name && (
                  <div className="detail-row">
                    <strong>Beneficiary:</strong>
                    <span>{item.beneficiary_name}</span>
                  </div>
                )}
              </div>

              {item.candidate_entities && item.candidate_entities.length > 0 && (
                <div className="candidates">
                  <strong>Possible matches ({item.candidate_entities.length}):</strong>
                  {item.candidate_entities.slice(0, 3).map((candidate: any, idx: number) => (
                    <div key={idx} className="candidate">
                      {candidate.type}: {candidate.id.substring(0, 8)}...
                      {candidate.score && ` (${(candidate.score * 100).toFixed(0)}% match)`}
                    </div>
                  ))}
                </div>
              )}

              <div className="item-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedLine(item.line_id)}
                >
                  Review & Match
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const notes = prompt('Reason for ignoring:');
                    if (notes) handleIgnore(item.id, notes);
                  }}
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLine && (
        <LineDetailModal
          lineId={selectedLine}
          onClose={() => setSelectedLine(null)}
          onResolve={handleResolve}
        />
      )}

      <style jsx>{`
        .reconciliation-queue {
          background: white;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .queue-filters {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          border-bottom: 1px solid #e1e8ed;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .filter-group label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #4a5568;
        }

        .filter-group select {
          padding: 0.375rem 0.75rem;
          border: 1px solid #cbd5e0;
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }

        .loading, .empty-state {
          padding: 3rem;
          text-align: center;
          color: #718096;
        }

        .queue-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
        }

        .queue-item {
          border: 1px solid #e1e8ed;
          border-radius: 0.5rem;
          padding: 1rem;
        }

        .item-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .severity-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 0.25rem;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .reason {
          flex: 1;
          font-weight: 500;
          text-transform: capitalize;
        }

        .date {
          color: #718096;
          font-size: 0.875rem;
        }

        .item-details {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .detail-row {
          display: flex;
          gap: 0.5rem;
          font-size: 0.875rem;
        }

        .detail-row strong {
          min-width: 8rem;
          color: #4a5568;
        }

        .credit {
          color: #48bb78;
        }

        .debit {
          color: #e53e3e;
        }

        .candidates {
          background: #f7fafc;
          padding: 0.75rem;
          border-radius: 0.25rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .candidate {
          margin-top: 0.25rem;
          color: #4a5568;
        }

        .item-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-primary {
          background: #3182ce;
          color: white;
        }

        .btn-primary:hover {
          background: #2c5aa0;
        }

        .btn-secondary {
          background: white;
          color: #4a5568;
          border: 1px solid #cbd5e0;
        }

        .btn-secondary:hover {
          background: #f7fafc;
        }
      `}</style>
    </div>
  );
}

function getCurrentUserId(): string {
  // In production, get from auth context
  return 'current-user-id';
}
