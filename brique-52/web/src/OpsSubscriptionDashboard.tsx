/**
 * Ops Subscription Dashboard
 * Analytics and metrics view
 */
import React, { useEffect, useState } from "react";

interface Metrics {
  mrr: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  churn_rate: number;
  failed_payments: number;
}

export default function OpsSubscriptionDashboard() {
  const [metrics, setMetrics] = useState<Metrics>({
    mrr: 0,
    active_subscriptions: 0,
    trial_subscriptions: 0,
    churn_rate: 0,
    failed_payments: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      // Mock data - in production, fetch from API
      setMetrics({
        mrr: 125_450.0,
        active_subscriptions: 1234,
        trial_subscriptions: 89,
        churn_rate: 2.3,
        failed_payments: 23,
      });
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({
    title,
    value,
    subtitle,
    trend,
    color = "blue",
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: string;
    color?: string;
  }) => {
    const colorClasses = {
      blue: "from-blue-500 to-blue-600",
      green: "from-green-500 to-green-600",
      purple: "from-purple-500 to-purple-600",
      orange: "from-orange-500 to-orange-600",
      red: "from-red-500 to-red-600",
    };

    return (
      <div
        className={`bg-gradient-to-br ${
          colorClasses[color as keyof typeof colorClasses] || colorClasses.blue
        } rounded-2xl p-6 text-white shadow-lg`}
      >
        <div className="text-sm font-medium opacity-90 mb-2">{title}</div>
        <div className="text-4xl font-bold mb-1">{value}</div>
        {subtitle && <div className="text-sm opacity-75">{subtitle}</div>}
        {trend && <div className="text-xs opacity-90 mt-2">{trend}</div>}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-semibold text-gray-900 mb-2">
          Subscription Analytics
        </h1>
        <p className="text-gray-600">Overview of recurring revenue and subscription health</p>
      </div>

      {/* Metrics Grid */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading metrics...</div>
        ) : (
          <>
            {/* Primary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Monthly Recurring Revenue"
                value={`$${(metrics.mrr / 1000).toFixed(1)}k`}
                subtitle="USD"
                trend="↑ 12.5% vs last month"
                color="blue"
              />
              <MetricCard
                title="Active Subscriptions"
                value={metrics.active_subscriptions.toLocaleString()}
                trend="↑ 8.3% vs last month"
                color="green"
              />
              <MetricCard
                title="Trial Subscriptions"
                value={metrics.trial_subscriptions}
                subtitle="Converting to paid"
                color="purple"
              />
              <MetricCard
                title="Churn Rate"
                value={`${metrics.churn_rate}%`}
                trend="↓ 0.5% vs last month"
                color="orange"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Failed Payments</h3>
                <div className="text-3xl font-bold text-red-600 mb-2">
                  {metrics.failed_payments}
                </div>
                <p className="text-sm text-gray-600">Requires dunning retry</p>
                <button className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                  View Queue
                </button>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Average Revenue Per User
                </h3>
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  $
                  {metrics.active_subscriptions > 0
                    ? (metrics.mrr / metrics.active_subscriptions).toFixed(2)
                    : "0.00"}
                </div>
                <p className="text-sm text-gray-600">Per subscription</p>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Customer Lifetime Value
                </h3>
                <div className="text-3xl font-bold text-gray-900 mb-2">$3,245</div>
                <p className="text-sm text-gray-600">Average LTV</p>
              </div>
            </div>

            {/* Charts Section */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">MRR Growth</h3>
              <div className="h-64 flex items-center justify-center text-gray-400">
                <div>Chart placeholder - integrate Chart.js or similar</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
