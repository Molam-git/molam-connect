/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Merchant Refunds Dashboard (React + Apple-like Design)
 */

import React, { useEffect, useState } from "react";

interface RefundRequest {
  id: string;
  payment_id: string;
  customer_id: string;
  amount: string;
  currency: string;
  status: string;
  reason: string;
  sira_score: number;
  decision_reason: string;
  created_at: string;
}

export default function MerchantRefunds() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [filter, setFilter] = useState<"all" | "requested" | "auto_approved" | "merchant_approved" | "denied">("requested");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function loadRequests() {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/refund-requests" : `/api/refund-requests?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setRequests(data);
    } catch (err) {
      console.error("Failed to load refund requests:", err);
    }
    setLoading(false);
  }

  async function approveRequest(id: string) {
    if (!confirm("Approve this refund request?")) return;

    try {
      await fetch(`/api/refund-requests/${id}/merchant-approve`, {
        method: "POST",
      });
      alert("Request approved");
      loadRequests();
    } catch (err) {
      alert("Approval failed: " + String(err));
    }
  }

  async function denyRequest(id: string) {
    const reason = prompt("Denial reason:");
    if (!reason) return;

    try {
      await fetch(`/api/refund-requests/${id}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      alert("Request denied");
      loadRequests();
    } catch (err) {
      alert("Denial failed: " + String(err));
    }
  }

  return (
    <div className="merchant-refunds">
      <style>{`
        .merchant-refunds {
          min-height: 100vh;
          padding: 24px;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
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
          color: #f5576c;
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
        .btn {
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-right: 4px;
        }
        .btn-approve {
          background: #52c41a;
          color: white;
        }
        .btn-approve:hover {
          background: #73d13d;
        }
        .btn-deny {
          background: #ff4d4f;
          color: white;
        }
        .btn-deny:hover {
          background: #ff7875;
        }
      `}</style>

      <div className="header">
        <h1>Refund Requests</h1>
        <p>Manage customer refund requests</p>
      </div>

      <div className="filters">
        <button
          className={`filter-btn ${filter === "requested" ? "active" : ""}`}
          onClick={() => setFilter("requested")}
        >
          Pending
        </button>
        <button
          className={`filter-btn ${filter === "auto_approved" ? "active" : ""}`}
          onClick={() => setFilter("auto_approved")}
        >
          Auto-Approved
        </button>
        <button
          className={`filter-btn ${filter === "merchant_approved" ? "active" : ""}`}
          onClick={() => setFilter("merchant_approved")}
        >
          Approved
        </button>
        <button
          className={`filter-btn ${filter === "denied" ? "active" : ""}`}
          onClick={() => setFilter("denied")}
        >
          Denied
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
              <th>Payment ID</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>SIRA Score</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#999" }}>
                  {loading ? "Loading..." : "No refund requests found"}
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.payment_id.slice(0, 8)}...</td>
                <td>
                  {r.amount} {r.currency}
                </td>
                <td>{r.reason || "-"}</td>
                <td>
                  <span
                    style={{
                      color: r.sira_score > 0.7 ? "#d1453b" : r.sira_score > 0.4 ? "#f5a623" : "#52c41a",
                      fontWeight: 700,
                    }}
                  >
                    {r.sira_score ? (r.sira_score * 100).toFixed(1) + "%" : "-"}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${
                      r.status === "auto_approved" || r.status === "merchant_approved"
                        ? "badge-success"
                        : r.status === "denied"
                        ? "badge-danger"
                        : "badge-warning"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.status === "requested" && (
                    <>
                      <button className="btn btn-approve" onClick={() => approveRequest(r.id)}>
                        Approve
                      </button>
                      <button className="btn btn-deny" onClick={() => denyRequest(r.id)}>
                        Deny
                      </button>
                    </>
                  )}
                  {r.status !== "requested" && <span style={{ color: "#999" }}>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
