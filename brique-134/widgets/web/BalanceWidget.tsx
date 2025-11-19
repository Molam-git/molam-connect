// ============================================================================
// Balance Widget - Web (React)
// ============================================================================

import React, { useState, useEffect } from "react";
import axios from "axios";

interface BalanceWidgetProps {
  currency?: string;
  refreshInterval?: number;
  apiUrl?: string;
  token: string;
}

interface BalanceData {
  total_balance: number;
  available_balance: number;
  reserved_balance: number;
  currency: string;
}

export const BalanceWidget: React.FC<BalanceWidgetProps> = ({
  currency = "USD",
  refreshInterval = 30000,
  apiUrl = "https://api.molam.com",
  token,
}) => {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalance = async () => {
    try {
      setError("");
      const response = await axios.get(
        `${apiUrl}/api/metrics/summary?currency=${currency}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setBalance(response.data.balance || {
        total_balance: 0,
        available_balance: 0,
        reserved_balance: 0,
        currency,
      });
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch balance");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();

    const interval = setInterval(fetchBalance, refreshInterval);

    return () => clearInterval(interval);
  }, [currency, refreshInterval]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: balance?.currency || currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeleton}>
          <div style={styles.skeletonLine}></div>
          <div style={styles.skeletonLine}></div>
          <div style={styles.skeletonLine}></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...styles.container, ...styles.errorContainer }}>
        <div style={styles.errorIcon}>⚠️</div>
        <div style={styles.errorText}>{error}</div>
        <button onClick={fetchBalance} style={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Treasury Balance</h3>
        <button onClick={fetchBalance} style={styles.refreshButton}>
          🔄
        </button>
      </div>

      <div style={styles.balanceRow}>
        <span style={styles.label}>Total Balance</span>
        <span style={styles.amount}>
          {formatCurrency(balance?.total_balance || 0)}
        </span>
      </div>

      <div style={styles.balanceRow}>
        <span style={styles.label}>Available</span>
        <span style={{ ...styles.amount, ...styles.availableAmount }}>
          {formatCurrency(balance?.available_balance || 0)}
        </span>
      </div>

      <div style={styles.balanceRow}>
        <span style={styles.label}>Reserved</span>
        <span style={{ ...styles.amount, ...styles.reservedAmount }}>
          {formatCurrency(balance?.reserved_balance || 0)}
        </span>
      </div>

      {lastUpdated && (
        <div style={styles.footer}>
          Last updated: {formatTime(lastUpdated)}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    minWidth: "300px",
    maxWidth: "400px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 700,
    color: "#1f2937",
  },
  refreshButton: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px",
    opacity: 0.6,
    transition: "opacity 0.2s",
  },
  balanceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #f3f4f6",
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#6b7280",
  },
  amount: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#1f2937",
  },
  availableAmount: {
    color: "#10b981",
  },
  reservedAmount: {
    color: "#f59e0b",
  },
  footer: {
    marginTop: "12px",
    fontSize: "12px",
    color: "#9ca3af",
    textAlign: "right",
  },
  skeleton: {
    padding: "8px 0",
  },
  skeletonLine: {
    height: "24px",
    backgroundColor: "#e5e7eb",
    borderRadius: "4px",
    marginBottom: "12px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  errorContainer: {
    textAlign: "center",
    padding: "32px 20px",
  },
  errorIcon: {
    fontSize: "48px",
    marginBottom: "12px",
  },
  errorText: {
    fontSize: "14px",
    color: "#dc2626",
    marginBottom: "16px",
  },
  retryButton: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
