// ============================================================================
// Brique 44 - Anti-fraude Temps Réel
// Ops Dashboard - React Component
// ============================================================================

import React, { useState, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================
interface Review {
  id: string;
  decision_id: string;
  txn_id: string;
  user_id: string;
  merchant_id: string;
  score: number;
  sira_score: number;
  confidence: number;
  reason: any;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "resolved";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface BlacklistEntry {
  id: string;
  list_type: string;
  value: string;
  reason: string;
  severity: "low" | "medium" | "high" | "critical";
  expires_at: string | null;
  added_by: string;
  created_at: string;
}

interface Stats {
  pending: number;
  in_progress: number;
  resolved: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
}

// ============================================================================
// Props
// ============================================================================
interface FraudDashboardProps {
  apiUrl?: string;
  authToken: string;
}

// ============================================================================
// Main Component
// ============================================================================
export const FraudDashboard: React.FC<FraudDashboardProps> = ({
  apiUrl = "http://localhost:8044",
  authToken,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "reviews" | "blacklist">("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [reviewModal, setReviewModal] = useState<Review | null>(null);
  const [blacklistModal, setBlacklistModal] = useState(false);

  // ============================================================================
  // API Calls
  // ============================================================================
  const fetchStats = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/fraud/reviews/stats`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/fraud/reviews?status=pending&limit=100`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      setReviews(data.reviews);
      setError(null);
    } catch (err: any) {
      setError("Failed to load reviews");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBlacklist = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/fraud/blacklist?limit=100`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      setBlacklist(data.blacklist);
      setError(null);
    } catch (err: any) {
      setError("Failed to load blacklist");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const assignReview = async (reviewId: string) => {
    try {
      await fetch(`${apiUrl}/api/fraud/reviews/${reviewId}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      fetchReviews();
      fetchStats();
    } catch (err: any) {
      console.error("Failed to assign review:", err);
    }
  };

  const decideReview = async (reviewId: string, decision: "allow" | "block", notes?: string) => {
    try {
      await fetch(`${apiUrl}/api/fraud/reviews/${reviewId}/decide`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision, notes }),
      });
      setReviewModal(null);
      fetchReviews();
      fetchStats();
    } catch (err: any) {
      console.error("Failed to decide review:", err);
    }
  };

  const addToBlacklist = async (data: {
    list_type: string;
    value: string;
    reason: string;
    severity: string;
  }) => {
    try {
      await fetch(`${apiUrl}/api/fraud/blacklist`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      setBlacklistModal(false);
      fetchBlacklist();
    } catch (err: any) {
      console.error("Failed to add to blacklist:", err);
    }
  };

  const removeFromBlacklist = async (id: string) => {
    if (!confirm("Remove this entry from blacklist?")) return;

    try {
      await fetch(`${apiUrl}/api/fraud/blacklist/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      fetchBlacklist();
    } catch (err: any) {
      console.error("Failed to remove from blacklist:", err);
    }
  };

  // ============================================================================
  // Effects
  // ============================================================================
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "reviews") fetchReviews();
    if (activeTab === "blacklist") fetchBlacklist();
  }, [activeTab]);

  // ============================================================================
  // Render Helpers
  // ============================================================================
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "#ff3b30";
      case "medium":
        return "#ff9500";
      case "low":
        return "#34c759";
      default:
        return "#8e8e93";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "#ff3b30";
      case "high":
        return "#ff9500";
      case "medium":
        return "#ffcc00";
      case "low":
        return "#34c759";
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
      <div style={styles.header}>
        <h1 style={styles.title}>Fraud Detection Dashboard</h1>
        <div style={styles.badge}>Brique 44</div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === "overview" ? styles.tabActive : {}) }}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === "reviews" ? styles.tabActive : {}) }}
          onClick={() => setActiveTab("reviews")}
        >
          Review Queue
          {stats && stats.pending > 0 && (
            <span style={styles.tabBadge}>{stats.pending}</span>
          )}
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === "blacklist" ? styles.tabActive : {}) }}
          onClick={() => setActiveTab("blacklist")}
        >
          Blacklist
        </button>
      </div>

      {/* Content */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div style={styles.content}>
          <h2 style={styles.subtitle}>Review Queue Statistics (24h)</h2>
          {stats && (
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{stats.pending}</div>
                <div style={styles.statLabel}>Pending</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{stats.in_progress}</div>
                <div style={styles.statLabel}>In Progress</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{stats.resolved}</div>
                <div style={styles.statLabel}>Resolved</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: "#ff3b30" }}>{stats.high_priority}</div>
                <div style={styles.statLabel}>High Priority</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews Tab */}
      {activeTab === "reviews" && (
        <div style={styles.content}>
          <div style={styles.contentHeader}>
            <h2 style={styles.subtitle}>Pending Reviews</h2>
            <button style={styles.refreshButton} onClick={fetchReviews}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : (
            <div style={styles.table}>
              {reviews.map((review) => (
                <div key={review.id} style={styles.reviewCard}>
                  <div style={styles.reviewHeader}>
                    <div>
                      <span
                        style={{
                          ...styles.priorityBadge,
                          backgroundColor: getPriorityColor(review.priority),
                        }}
                      >
                        {review.priority.toUpperCase()}
                      </span>
                      <span style={styles.reviewTxn}>TXN: {review.txn_id.slice(0, 8)}</span>
                    </div>
                    <div style={styles.reviewScore}>
                      Score: <strong>{review.score}</strong> | SIRA: <strong>{review.sira_score}</strong>
                    </div>
                  </div>

                  <div style={styles.reviewBody}>
                    <div style={styles.reviewInfo}>
                      <div>User: {review.user_id.slice(0, 8)}</div>
                      <div>Merchant: {review.merchant_id.slice(0, 8)}</div>
                      <div>Confidence: {(review.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div style={styles.reviewActions}>
                      {!review.assigned_to ? (
                        <button
                          style={styles.assignButton}
                          onClick={() => assignReview(review.id)}
                        >
                          Assign to Me
                        </button>
                      ) : (
                        <button
                          style={styles.reviewButton}
                          onClick={() => setReviewModal(review)}
                        >
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {reviews.length === 0 && (
                <div style={styles.emptyState}>No pending reviews</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Blacklist Tab */}
      {activeTab === "blacklist" && (
        <div style={styles.content}>
          <div style={styles.contentHeader}>
            <h2 style={styles.subtitle}>Blacklist Entries</h2>
            <button style={styles.addButton} onClick={() => setBlacklistModal(true)}>
              + Add Entry
            </button>
          </div>

          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : (
            <div style={styles.table}>
              {blacklist.map((entry) => (
                <div key={entry.id} style={styles.blacklistCard}>
                  <div style={styles.blacklistHeader}>
                    <div>
                      <span
                        style={{
                          ...styles.severityBadge,
                          backgroundColor: getSeverityColor(entry.severity),
                        }}
                      >
                        {entry.severity.toUpperCase()}
                      </span>
                      <span style={styles.blacklistType}>{entry.list_type}</span>
                    </div>
                    <button
                      style={styles.removeButton}
                      onClick={() => removeFromBlacklist(entry.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={styles.blacklistBody}>
                    <div style={styles.blacklistValue}>{entry.value}</div>
                    <div style={styles.blacklistReason}>{entry.reason}</div>
                    <div style={styles.blacklistMeta}>
                      Added: {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}

              {blacklist.length === 0 && (
                <div style={styles.emptyState}>No blacklist entries</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div style={styles.modal} onClick={() => setReviewModal(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Review Transaction</h3>
            <div style={styles.modalBody}>
              <div>Transaction ID: {reviewModal.txn_id}</div>
              <div>Score: {reviewModal.score}</div>
              <div>SIRA Score: {reviewModal.sira_score}</div>
              <div>Reasons: {JSON.stringify(reviewModal.reason)}</div>
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.allowButton}
                onClick={() => decideReview(reviewModal.id, "allow")}
              >
                Allow
              </button>
              <button
                style={styles.blockButton}
                onClick={() => decideReview(reviewModal.id, "block")}
              >
                Block
              </button>
              <button style={styles.cancelButton} onClick={() => setReviewModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Styles (Apple-inspired)
// ============================================================================
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
    backgroundColor: "#f5f5f7",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
  },
  title: {
    fontSize: "32px",
    fontWeight: "600",
    color: "#1d1d1f",
  },
  badge: {
    backgroundColor: "#007aff",
    color: "white",
    padding: "6px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "600",
  },
  tabs: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
    borderBottom: "1px solid #d2d2d7",
  },
  tab: {
    padding: "12px 20px",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#86868b",
    position: "relative",
  },
  tabActive: {
    color: "#007aff",
    borderBottom: "2px solid #007aff",
  },
  tabBadge: {
    backgroundColor: "#ff3b30",
    color: "white",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "10px",
    marginLeft: "8px",
  },
  content: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "20px",
    minHeight: "400px",
  },
  contentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  subtitle: {
    fontSize: "24px",
    fontWeight: "600",
    color: "#1d1d1f",
    margin: "0 0 20px 0",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px",
  },
  statCard: {
    backgroundColor: "#f5f5f7",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
  },
  statValue: {
    fontSize: "48px",
    fontWeight: "600",
    color: "#007aff",
  },
  statLabel: {
    fontSize: "14px",
    color: "#86868b",
    marginTop: "8px",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  reviewCard: {
    border: "1px solid #d2d2d7",
    borderRadius: "12px",
    padding: "16px",
  },
  reviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  priorityBadge: {
    color: "white",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
    marginRight: "8px",
  },
  reviewTxn: {
    fontSize: "14px",
    color: "#86868b",
  },
  reviewScore: {
    fontSize: "14px",
    color: "#1d1d1f",
  },
  reviewBody: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewInfo: {
    fontSize: "13px",
    color: "#86868b",
  },
  reviewActions: {
    display: "flex",
    gap: "8px",
  },
  assignButton: {
    backgroundColor: "#007aff",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  reviewButton: {
    backgroundColor: "#34c759",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
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
  addButton: {
    backgroundColor: "#34c759",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  blacklistCard: {
    border: "1px solid #d2d2d7",
    borderRadius: "12px",
    padding: "16px",
  },
  blacklistHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  severityBadge: {
    color: "white",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "600",
    marginRight: "8px",
  },
  blacklistType: {
    fontSize: "14px",
    color: "#86868b",
    textTransform: "uppercase",
  },
  blacklistBody: {
    fontSize: "13px",
  },
  blacklistValue: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#1d1d1f",
    marginBottom: "8px",
  },
  blacklistReason: {
    color: "#86868b",
    marginBottom: "8px",
  },
  blacklistMeta: {
    color: "#86868b",
    fontSize: "12px",
  },
  removeButton: {
    backgroundColor: "#ff3b30",
    color: "white",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
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
  },
  error: {
    backgroundColor: "#ff3b30",
    color: "white",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "24px",
    minWidth: "500px",
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: "600",
    marginBottom: "16px",
  },
  modalBody: {
    marginBottom: "20px",
    fontSize: "14px",
    color: "#1d1d1f",
  },
  modalActions: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
  },
  allowButton: {
    backgroundColor: "#34c759",
    color: "white",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  blockButton: {
    backgroundColor: "#ff3b30",
    color: "white",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  cancelButton: {
    backgroundColor: "#f5f5f7",
    color: "#1d1d1f",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
};

export default FraudDashboard;
