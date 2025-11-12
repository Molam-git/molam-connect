// ============================================================================
// Brique 45 - Webhooks Industriels
// Ops Dashboard - React Component (Apple-inspired design)
// ============================================================================

import React, { useEffect, useState } from "react";

// ============================================================================
// Types
// ============================================================================
interface Endpoint {
  id: string;
  tenant_type: string;
  tenant_id: string;
  url: string;
  description: string;
  status: "active" | "paused" | "disabled";
  api_version: string;
  region: string;
  events: string[];
  created_at: string;
  updated_at: string;
}

interface Delivery {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: "pending" | "delivering" | "succeeded" | "failed" | "quarantined";
  attempts: number;
  last_code: number | null;
  last_error: string | null;
  url: string;
  type: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  pending: number;
  delivering: number;
  succeeded: number;
  failed: number;
  quarantined: number;
  dlq_count: number;
  success_rate: string;
}

// ============================================================================
// Props
// ============================================================================
interface WebhooksDashboardProps {
  apiUrl?: string;
  authToken: string;
  tenant: { type: string; id: string };
}

// ============================================================================
// Main Component
// ============================================================================
export default function WebhooksDashboard({
  apiUrl = "http://localhost:8045",
  authToken,
  tenant,
}: WebhooksDashboardProps) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // API Calls
  // ============================================================================
  const fetchEndpoints = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${apiUrl}/api/webhooks/endpoints?tenantType=${tenant.type}&tenantId=${tenant.id}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const data = await response.json();
      setEndpoints(data);
      setError(null);
    } catch (err: any) {
      setError("Failed to load endpoints");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      const response = await fetch(
        `${apiUrl}/api/ops/webhooks/deliveries?tenantType=${tenant.type}&tenantId=${tenant.id}&limit=50`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const data = await response.json();
      setDeliveries(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `${apiUrl}/api/ops/webhooks/stats?tenantType=${tenant.type}&tenantId=${tenant.id}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const rotateSecret = async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/webhooks/endpoints/${id}/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      alert("Secret rotated successfully. Check console for new secret.");
      fetchEndpoints();
    } catch (err: any) {
      console.error(err);
      alert("Failed to rotate secret");
    }
  };

  const pauseEndpoint = async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/webhooks/endpoints/${id}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "paused" }),
      });
      fetchEndpoints();
    } catch (err: any) {
      console.error(err);
    }
  };

  const activateEndpoint = async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/webhooks/endpoints/${id}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "active" }),
      });
      fetchEndpoints();
    } catch (err: any) {
      console.error(err);
    }
  };

  const retryDelivery = async (deliveryId: string) => {
    try {
      await fetch(`${apiUrl}/api/ops/webhooks/deliveries/${deliveryId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      fetchDeliveries();
    } catch (err: any) {
      console.error(err);
    }
  };

  const requeueDelivery = async (deliveryId: string) => {
    try {
      await fetch(`${apiUrl}/api/ops/webhooks/deliveries/${deliveryId}/requeue`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      fetchDeliveries();
    } catch (err: any) {
      console.error(err);
    }
  };

  // ============================================================================
  // Effects
  // ============================================================================
  useEffect(() => {
    fetchEndpoints();
    fetchDeliveries();
    fetchStats();

    const interval = setInterval(() => {
      fetchStats();
      fetchDeliveries();
    }, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [tenant]);

  // ============================================================================
  // Render Helpers
  // ============================================================================
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "succeeded":
        return "#34c759";
      case "paused":
      case "pending":
        return "#ff9500";
      case "disabled":
      case "failed":
        return "#ff3b30";
      case "delivering":
        return "#007aff";
      case "quarantined":
        return "#af52de";
      default:
        return "#8e8e93";
    }
  };

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Molam • Webhooks</h1>
          <p style={styles.subtitle}>Endpoints, signatures, retries, DLQ</p>
        </div>
        <div style={styles.badge}>Brique 45</div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      {/* Stats Cards */}
      {stats && (
        <section style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#34c759" }}>{stats.succeeded}</div>
            <div style={styles.statLabel}>Succeeded</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#ff9500" }}>{stats.pending}</div>
            <div style={styles.statLabel}>Pending</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#ff3b30" }}>{stats.failed}</div>
            <div style={styles.statLabel}>Failed</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#af52de" }}>{stats.dlq_count}</div>
            <div style={styles.statLabel}>DLQ</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: "#007aff" }}>{stats.success_rate}%</div>
            <div style={styles.statLabel}>Success Rate (24h)</div>
          </div>
        </section>
      )}

      {/* Endpoints Section */}
      <main style={styles.main}>
        <section>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Endpoints</h2>
            <button style={styles.refreshButton} onClick={fetchEndpoints}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : (
            <div style={styles.grid}>
              {endpoints.map((ep) => (
                <div key={ep.id} style={styles.endpointCard}>
                  <div style={styles.endpointHeader}>
                    <div>
                      <div style={styles.endpointUrl}>{ep.url}</div>
                      <div style={styles.endpointMeta}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: getStatusColor(ep.status),
                          }}
                        >
                          {ep.status}
                        </span>
                        <span style={styles.endpointVersion}>v{ep.api_version}</span>
                      </div>
                    </div>
                    <div style={styles.endpointActions}>
                      <button
                        style={styles.actionButton}
                        onClick={() => rotateSecret(ep.id)}
                        title="Rotate Secret"
                      >
                        🔄 Rotate
                      </button>
                      {ep.status === "active" ? (
                        <button
                          style={{ ...styles.actionButton, ...styles.pauseButton }}
                          onClick={() => pauseEndpoint(ep.id)}
                        >
                          ⏸ Pause
                        </button>
                      ) : (
                        <button
                          style={{ ...styles.actionButton, ...styles.activateButton }}
                          onClick={() => activateEndpoint(ep.id)}
                        >
                          ▶ Activate
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={styles.endpointEvents}>
                    <strong>Events:</strong> {ep.events?.filter(Boolean).join(", ") || "—"}
                  </div>
                </div>
              ))}

              {endpoints.length === 0 && (
                <div style={styles.emptyState}>No endpoints configured</div>
              )}
            </div>
          )}
        </section>

        {/* Deliveries Section */}
        <section style={{ marginTop: "40px" }}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Recent Deliveries</h2>
            <button style={styles.refreshButton} onClick={fetchDeliveries}>
              Refresh
            </button>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead style={styles.thead}>
                <tr>
                  <th style={styles.th}>Delivery</th>
                  <th style={styles.th}>Event</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Code</th>
                  <th style={styles.th}>Attempts</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} style={styles.tr}>
                    <td style={styles.td}>{d.id.slice(0, 8)}…</td>
                    <td style={styles.td}>{d.type}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadgeSmall,
                          backgroundColor: getStatusColor(d.status),
                        }}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td style={styles.td}>{d.last_code || "—"}</td>
                    <td style={styles.td}>{d.attempts}</td>
                    <td style={styles.td}>
                      {d.status === "failed" && (
                        <button
                          style={styles.retryButton}
                          onClick={() => retryDelivery(d.id)}
                        >
                          Retry
                        </button>
                      )}
                      {d.status === "quarantined" && (
                        <button
                          style={styles.requeueButton}
                          onClick={() => requeueDelivery(d.id)}
                        >
                          Requeue
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {deliveries.length === 0 && (
              <div style={styles.emptyState}>No recent deliveries</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// ============================================================================
// Styles (Apple-inspired)
// ============================================================================
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    minHeight: "100vh",
    backgroundColor: "#f5f5f7",
    color: "#1d1d1f",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "30px 40px",
    backgroundColor: "white",
    borderBottom: "1px solid #d2d2d7",
  },
  title: {
    fontSize: "32px",
    fontWeight: "600",
    margin: 0,
  },
  subtitle: {
    fontSize: "14px",
    color: "#86868b",
    margin: "4px 0 0 0",
  },
  badge: {
    backgroundColor: "#007aff",
    color: "white",
    padding: "6px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
  },
  error: {
    backgroundColor: "#ff3b30",
    color: "white",
    padding: "12px 40px",
    margin: "20px 40px",
    borderRadius: "8px",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "20px",
    padding: "30px 40px",
  },
  statCard: {
    backgroundColor: "white",
    padding: "24px",
    borderRadius: "12px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  statValue: {
    fontSize: "48px",
    fontWeight: "600",
    margin: 0,
  },
  statLabel: {
    fontSize: "13px",
    color: "#86868b",
    marginTop: "8px",
  },
  main: {
    padding: "0 40px 40px 40px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "24px",
    fontWeight: "600",
    margin: 0,
  },
  refreshButton: {
    backgroundColor: "#f5f5f7",
    color: "#007aff",
    border: "1px solid #007aff",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "20px",
  },
  endpointCard: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  endpointHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "12px",
  },
  endpointUrl: {
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "8px",
    wordBreak: "break-all",
  },
  endpointMeta: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  statusBadge: {
    color: "white",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  endpointVersion: {
    fontSize: "12px",
    color: "#86868b",
  },
  endpointActions: {
    display: "flex",
    gap: "8px",
  },
  actionButton: {
    backgroundColor: "#f5f5f7",
    color: "#1d1d1f",
    border: "1px solid #d2d2d7",
    padding: "6px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
  },
  pauseButton: {
    color: "#ff9500",
    borderColor: "#ff9500",
  },
  activateButton: {
    color: "#34c759",
    borderColor: "#34c759",
  },
  endpointEvents: {
    fontSize: "13px",
    color: "#86868b",
  },
  loading: {
    textAlign: "center",
    padding: "40px",
    color: "#86868b",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px",
    color: "#86868b",
    backgroundColor: "white",
    borderRadius: "12px",
  },
  tableContainer: {
    backgroundColor: "white",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thead: {
    backgroundColor: "#f5f5f7",
  },
  th: {
    padding: "12px 16px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: "600",
    color: "#86868b",
    textTransform: "uppercase",
  },
  tr: {
    borderBottom: "1px solid #f5f5f7",
  },
  td: {
    padding: "12px 16px",
    fontSize: "14px",
  },
  statusBadgeSmall: {
    color: "white",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "10px",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  retryButton: {
    backgroundColor: "#007aff",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
  },
  requeueButton: {
    backgroundColor: "#34c759",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
  },
};
