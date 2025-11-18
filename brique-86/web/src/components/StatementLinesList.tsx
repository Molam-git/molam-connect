// Statement Lines List Component (stub)
import React, { useState, useEffect } from 'react';

export function StatementLinesList() {
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLines();
  }, []);

  const fetchLines = async () => {
    try {
      const response = await fetch('/api/reco/lines?limit=100');
      const data = await response.json();
      setLines(data.data);
    } catch (error) {
      console.error('Failed to fetch lines:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading lines...</div>;
  }

  return (
    <div className="lines-list">
      <h2>All Statement Lines</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Description</th>
            <th>Reference</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{new Date(line.value_date).toLocaleDateString()}</td>
              <td className={line.amount < 0 ? 'debit' : 'credit'}>
                {line.currency} {Math.abs(line.amount).toFixed(2)}
              </td>
              <td>{line.description}</td>
              <td>{line.reference || '-'}</td>
              <td>
                <span className={`status-badge ${line.reconciliation_status}`}>
                  {line.reconciliation_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
