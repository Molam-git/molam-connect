// ============================================================================
// Marketplace Payouts Admin UI
// ============================================================================

import React, { useEffect, useState } from "react";

interface Batch {
  id: string;
  batch_reference: string;
  total_amount: number;
  currency: string;
  status: string;
  schedule_type: string;
  created_at: string;
}

interface BatchDetails extends Batch {
  lines: Array<{
    id: string;
    seller_id: string;
    gross_amount: number;
    seller_amount: number;
    marketplace_fee: number;
    molam_fee: number;
    status: string;
  }>;
}

export default function MarketplacePayouts({ marketplaceId }: { marketplaceId: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBatches();
  }, [marketplaceId]);

  async function fetchBatches() {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/${marketplaceId}/batches`);
      const data = await res.json();
      setBatches(data);
    } catch (e) {
      console.error("Failed to fetch batches:", e);
    } finally {
      setLoading(false);
    }
  }

  async function createBatch(scheduleType: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/${marketplaceId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleType, currency: "USD" })
      });

      if (res.ok) {
        alert("Batch created successfully");
        fetchBatches();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (e) {
      alert("Failed to create batch");
    } finally {
      setLoading(false);
    }
  }

  async function viewBatchDetails(batchId: string) {
    try {
      const res = await fetch(`/api/marketplace/${marketplaceId}/batches/${batchId}`);
      const data = await res.json();
      setSelectedBatch(data);
    } catch (e) {
      console.error("Failed to fetch batch details:", e);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-50";
      case "processing": return "text-blue-600 bg-blue-50";
      case "queued": return "text-yellow-600 bg-yellow-50";
      case "failed": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Marketplace Payout Batches</h1>
        <div className="flex gap-2">
          <button
            onClick={() => createBatch("immediate")}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            Create Immediate Batch
          </button>
          <button
            onClick={() => createBatch("daily")}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            Schedule Daily Batch
          </button>
        </div>
      </div>

      {/* Batches List */}
      <div className="bg-white rounded-lg shadow mb-6">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono">{b.batch_reference}</td>
                <td className="px-4 py-3 text-sm font-semibold">{b.total_amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">{b.currency}</td>
                <td className="px-4 py-3 text-sm capitalize">{b.schedule_type}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(b.status)}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(b.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => viewBatchDetails(b.id)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Batch Details Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Batch Details</h2>
                <p className="text-sm text-gray-600">{selectedBatch.batch_reference}</p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <div className="text-sm text-gray-600">Total Amount</div>
                  <div className="text-2xl font-bold">{selectedBatch.total_amount.toLocaleString()} {selectedBatch.currency}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <div className="text-lg font-semibold capitalize">{selectedBatch.status}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Sellers</div>
                  <div className="text-2xl font-bold">{selectedBatch.lines?.length || 0}</div>
                </div>
              </div>

              <h3 className="text-lg font-semibold mb-3">Payout Lines</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Seller ID</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Seller Amount</th>
                    <th className="px-3 py-2 text-right">Marketplace Fee</th>
                    <th className="px-3 py-2 text-right">Molam Fee</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedBatch.lines?.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-mono text-xs">{line.seller_id.slice(0, 8)}...</td>
                      <td className="px-3 py-2 text-right">{line.gross_amount.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{line.seller_amount.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{line.marketplace_fee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{line.molam_fee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-1 text-xs rounded ${getStatusColor(line.status)}`}>
                          {line.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
