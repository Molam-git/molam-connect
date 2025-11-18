// Line Detail Modal - View full details and perform manual matching
import React, { useState, useEffect } from 'react';

interface Props {
  lineId: string;
  onClose: () => void;
  onResolve: (queueId: string, matchData: any) => Promise<void>;
}

export function LineDetailModal({ lineId, onClose, onResolve }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchLineDetails();
  }, [lineId]);

  const fetchLineDetails = async () => {
    try {
      const response = await fetch(`/api/reco/lines/${lineId}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch line details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMatch = async () => {
    if (!selectedCandidate || !data?.queue_entry) {
      return;
    }

    await onResolve(data.queue_entry.id, {
      matched_type: 'payout',
      matched_entity_id: selectedCandidate.id,
      notes,
    });
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { line, candidates } = data;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Statement Line Details</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <section className="line-details">
            <h3>Statement Line</h3>
            <div className="details-grid">
              <div className="detail-item">
                <label>Date:</label>
                <span>{new Date(line.value_date).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Amount:</label>
                <span className={line.amount < 0 ? 'debit' : 'credit'}>
                  {line.currency} {Math.abs(line.amount).toFixed(2)}
                </span>
              </div>
              <div className="detail-item">
                <label>Type:</label>
                <span>{line.transaction_type}</span>
              </div>
              <div className="detail-item full-width">
                <label>Description:</label>
                <span>{line.description}</span>
              </div>
              {line.reference && (
                <div className="detail-item">
                  <label>Reference:</label>
                  <span>{line.reference}</span>
                </div>
              )}
              {line.provider_ref && (
                <div className="detail-item">
                  <label>Provider Ref:</label>
                  <span>{line.provider_ref}</span>
                </div>
              )}
              {line.beneficiary_name && (
                <div className="detail-item full-width">
                  <label>Beneficiary:</label>
                  <span>{line.beneficiary_name}</span>
                </div>
              )}
            </div>
          </section>

          <section className="candidates-section">
            <h3>Candidate Matches ({candidates.length})</h3>
            {candidates.length === 0 ? (
              <p className="no-candidates">No matching payouts found</p>
            ) : (
              <div className="candidates-list">
                {candidates.map((candidate: any) => (
                  <div
                    key={candidate.id}
                    className={`candidate-card ${selectedCandidate?.id === candidate.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCandidate(candidate)}
                  >
                    <div className="candidate-header">
                      <input
                        type="radio"
                        checked={selectedCandidate?.id === candidate.id}
                        onChange={() => setSelectedCandidate(candidate)}
                      />
                      <span className="candidate-id">
                        {candidate.reference_code || candidate.id.substring(0, 8)}
                      </span>
                      <span className={`status-badge ${candidate.status}`}>
                        {candidate.status}
                      </span>
                    </div>
                    <div className="candidate-details">
                      <div>
                        <strong>Amount:</strong> {candidate.currency} {candidate.amount}
                      </div>
                      <div>
                        <strong>Date:</strong> {new Date(candidate.created_at).toLocaleDateString()}
                      </div>
                      {candidate.provider_ref && (
                        <div>
                          <strong>Provider Ref:</strong> {candidate.provider_ref}
                        </div>
                      )}
                    </div>
                    <div className="match-indicators">
                      {Math.abs(Number(candidate.amount) - Math.abs(line.amount)) < 0.01 && (
                        <span className="indicator good">Exact amount match</span>
                      )}
                      {candidate.reference_code === line.reference && (
                        <span className="indicator good">Reference match</span>
                      )}
                      {Math.abs(new Date(candidate.created_at).getTime() - new Date(line.value_date).getTime()) < 24 * 60 * 60 * 1000 && (
                        <span className="indicator good">Same day</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="notes-section">
            <label>Notes (optional):</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this match..."
              rows={3}
            />
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMatch}
            disabled={!selectedCandidate}
          >
            Match Selected
          </button>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .modal {
            background: white;
            border-radius: 0.5rem;
            max-width: 900px;
            width: 90%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid #e1e8ed;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 2rem;
            color: #718096;
            cursor: pointer;
            padding: 0;
            width: 2rem;
            height: 2rem;
            line-height: 1;
          }

          .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 1.5rem;
          }

          section {
            margin-bottom: 2rem;
          }

          section h3 {
            margin: 0 0 1rem 0;
            font-size: 1.125rem;
            color: #2d3748;
          }

          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
          }

          .detail-item {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }

          .detail-item.full-width {
            grid-column: 1 / -1;
          }

          .detail-item label {
            font-size: 0.75rem;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
          }

          .detail-item span {
            font-size: 0.875rem;
            color: #2d3748;
          }

          .credit {
            color: #48bb78;
            font-weight: 600;
          }

          .debit {
            color: #e53e3e;
            font-weight: 600;
          }

          .no-candidates {
            text-align: center;
            color: #718096;
            padding: 2rem;
          }

          .candidates-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .candidate-card {
            border: 2px solid #e1e8ed;
            border-radius: 0.5rem;
            padding: 1rem;
            cursor: pointer;
            transition: all 0.2s;
          }

          .candidate-card:hover {
            border-color: #cbd5e0;
            background: #f7fafc;
          }

          .candidate-card.selected {
            border-color: #3182ce;
            background: #ebf8ff;
          }

          .candidate-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.75rem;
          }

          .candidate-id {
            flex: 1;
            font-weight: 600;
            font-family: monospace;
          }

          .status-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 0.25rem;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
          }

          .status-badge.sent {
            background: #bee3f8;
            color: #2c5aa0;
          }

          .status-badge.processing {
            background: #fef5e7;
            color: #c05621;
          }

          .candidate-details {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            font-size: 0.875rem;
            margin-bottom: 0.75rem;
          }

          .match-indicators {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
          }

          .indicator {
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.75rem;
          }

          .indicator.good {
            background: #c6f6d5;
            color: #22543d;
          }

          .notes-section label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2d3748;
          }

          .notes-section textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #cbd5e0;
            border-radius: 0.25rem;
            font-family: inherit;
            font-size: 0.875rem;
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
            padding: 1.5rem;
            border-top: 1px solid #e1e8ed;
          }

          .btn {
            padding: 0.625rem 1.25rem;
            border: none;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .btn-primary {
            background: #3182ce;
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
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
    </div>
  );
}
