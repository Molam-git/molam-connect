// ============================================================================
// Treasury Routing Dashboard - Ops UI
// ============================================================================

import React, { useEffect, useState } from "react";

interface Decision {
  id: string;
  created_at: string;
  payout_id: string | null;
  origin_module: string;
  amount: number;
  currency: string;
  chosen_bank_profile_id: string;
  reason: string;
  candidate_banks: any[];
}

interface HealthMetric {
  bank_profile_id: string;
  bank_name: string;
  status: string;
  success_rate: number;
  avg_latency_ms: number;
  recent_failures: number;
  last_checked: string;
}

interface CircuitBreaker {
  bank_profile_id: string;
  bank_name: string;
  state: string;
  failure_count: number;
  opened_at: string;
}

export default function TreasuryRouting() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [health, setHealth] = useState<HealthMetric[]>([]);
  const [circuits, setCircuits] = useState<CircuitBreaker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDecisions();
    fetchHealth();
  }, []);

  async function fetchDecisions() {
    const res = await fetch("/api/treasury/routing/decisions?limit=50");
    const data = await res.json();
    setDecisions(data);
  }

  async function fetchHealth() {
    setLoading(true);
    try {
      const res = await fetch("/api/treasury/routing/health");
      const data = await res.json();
      setHealth(data.health || []);
      setCircuits(data.circuits || []);
    } catch (e) {
      console.error("Failed to fetch health:", e);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "text-green-600 bg-green-50";
      case "degraded": return "text-yellow-600 bg-yellow-50";
      case "down": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const getCircuitColor = (state: string) => {
    switch (state) {
      case "closed": return "text-green-600 bg-green-50";
      case "half_open": return "text-yellow-600 bg-yellow-50";
      case "open": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bank Routing & Failover</h1>

      {/* Health Status */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Bank Health Status</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Latency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failures</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {health.map((h) => (
                <tr key={h.bank_profile_id}>
                  <td className="px-4 py-3 text-sm font-medium">{h.bank_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(h.status)}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{(h.success_rate * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-sm">{h.avg_latency_ms || '-'}ms</td>
                  <td className="px-4 py-3 text-sm">{h.recent_failures}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {h.last_checked ? new Date(h.last_checked).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Circuit Breakers */}
      {circuits.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Circuit Breakers (Open/Half-Open)</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failures</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opened At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {circuits.map((c) => (
                <tr key={c.bank_profile_id}>
                  <td className="px-4 py-3 text-sm font-medium">{c.bank_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getCircuitColor(c.state)}`}>
                      {c.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.failure_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(c.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Routing Decisions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Routing Decisions</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payout</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chosen Bank</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Candidates</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {decisions.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(d.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm font-mono">{d.payout_id?.slice(0, 8) || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  {d.amount.toLocaleString()} {d.currency}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-xs">
                  {d.chosen_bank_profile_id.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-sm">{d.reason}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {d.candidate_banks?.length || 0} banks
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
