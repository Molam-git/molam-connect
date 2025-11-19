// ============================================================================
// Balance Widget - Mobile (React Native)
// ============================================================================

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
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

      setBalance(
        response.data.balance || {
          total_balance: 0,
          available_balance: 0,
          reserved_balance: 0,
          currency,
        }
      );
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
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading balance...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchBalance}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Treasury Balance</Text>
        <TouchableOpacity onPress={fetchBalance}>
          <Text style={styles.refreshIcon}>🔄</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.label}>Total Balance</Text>
        <Text style={styles.amount}>
          {formatCurrency(balance?.total_balance || 0)}
        </Text>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.label}>Available</Text>
        <Text style={[styles.amount, styles.availableAmount]}>
          {formatCurrency(balance?.available_balance || 0)}
        </Text>
      </View>

      <View style={styles.balanceRow}>
        <Text style={styles.label}>Reserved</Text>
        <Text style={[styles.amount, styles.reservedAmount]}>
          {formatCurrency(balance?.reserved_balance || 0)}
        </Text>
      </View>

      {lastUpdated ? (
        <Text style={styles.footer}>Last updated: {formatTime(lastUpdated)}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    minWidth: 300,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  refreshIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
  },
  availableAmount: {
    color: "#10b981",
  },
  reservedAmount: {
    color: "#f59e0b",
  },
  footer: {
    marginTop: 12,
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "right",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#3b82f6",
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
