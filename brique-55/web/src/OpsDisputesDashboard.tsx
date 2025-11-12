/**
 * Ops Disputes Dashboard
 * Advanced workbench for ops team to manage disputes
 */
import React, { useEffect, useState } from "react";

interface Dispute {
  id: string;
  payment_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  status: string;
  origin: string;
  response_due_at?: string;
  sira_score?: number;
  sira_recommendation?: string;
  assigned_to?: string;
  priority: number;
  created_at: string;
}

export default function OpsDisputesDashboard() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolveModal, setResolveModal] = useState(false);
  const [resolution, setResolution] = useState({
    outcome: "merchant_won",
    network_fee: 0,
    details: "",
  });

  useEffect(() => {
    fetchDisputes();
  }, [filter]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const url =
        filter === "all" ? "/api/disputes" : `/api/disputes?status=${filter}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();
      setDisputes(data.data || []);
    } catch (err) {
      console.error("Failed to fetch disputes:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDispute) return;

    try {
      await fetch(`/api/disputes/${selectedDispute.id}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(resolution),
      });

      alert("Dispute resolved successfully");
      setResolveModal(false);
      setSelectedDispute(null);
      fetchDisputes();
    } catch (err) {
      console.error("Failed to resolve dispute:", err);
      alert("Failed to resolve dispute");
    }
  };

  const handleAssign = async (disputeId: string, assignedTo: string) => {
    try {
      await fetch(`/api/disputes/${disputeId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ assigned_to: assignedTo }),
      });

      alert("Dispute assigned successfully");
      fetchDisputes();
    } catch (err) {
      console.error("Failed to assign dispute:", err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "won":
        return "bg-green-100 text-green-800";
      case "lost":
        return "bg-red-100 text-red-800";
      case "open":
        return "bg-blue-100 text-blue-800";
      case "responding":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 1:
        return <span className="text-red-600 font-bold">CRITICAL</span>;
      case 2:
        return <span className="text-orange-600 font-semibold">HIGH</span>;
      case 3:
        return <span className="text-blue-600">NORMAL</span>;
      case 4:
        return <span className="text-gray-600">LOW</span>;
      default:
        return <span className="text-gray-600">NORMAL</span>;
    }
  };

  const getSiraRecommendation = (recommendation?: string) => {
    switch (recommendation) {
      case "auto_accept":
        return <span className="text-green-600 font-medium">✓ Accept</span>;
      case "auto_refute":
        return <span className="text-red-600 font-medium">✗ Refute</span>;
      case "escalate":
        return <span className="text-orange-600 font-medium">⚠ Escalate</span>;
      default:
        return <span className="text-gray-600">N/A</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-semibold text-gray-900 mb-2">Disputes Workbench</h1>
        <p className="text-gray-600">Ops management for disputes and chargebacks</p>
      </div>

      {/* Metrics Overview */}
      <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Pending Review</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.status === "open").length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">High Priority</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.priority === 1 || d.priority === 2).length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Responding</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.status === "responding").length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Won</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.status === "won").length}
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Lost</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.status === "lost").length}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm w-fit">
          {["all", "open", "responding", "won", "lost", "closed"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                filter === tab
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Disputes Table */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading disputes...</div>
          ) : disputes.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No disputes found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Payment ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    SIRA
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {disputes.map((dispute) => (
                  <tr key={dispute.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">{getPriorityBadge(dispute.priority)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {dispute.payment_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">
                        {dispute.amount} {dispute.currency}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">{dispute.reason_code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          dispute.status
                        )}`}
                      >
                        {dispute.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {dispute.sira_score ? (
                          <div>
                            <div className="font-medium">{dispute.sira_score.toFixed(2)}</div>
                            <div className="text-xs">
                              {getSiraRecommendation(dispute.sira_recommendation)}
                            </div>
                          </div>
                        ) : (
                          "N/A"
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedDispute(dispute);
                          setResolveModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Resolve Modal */}
      {resolveModal && selectedDispute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4">
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">Resolve Dispute</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outcome</label>
                <select
                  value={resolution.outcome}
                  onChange={(e) => setResolution({ ...resolution, outcome: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="merchant_won">Merchant Won</option>
                  <option value="merchant_lost">Merchant Lost</option>
                  <option value="voided">Voided</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Network Fee (if merchant lost)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={resolution.network_fee}
                  onChange={(e) =>
                    setResolution({ ...resolution, network_fee: parseFloat(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Details / Notes
                </label>
                <textarea
                  value={resolution.details}
                  onChange={(e) => setResolution({ ...resolution, details: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleResolve}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              >
                Confirm Resolution
              </button>
              <button
                onClick={() => {
                  setResolveModal(false);
                  setSelectedDispute(null);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
