// Reconciliation Dashboard - Main Ops UI
import React, { useState, useEffect } from 'react';
import { ReconciliationStats } from './ReconciliationStats';
import { StatementLinesList } from './StatementLinesList';
import { ReconciliationQueue } from './ReconciliationQueue';

type Tab = 'lines' | 'queue' | 'stats';

export default function ReconciliationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/reco/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  return (
    <div className="reconciliation-dashboard">
      <header className="dashboard-header">
        <h1>Bank Statement Reconciliation</h1>
        {stats && (
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-label">Match Rate:</span>
              <span className="stat-value">{stats.lines.match_rate_pct}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Queue:</span>
              <span className="stat-value warn">
                {stats.lines.manual_review_count} pending
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unmatched:</span>
              <span className="stat-value error">
                {stats.lines.unmatched_count}
              </span>
            </div>
          </div>
        )}
      </header>

      <nav className="dashboard-tabs">
        <button
          className={activeTab === 'queue' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('queue')}
        >
          Review Queue
          {stats && stats.lines.manual_review_count > 0 && (
            <span className="badge">{stats.lines.manual_review_count}</span>
          )}
        </button>
        <button
          className={activeTab === 'lines' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('lines')}
        >
          All Lines
        </button>
        <button
          className={activeTab === 'stats' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
        </button>
      </nav>

      <main className="dashboard-content">
        {activeTab === 'queue' && <ReconciliationQueue onUpdate={fetchStats} />}
        {activeTab === 'lines' && <StatementLinesList />}
        {activeTab === 'stats' && <ReconciliationStats stats={stats} />}
      </main>

      <style jsx>{`
        .reconciliation-dashboard {
          min-height: 100vh;
          background: #f5f7fa;
        }

        .dashboard-header {
          background: white;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e1e8ed;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .dashboard-header h1 {
          margin: 0;
          font-size: 1.75rem;
          color: #1a202c;
        }

        .stats-summary {
          display: flex;
          gap: 2rem;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .stat-label {
          font-size: 0.75rem;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: #2d3748;
        }

        .stat-value.warn {
          color: #d69e2e;
        }

        .stat-value.error {
          color: #e53e3e;
        }

        .dashboard-tabs {
          background: white;
          display: flex;
          gap: 0;
          border-bottom: 2px solid #e1e8ed;
        }

        .tab {
          background: none;
          border: none;
          padding: 1rem 2rem;
          font-size: 1rem;
          color: #718096;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tab:hover {
          color: #2d3748;
          background: #f7fafc;
        }

        .tab.active {
          color: #3182ce;
          font-weight: 600;
        }

        .tab.active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 2px;
          background: #3182ce;
        }

        .badge {
          background: #e53e3e;
          color: white;
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          border-radius: 1rem;
          font-weight: 600;
        }

        .dashboard-content {
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}
