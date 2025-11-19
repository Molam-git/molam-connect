// ============================================================================
// Treasury Dashboard - Payouts & Settlement Overview
// ============================================================================

import React, { useEffect, useState } from "react";

interface PayoutStats {
  pending_count: number;
  sent_count: number;
  settled_count: number;
  failed_count: number;
  settled_amount: number;
  currency: string;
}

interface Payout {
  id: string;
  reference_code: string;
  origin_module: string;
  amount: number;
  currency: string;
  status: string;
  scheduled_for: string;
  provider_ref?: string;
  attempt_count: number;
  requested_at: string;
}

export default function TreasuryDashboard() {
  const [stats, setStats] = useState<PayoutStats | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchPayouts();
    const interval = setInterval(() => {
      fetchStats();
      fetchPayouts();
    }, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [filter]);

  async function fetchStats() {
    try {
      const res = await fetch("/api/treasury/stats?period=24h");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }

  async function fetchPayouts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/treasury/payouts?status=${filter}&limit=50`);
      const data = await res.json();
      setPayouts(data);
    } catch (e) {
      console.error("Failed to fetch payouts:", e);
    } finally {
      setLoading(false);
    }
  }

  async function executePayoutNow(id: string) {
    if (!confirm("Execute this payout immediately?")) return;
    try {
      await fetch(`/api/treasury/payouts/${id}/execute`, { method: "POST" });
      fetchPayouts();
    } catch (e) {
      alert("Failed to execute payout");
    }
  }

  async function cancelPayout(id: string) {
    const reason = prompt("Cancellation reason:");
    if (!reason) return;
    try {
      await fetch(`/api/treasury/payouts/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      fetchPayouts();
    } catch (e) {
      alert("Failed to cancel payout");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
      case "reserved":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "sent":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      case "settled":
        return "bg-green-100 text-green-700 border-green-200";
      case "failed":
        return "bg-red-100 text-red-700 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Treasury Dashboard</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Create Payout
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Create Batch
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="text-sm text-gray-600">Pending</div>
            <div className="text-2xl font-bold">{stats.pending_count || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-indigo-500">
            <div className="text-sm text-gray-600">Sent</div>
            <div className="text-2xl font-bold">{stats.sent_count || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <div className="text-sm text-gray-600">Settled (24h)</div>
            <div className="text-2xl font-bold">{stats.settled_count || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-2xl font-bold text-red-600">
              {stats.failed_count || 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <div className="text-sm text-gray-600">Settled Amount</div>
            <div className="text-2xl font-bold">
              {(stats.settled_amount || 0).toFixed(2)} {stats.currency || ""}
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {["pending", "sent", "settled", "failed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded capitalize ${
              filter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Reference
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Module
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Scheduled
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Attempts
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Provider Ref
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No payouts found
                </td>
              </tr>
            ) : (
              payouts.map((payout) => (
                <tr
                  key={payout.id}
                  className={`hover:bg-gray-50 border-l-4 ${getStatusColor(
                    payout.status
                  )}`}
                >
                  <td className="px-4 py-3 text-sm font-mono">
                    {payout.reference_code}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-block px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
                      {payout.origin_module}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    {payout.amount.toFixed(2)} {payout.currency}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-semibold rounded uppercase ${getStatusColor(
                        payout.status
                      )}`}
                    >
                      {payout.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(payout.scheduled_for).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {payout.attempt_count > 0 && (
                      <span className="text-orange-600 font-semibold">
                        {payout.attempt_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-500">
                    {payout.provider_ref || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {payout.status === "pending" && (
                        <>
                          <button
                            onClick={() => executePayoutNow(payout.id)}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Execute
                          </button>
                          <button
                            onClick={() => cancelPayout(payout.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
