/**
 * Brique 84 — Payouts Engine
 * Ops Workbench Component
 *
 * Features:
 * - Real-time payout monitoring
 * - Alert management
 * - Manual interventions (retry, cancel)
 * - Connector health monitoring
 * - Statistics and charts
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// =====================================================================
// TYPES
// =====================================================================

interface Payout {
  id: string;
  external_id: string | null;
  origin_module: string;
  beneficiary_id: string;
  amount: number;
  currency: string;
  status: string;
  priority: string;
  bank_reference: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  sla_violated: boolean;
  sla_target_settlement_date: string | null;
  created_at: string;
  settled_at: string | null;
}

interface Alert {
  id: string;
  payout_id: string | null;
  alert_type: string;
  severity: string;
  message: string;
  details: any;
  resolved: boolean;
  created_at: string;
}

interface ConnectorHealth {
  connectorId: string;
  rail: string;
  healthy: boolean;
  message?: string;
}

interface Stats {
  total_payouts: number;
  total_amount: number;
  pending_count: number;
  processing_count: number;
  sent_count: number;
  settled_count: number;
  failed_count: number;
  dlq_count: number;
  settled_amount: number;
  avg_settlement_hours: number;
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================

export const PayoutsOpsWorkbench: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payouts' | 'alerts' | 'connectors'>('overview');
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [connectorHealth, setConnectorHealth] = useState<Record<string, ConnectorHealth>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch data on mount and every 30 seconds if auto-refresh is enabled
  useEffect(() => {
    fetchAllData();

    if (autoRefresh) {
      const interval = setInterval(fetchAllData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchAllData = async () => {
    await Promise.all([
      fetchPayouts(),
      fetchAlerts(),
      fetchConnectorHealth(),
      fetchStats()
    ]);
  };

  const fetchPayouts = async () => {
    try {
      const response = await axios.get('/api/payouts', {
        params: {
          status: filterStatus === 'all' ? undefined : filterStatus,
          limit: 100
        }
      });
      setPayouts(response.data.payouts);
    } catch (error) {
      console.error('Failed to fetch payouts:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await axios.get('/api/payouts/ops/alerts');
      setAlerts(response.data.alerts);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  const fetchConnectorHealth = async () => {
    try {
      const response = await axios.get('/api/payouts/connectors/health');
      setConnectorHealth(response.data.connectors);
    } catch (error) {
      console.error('Failed to fetch connector health:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/payouts/stats/summary');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleRetryPayout = async (payoutId: string) => {
    if (!confirm('Are you sure you want to retry this payout?')) return;

    setLoading(true);
    try {
      await axios.post(`/api/payouts/${payoutId}/retry`);
      alert('Payout retry scheduled successfully');
      await fetchPayouts();
    } catch (error: any) {
      alert(`Failed to retry payout: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPayout = async (payoutId: string) => {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    setLoading(true);
    try {
      await axios.post(`/api/payouts/${payoutId}/cancel`, { reason });
      alert('Payout cancelled successfully');
      await fetchPayouts();
    } catch (error: any) {
      alert(`Failed to cancel payout: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    const resolution_note = prompt('Enter resolution note:');
    if (!resolution_note) return;

    setLoading(true);
    try {
      await axios.post(`/api/payouts/ops/alerts/${alertId}/resolve`, { resolution_note });
      alert('Alert resolved successfully');
      await fetchAlerts();
    } catch (error: any) {
      alert(`Failed to resolve alert: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>💸 Payouts Ops Workbench</h1>
        <div style={styles.headerActions}>
          <label style={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button onClick={fetchAllData} style={styles.refreshButton}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['overview', 'payouts', 'alerts', 'connectors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {})
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            alerts={alerts}
            connectorHealth={connectorHealth}
          />
        )}

        {activeTab === 'payouts' && (
          <PayoutsTab
            payouts={payouts}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            onRetry={handleRetryPayout}
            onCancel={handleCancelPayout}
            loading={loading}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsTab
            alerts={alerts}
            onResolve={handleResolveAlert}
            loading={loading}
          />
        )}

        {activeTab === 'connectors' && (
          <ConnectorsTab connectorHealth={connectorHealth} />
        )}
      </div>
    </div>
  );
};

// =====================================================================
// TAB COMPONENTS
// =====================================================================

const OverviewTab: React.FC<{
  stats: Stats | null;
  alerts: Alert[];
  connectorHealth: Record<string, ConnectorHealth>;
}> = ({ stats, alerts, connectorHealth }) => {
  const unresolvedAlerts = alerts.filter(a => !a.resolved);
  const criticalAlerts = unresolvedAlerts.filter(a => a.severity === 'critical');
  const unhealthyConnectors = Object.values(connectorHealth).filter(c => !c.healthy);

  return (
    <div>
      {/* Summary Cards */}
      <div style={styles.cardGrid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Total Payouts (30d)</div>
          <div style={styles.cardValue}>{stats?.total_payouts?.toLocaleString() || '0'}</div>
          <div style={styles.cardSubtitle}>{stats?.total_amount?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || '$0'}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Settled</div>
          <div style={{...styles.cardValue, color: '#10b981'}}>{stats?.settled_count || 0}</div>
          <div style={styles.cardSubtitle}>{stats?.settled_amount?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || '$0'}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Pending</div>
          <div style={{...styles.cardValue, color: '#f59e0b'}}>{stats?.pending_count || 0}</div>
          <div style={styles.cardSubtitle}>Processing: {stats?.processing_count || 0}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Failed / DLQ</div>
          <div style={{...styles.cardValue, color: '#ef4444'}}>{(stats?.failed_count || 0) + (stats?.dlq_count || 0)}</div>
          <div style={styles.cardSubtitle}>DLQ: {stats?.dlq_count || 0}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Avg Settlement Time</div>
          <div style={styles.cardValue}>{stats?.avg_settlement_hours?.toFixed(1) || '0'}<span style={{fontSize: '24px'}}>h</span></div>
          <div style={styles.cardSubtitle}>Measured from creation</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Active Alerts</div>
          <div style={{...styles.cardValue, color: criticalAlerts.length > 0 ? '#ef4444' : '#f59e0b'}}>
            {unresolvedAlerts.length}
          </div>
          <div style={styles.cardSubtitle}>Critical: {criticalAlerts.length}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Connector Health</div>
          <div style={{...styles.cardValue, color: unhealthyConnectors.length > 0 ? '#ef4444' : '#10b981'}}>
            {Object.keys(connectorHealth).length - unhealthyConnectors.length}/{Object.keys(connectorHealth).length}
          </div>
          <div style={styles.cardSubtitle}>
            {unhealthyConnectors.length > 0 ? `${unhealthyConnectors.length} unhealthy` : 'All healthy'}
          </div>
        </div>
      </div>

      {/* Recent Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🚨 Critical Alerts</h2>
          {criticalAlerts.slice(0, 5).map((alert) => (
            <div key={alert.id} style={{...styles.alertItem, borderLeft: '4px solid #ef4444'}}>
              <div style={styles.alertMessage}>{alert.message}</div>
              <div style={styles.alertMeta}>
                {alert.alert_type} • {new Date(alert.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PayoutsTab: React.FC<{
  payouts: Payout[];
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  loading: boolean;
}> = ({ payouts, filterStatus, setFilterStatus, onRetry, onCancel, loading }) => {
  return (
    <div>
      {/* Filter */}
      <div style={styles.filterBar}>
        <label>Filter by status:</label>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={styles.select}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="settled">Settled</option>
          <option value="failed">Failed</option>
          <option value="dlq">DLQ</option>
        </select>
      </div>

      {/* Payouts Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Amount</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Priority</th>
              <th style={styles.th}>Origin</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Retries</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((payout) => (
              <tr key={payout.id} style={styles.tr}>
                <td style={styles.td}>
                  <div style={styles.payoutId}>{payout.id.substring(0, 8)}...</div>
                  {payout.external_id && <div style={styles.idempotencyKey}>🔑 {payout.external_id}</div>}
                </td>
                <td style={styles.td}>
                  <div style={styles.amount}>{payout.currency} {payout.amount.toLocaleString()}</div>
                  {payout.bank_reference && <div style={styles.bankRef}>Ref: {payout.bank_reference}</div>}
                </td>
                <td style={styles.td}>
                  <span style={getStatusBadgeStyle(payout.status)}>{payout.status}</span>
                  {payout.sla_violated && <div style={styles.slaViolated}>⚠️ SLA violated</div>}
                </td>
                <td style={styles.td}>
                  <span style={getPriorityBadgeStyle(payout.priority)}>{payout.priority}</span>
                </td>
                <td style={styles.td}>{payout.origin_module}</td>
                <td style={styles.td}>{new Date(payout.created_at).toLocaleString()}</td>
                <td style={styles.td}>
                  <div>{payout.retry_count} / {payout.max_retries}</div>
                  {payout.last_error && <div style={styles.error} title={payout.last_error}>Error</div>}
                </td>
                <td style={styles.td}>
                  {payout.status === 'failed' || payout.status === 'dlq' ? (
                    <button
                      onClick={() => onRetry(payout.id)}
                      style={styles.actionButton}
                      disabled={loading}
                    >
                      🔄 Retry
                    </button>
                  ) : null}
                  {payout.status === 'pending' || payout.status === 'scheduled' ? (
                    <button
                      onClick={() => onCancel(payout.id)}
                      style={{...styles.actionButton, background: '#ef4444'}}
                      disabled={loading}
                    >
                      ✖️ Cancel
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AlertsTab: React.FC<{
  alerts: Alert[];
  onResolve: (id: string) => void;
  loading: boolean;
}> = ({ alerts, onResolve, loading }) => {
  return (
    <div>
      <h2 style={styles.sectionTitle}>Active Alerts</h2>
      {alerts.filter(a => !a.resolved).map((alert) => (
        <div key={alert.id} style={{...styles.alertItem, borderLeft: `4px solid ${getSeverityColor(alert.severity)}`}}>
          <div style={styles.alertHeader}>
            <span style={{...styles.severityBadge, background: getSeverityColor(alert.severity)}}>{alert.severity}</span>
            <span style={styles.alertType}>{alert.alert_type}</span>
            <button
              onClick={() => onResolve(alert.id)}
              style={styles.resolveButton}
              disabled={loading}
            >
              ✓ Resolve
            </button>
          </div>
          <div style={styles.alertMessage}>{alert.message}</div>
          <div style={styles.alertMeta}>{new Date(alert.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
};

const ConnectorsTab: React.FC<{
  connectorHealth: Record<string, ConnectorHealth>;
}> = ({ connectorHealth }) => {
  return (
    <div>
      <h2 style={styles.sectionTitle}>Bank Connector Health</h2>
      <div style={styles.cardGrid}>
        {Object.entries(connectorHealth).map(([key, connector]) => (
          <div key={key} style={styles.card}>
            <div style={styles.cardTitle}>{key}</div>
            <div style={{
              ...styles.cardValue,
              color: connector.healthy ? '#10b981' : '#ef4444'
            }}>
              {connector.healthy ? '✓ Healthy' : '✗ Unhealthy'}
            </div>
            {connector.message && <div style={styles.cardSubtitle}>{connector.message}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

function getStatusBadgeStyle(status: string): React.CSSProperties {
  const colorMap: Record<string, string> = {
    pending: '#f59e0b',
    scheduled: '#3b82f6',
    processing: '#8b5cf6',
    sent: '#06b6d4',
    settled: '#10b981',
    failed: '#ef4444',
    reversed: '#6b7280',
    dlq: '#dc2626'
  };

  return {
    padding: '4px 8px',
    borderRadius: '4px',
    background: colorMap[status] || '#6b7280',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600
  };
}

function getPriorityBadgeStyle(priority: string): React.CSSProperties {
  const colorMap: Record<string, string> = {
    batch: '#6b7280',
    standard: '#3b82f6',
    instant: '#8b5cf6',
    priority: '#ef4444'
  };

  return {
    padding: '4px 8px',
    borderRadius: '4px',
    background: colorMap[priority] || '#6b7280',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600
  };
}

function getSeverityColor(severity: string): string {
  const colorMap: Record<string, string> = {
    low: '#3b82f6',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444'
  };
  return colorMap[severity] || '#6b7280';
}

// =====================================================================
// STYLES
// =====================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
    background: '#f9fafb'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center'
  },
  autoRefreshLabel: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  refreshButton: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb'
  },
  tab: {
    padding: '12px 24px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 500,
    color: '#6b7280',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px'
  },
  tabActive: {
    color: '#3b82f6',
    borderBottomColor: '#3b82f6'
  },
  content: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  card: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
  },
  cardTitle: {
    fontSize: '14px',
    opacity: 0.9,
    marginBottom: '8px'
  },
  cardValue: {
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '4px'
  },
  cardSubtitle: {
    fontSize: '12px',
    opacity: 0.8
  },
  section: {
    marginTop: '24px'
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '16px'
  },
  filterBar: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '16px'
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    color: '#6b7280',
    fontSize: '14px'
  },
  tr: {
    borderBottom: '1px solid #e5e7eb'
  },
  td: {
    padding: '12px',
    fontSize: '14px'
  },
  payoutId: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#6b7280'
  },
  idempotencyKey: {
    fontSize: '11px',
    color: '#3b82f6',
    marginTop: '4px'
  },
  amount: {
    fontWeight: 600
  },
  bankRef: {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '4px'
  },
  slaViolated: {
    fontSize: '11px',
    color: '#ef4444',
    marginTop: '4px'
  },
  error: {
    fontSize: '11px',
    color: '#ef4444',
    marginTop: '4px',
    cursor: 'help'
  },
  actionButton: {
    padding: '6px 12px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    marginRight: '4px'
  },
  alertItem: {
    background: '#f9fafb',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  alertHeader: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px'
  },
  severityBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600
  },
  alertType: {
    fontSize: '12px',
    color: '#6b7280',
    textTransform: 'uppercase'
  },
  resolveButton: {
    marginLeft: 'auto',
    padding: '6px 12px',
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600
  },
  alertMessage: {
    fontSize: '14px',
    marginBottom: '8px'
  },
  alertMeta: {
    fontSize: '12px',
    color: '#6b7280'
  }
};

export default PayoutsOpsWorkbench;
