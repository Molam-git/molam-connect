/**
 * Merchant Subscriptions Dashboard
 * Apple-inspired design
 */
import React, { useEffect, useState } from "react";

interface Subscription {
  id: string;
  customer_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  billing_currency: string;
  items?: Array<{
    plan_name: string;
    quantity: number;
    unit_amount: number;
  }>;
}

export default function MerchantSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchSubscriptions();
  }, [filter]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const merchantId = "current"; // Get from auth context
      const url =
        filter === "all"
          ? `/api/merchant/${merchantId}/subscriptions`
          : `/api/merchant/${merchantId}/subscriptions?status=${filter}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();
      setSubscriptions(data.data || []);
    } catch (err) {
      console.error("Failed to fetch subscriptions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string, cancelAtPeriodEnd: boolean) => {
    if (!confirm("Are you sure you want to cancel this subscription?")) return;

    try {
      await fetch(`/api/subscriptions/${id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ cancel_at_period_end: cancelAtPeriodEnd }),
      });

      fetchSubscriptions();
    } catch (err) {
      console.error("Failed to cancel subscription:", err);
      alert("Failed to cancel subscription");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "trialing":
        return "bg-blue-100 text-blue-800";
      case "past_due":
        return "bg-red-100 text-red-800";
      case "canceled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-semibold text-gray-900 mb-2">Subscriptions</h1>
        <p className="text-gray-600">Manage your recurring revenue</p>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm w-fit">
          {["all", "active", "trialing", "past_due", "canceled"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                filter === tab
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading subscriptions...</div>
          ) : subscriptions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No subscriptions found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Current Period
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {sub.customer_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {sub.items?.[0]?.plan_name || "N/A"}
                      </div>
                      {sub.items && sub.items.length > 1 && (
                        <div className="text-xs text-gray-500">+{sub.items.length - 1} more</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          sub.status
                        )}`}
                      >
                        {sub.status}
                      </span>
                      {sub.cancel_at_period_end && (
                        <div className="text-xs text-red-600 mt-1">Cancels at period end</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {new Date(sub.current_period_start).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        → {new Date(sub.current_period_end).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">
                        {sub.items?.[0]?.unit_amount || 0} {sub.billing_currency}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {sub.status === "active" && !sub.cancel_at_period_end && (
                          <>
                            <button
                              onClick={() => handleCancel(sub.id, true)}
                              className="px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            >
                              Cancel at Period End
                            </button>
                            <button
                              onClick={() => handleCancel(sub.id, false)}
                              className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Cancel Now
                            </button>
                          </>
                        )}
                        {sub.cancel_at_period_end && (
                          <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
