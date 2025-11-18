// Reconciliation Statistics Component (stub)
import React from 'react';

interface Props {
  stats: any;
}

export function ReconciliationStats({ stats }: Props) {
  if (!stats) {
    return <div>Loading stats...</div>;
  }

  return (
    <div className="stats-dashboard">
      <h2>Reconciliation Statistics</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Lines</h3>
          <div className="stat-value">{stats.lines.total_lines}</div>
        </div>

        <div className="stat-card">
          <h3>Matched</h3>
          <div className="stat-value success">{stats.lines.matched_count}</div>
        </div>

        <div className="stat-card">
          <h3>Unmatched</h3>
          <div className="stat-value error">{stats.lines.unmatched_count}</div>
        </div>

        <div className="stat-card">
          <h3>Match Rate</h3>
          <div className="stat-value">{stats.lines.match_rate_pct}%</div>
        </div>
      </div>

      <div className="queue-stats">
        <h3>Queue by Severity</h3>
        {stats.queue.map((q: any) => (
          <div key={q.severity} className="queue-item">
            <span className={`severity ${q.severity}`}>{q.severity}</span>
            <span className="count">{q.count} items</span>
          </div>
        ))}
      </div>
    </div>
  );
}
