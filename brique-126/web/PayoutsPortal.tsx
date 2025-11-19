// ============================================================================
// Brique 126 — Payouts Portal UI
// ============================================================================

import React, { useEffect, useState } from "react";

interface Payout {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  failure_reason?: string;
}

export default function PayoutsPortal() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [amount, setAmount] = useState(100);
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState<"instant" | "batch" | "priority">("instant");
  const [destinationId, setDestinationId] = useState("");

  useEffect(() => {
    fetchPayouts();
  }, []);

  async function fetchPayouts() {
    setLoading(true);
    try {
      const res = await fetch("/api/payouts");
      const data = await res.json();
      setPayouts(data);
    } catch (e) {
      console.error("Failed to fetch payouts:", e);
    } finally {
      setLoading(false);
    }
  }

  async function requestPayout() {
    if (!destinationId) {
      alert("Please select a destination account");
      return;
    }

    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, method, destinationId })
      });

      if (res.ok) {
        alert("Payout requested successfully");
        fetchPayouts();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e: any) {
      alert("Failed to request payout");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "settled": return "text-green-600 bg-green-50";
      case "sent": return "text-blue-600 bg-blue-50";
      case "processing": return "text-yellow-600 bg-yellow-50";
      case "failed": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Payouts & Settlements</h1>

      {/* Request Payout Form */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Request New Payout</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="XOF">XOF</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="instant">Instant</option>
              <option value="priority">Priority</option>
              <option value="batch">Batch</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Destination</label>
            <input
              type="text"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              placeholder="Treasury account ID"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        <button
          onClick={requestPayout}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Request Payout
        </button>
      </div>

      {/* Payouts List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Recent Payouts</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payouts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{p.reference}</td>
                  <td className="px-4 py-3 text-sm">
                    {p.amount.toLocaleString()} {p.currency}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">{p.method}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(p.requested_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
