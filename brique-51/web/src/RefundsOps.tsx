/**
 * Brique 51 - Refunds & Reversals
 * Ops Dashboard (React + Apple-like Design)
 */

import React, { useEffect, useState } from "react";

interface Refund {
  id: string;
  payment_id: string;
  origin_module: string;
  initiator: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
  reason: string;
  sira_score: number;
  created_at: string;
}

export default function RefundsOps() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "processing" | "succeeded" | "failed">("pending");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRefunds();
  }, [filter]);

  async function loadRefunds() {
    setLoading(true);
    try {
      const endpoint = filter === "pending" ? "/api/ops/refunds/pending" : `/api/refunds?status=${filter}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setRefunds(data);
    } catch (err) {
      console.error("Failed to load refunds:", err);
    }
    setLoading(false);
  }

  async function approveRefund(id: string) {
    if (!confirm("Approve this refund?")) return;

    try {
      await fetch(`/api/ops/refunds/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Approved by Ops" }),
      });
      alert("Refund approved");
      loadRefunds();
    } catch (err) {
      alert("Approval failed: " + String(err));
    }
  }

  async function rejectRefund(id: string) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;

    try {
      await fetch(`/api/ops/refunds/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: reason }),
      });
      alert("Refund rejected");
      loadRefunds();
    } catch (err) {
      alert("Rejection failed: " + String(err));
    }
  }

  return (
    <div className="refunds-ops">
      <style>{`
        .refunds-ops {
          min-height: 100vh;
          padding: 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .header {
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 32px;
          font-weight: 700;
          color: white;
          margin: 0 0 8px 0;
        }
        .header p {
          font-size: 16px;
          color: rgba(255,255,255,0.9);
          margin: 0;
        }
        .filters {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }
        .filter-btn {
          padding: 10px 20px;
          background: rgba(255,255,255,0.2);
          color: white;
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .filter-btn.active {
          background: white;
          color: #667eea;
          border-color: white;
        }
        .card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          overflow: hidden;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          text-align: left;
          padding: 16px;
          background: #f8f9fa;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td {
          padding: 16px;
          border-bottom: 1px solid #f0f0f0;
          color: #1d1d1f;
          font-size: 14px;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-success { background: #d4edda; color: #155724; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-danger { background: #f8d7da; color: #721c24; }
        .badge-info { background: #d1ecf1; color: #0c5460; }
        .badge-secondary { background: #e5e5ea; color: #6e6e73; }
        .btn {
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-approve {
          background: #52c41a;
          color: white;
          margin-right: 4px;
        }
        .btn-approve:hover {
          background: #73d13d;
        }
        .btn-reject {
          background: #ff4d4f;
          color: white;
        }
        .btn-reject:hover {
          background: #ff7875;
        }
        .sira-score {
          font-weight: 700;
        }
        .sira-high { color: #d1453b; }
        .sira-medium { color: #f5a623; }
        .sira-low { color: #52c41a; }
      `}</style>

      <div className="header">
        <h1>Refunds & Reversals Ops</h1>
        <p>Review and approve refund requests</p>
      </div>

      <div className="filters">
        <button
          className={`filter-btn ${filter === "pending" ? "active" : ""}`}
          onClick={() => setFilter("pending")}
        >
          Pending Approval
        </button>
        <button
          className={`filter-btn ${filter === "processing" ? "active" : ""}`}
          onClick={() => setFilter("processing")}
        >
          Processing
        </button>
        <button
          className={`filter-btn ${filter === "succeeded" ? "active" : ""}`}
          onClick={() => setFilter("succeeded")}
        >
          Succeeded
        </button>
        <button
          className={`filter-btn ${filter === "failed" ? "active" : ""}`}
          onClick={() => setFilter("failed")}
        >
          Failed
        </button>
        <button
          className={`filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Refund ID</th>
              <th>Payment</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Initiator</th>
              <th>SIRA Score</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {refunds.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  {loading ? "Loading..." : "No refunds found"}
                </td>
              </tr>
            )}
            {refunds.map((r) => (
              <tr key={r.id}>
                <td>{r.id.slice(0, 8)}...</td>
                <td>{r.payment_id.slice(0, 8)}...</td>
                <td>
                  <span className="badge badge-info">{r.type}</span>
                </td>
                <td>
                  {r.amount} {r.currency}
                </td>
                <td>{r.initiator}</td>
                <td>
                  <span
                    className={`sira-score ${
                      r.sira_score > 0.7 ? "sira-high" : r.sira_score > 0.4 ? "sira-medium" : "sira-low"
                    }`}
                  >
                    {(r.sira_score * 100).toFixed(1)}%
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${
                      r.status === "succeeded"
                        ? "badge-success"
                        : r.status === "processing"
                        ? "badge-info"
                        : r.status === "failed"
                        ? "badge-danger"
                        : "badge-warning"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.status === "requires_approval" && (
                    <>
                      <button className="btn btn-approve" onClick={() => approveRefund(r.id)}>
                        Approve
                      </button>
                      <button className="btn btn-reject" onClick={() => rejectRefund(r.id)}>
                        Reject
                      </button>
                    </>
                  )}
                  {r.status !== "requires_approval" && <span style={{ color: "#999" }}>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
