// ============================================================================
// Settlement Engine UI - Ops Dashboard
// ============================================================================

import React, { useEffect, useState } from "react";

interface Instruction {
  id: string;
  payout_id: string;
  bank_name: string;
  amount: number;
  currency: string;
  rail: string;
  status: string;
  retries: number;
  created_at: string;
  sent_at?: string;
  confirmed_at?: string;
  failure_reason?: string;
}

interface Stats {
  pending: number;
  sent: number;
  confirmed: number;
  failed: number;
  avg_time_seconds: number;
}

export default function SettlementUI() {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchInstructions();
    fetchStats();
    const interval = setInterval(() => {
      fetchInstructions();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  async function fetchInstructions() {
    setLoading(true);
    try {
      const url = filter === "all"
        ? "/api/treasury/settlement?limit=50"
        : `/api/treasury/settlement?limit=50&status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setInstructions(data);
    } catch (e) {
      console.error("Failed to fetch instructions:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/treasury/settlement/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }

  async function retryInstruction(id: string) {
    try {
      await fetch(`/api/treasury/settlement/${id}/retry`, { method: "POST" });
      alert("Instruction queued for retry");
      fetchInstructions();
    } catch (e) {
      alert("Failed to retry instruction");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "text-green-600 bg-green-50";
      case "sent": return "text-blue-600 bg-blue-50";
      case "pending": return "text-yellow-600 bg-yellow-50";
      case "failed": return "text-red-600 bg-red-50";
      case "rerouted": return "text-purple-600 bg-purple-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Settlement Engine</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-3 py-1 rounded ${filter === "pending" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("failed")}
            className={`px-3 py-1 rounded ${filter === "failed" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Pending</div>
            <div className="text-2xl font-bold">{stats.pending || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Sent</div>
            <div className="text-2xl font-bold">{stats.sent || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Confirmed</div>
            <div className="text-2xl font-bold text-green-600">{stats.confirmed || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Avg Time</div>
            <div className="text-2xl font-bold">{stats.avg_time_seconds ? `${Math.round(stats.avg_time_seconds)}s` : '-'}</div>
          </div>
        </div>
      )}

      {/* Instructions Table */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rail</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retries</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : instructions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No instructions found</td>
              </tr>
            ) : (
              instructions.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{i.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm">{i.bank_name || '-'}</td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    {i.amount.toLocaleString()} {i.currency}
                  </td>
                  <td className="px-4 py-3 text-sm uppercase">{i.rail}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(i.status)}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{i.retries}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(i.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {i.status === 'failed' && (
                      <button
                        onClick={() => retryInstruction(i.id)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Retry
                      </button>
                    )}
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
