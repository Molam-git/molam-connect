/**
 * Merchant Disputes Dashboard
 * Apple-inspired design for viewing and managing disputes
 */
import React, { useEffect, useState } from "react";

interface Dispute {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  reason_code: string;
  status: string;
  origin: string;
  response_due_at?: string;
  created_at: string;
}

interface Evidence {
  id: string;
  type: string;
  uploaded_at: string;
  size_bytes: number;
}

export default function MerchantDisputesDashboard() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    fetchDisputes();
  }, [filter]);

  const fetchDisputes = async () => {
    try {
      setLoading(true);
      const url =
        filter === "all"
          ? "/api/disputes"
          : `/api/disputes?status=${filter}`;

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

  const fetchDisputeDetails = async (disputeId: string) => {
    try {
      const response = await fetch(`/api/disputes/${disputeId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();
      setSelectedDispute(data);
      setEvidences(data.evidences || []);
      setTimeline(data.timeline || []);
    } catch (err) {
      console.error("Failed to fetch dispute details:", err);
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
      case "closed":
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDeadline = (dueAt?: string) => {
    if (!dueAt) return "N/A";
    const deadline = new Date(dueAt);
    const now = new Date();
    const hoursRemaining = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60));

    if (hoursRemaining < 0) {
      return <span className="text-red-600 font-semibold">OVERDUE</span>;
    } else if (hoursRemaining < 24) {
      return <span className="text-orange-600 font-semibold">{hoursRemaining}h remaining</span>;
    } else {
      return deadline.toLocaleDateString();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-semibold text-gray-900 mb-2">Disputes & Chargebacks</h1>
        <p className="text-gray-600">Manage payment disputes and respond to chargebacks</p>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Total Disputes</div>
          <div className="text-4xl font-bold">{disputes.length}</div>
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
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Responding</div>
          <div className="text-4xl font-bold">
            {disputes.filter((d) => d.status === "responding" || d.status === "open").length}
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
                    Deadline
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {disputes.map((dispute) => (
                  <tr key={dispute.id} className="hover:bg-gray-50 transition-colors">
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
                      <div className="text-sm">{formatDeadline(dispute.response_due_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => fetchDisputeDetails(dispute.id)}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Dispute Details Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-semibold text-gray-900">Dispute Details</h3>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Dispute ID</div>
                  <div className="font-semibold">{selectedDispute.id}</div>
                </div>
                <div>
                  <div className="text-gray-600">Payment ID</div>
                  <div className="font-semibold">{selectedDispute.payment_id}</div>
                </div>
                <div>
                  <div className="text-gray-600">Amount</div>
                  <div className="font-semibold">
                    {selectedDispute.amount} {selectedDispute.currency}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Status</div>
                  <span
                    className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                      selectedDispute.status
                    )}`}
                  >
                    {selectedDispute.status}
                  </span>
                </div>
              </div>

              {/* Evidences */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Evidence ({evidences.length})</h4>
                {evidences.length === 0 ? (
                  <p className="text-sm text-gray-500">No evidence uploaded yet</p>
                ) : (
                  <div className="space-y-2">
                    {evidences.map((ev) => (
                      <div key={ev.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="text-sm font-medium">{ev.type}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(ev.uploaded_at).toLocaleString()} •{" "}
                            {(ev.size_bytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Timeline</h4>
                <div className="space-y-3">
                  {timeline.map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="w-2 h-2 mt-2 rounded-full bg-indigo-600"></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{event.action}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleString()} • {event.actor_type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
