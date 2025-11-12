/**
 * Brique 50 - Fiscal Reporting
 * Ops Dashboard (React + Apple-like Design)
 */

import React, { useEffect, useState } from "react";

interface FiscalReport {
  id: string;
  legal_entity: string;
  country: string;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  sira_reject_score: number;
  artifact_s3_key: string;
  created_at: string;
}

interface Channel {
  id: string;
  country: string;
  authority: string;
  protocol: string;
  format: string;
  status: string;
  priority: number;
}

interface Remediation {
  id: string;
  report_id: string;
  legal_entity: string;
  report_type: string;
  issue_code: string;
  severity: string;
  status: string;
  created_at: string;
}

export default function FiscalOpsDashboard() {
  const [reports, setReports] = useState<FiscalReport[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [remediations, setRemediations] = useState<Remediation[]>([]);
  const [activeTab, setActiveTab] = useState<"reports" | "channels" | "remediations">("reports");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [reportsRes, channelsRes, remediationsRes] = await Promise.all([
        fetch("/api/fiscal/reports").then((r) => r.json()),
        fetch("/api/fiscal/channels").then((r) => r.json()),
        fetch("/api/fiscal/remediations").then((r) => r.json()),
      ]);

      setReports(reportsRes);
      setChannels(channelsRes);
      setRemediations(remediationsRes);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    setLoading(false);
  }

  async function submitReport(reportId: string, channelId: string) {
    if (!confirm("Submit this report?")) return;

    try {
      await fetch(`/api/fiscal/reports/${reportId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      alert("Submission initiated");
      loadData();
    } catch (err) {
      alert("Submission failed: " + String(err));
    }
  }

  async function generateReport() {
    const legalEntity = prompt("Legal Entity:");
    const reportType = prompt("Report Type (vat_return, withholding, digital_services):");
    const periodStart = prompt("Period Start (YYYY-MM-DD):");
    const periodEnd = prompt("Period End (YYYY-MM-DD):");

    if (!legalEntity || !reportType || !periodStart || !periodEnd) return;

    try {
      await fetch("/api/fiscal/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalEntity, reportType, periodStart, periodEnd }),
      });
      alert("Report generated successfully");
      loadData();
    } catch (err) {
      alert("Generation failed: " + String(err));
    }
  }

  return (
    <div className="fiscal-ops-dashboard">
      <style>{`
        .fiscal-ops-dashboard {
          min-height: 100vh;
          padding: 24px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .header {
          margin-bottom: 32px;
        }
        .header h1 {
          font-size: 32px;
          font-weight: 700;
          color: #1d1d1f;
          margin: 0 0 8px 0;
        }
        .header p {
          font-size: 16px;
          color: #6e6e73;
          margin: 0;
        }
        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid #d2d2d7;
        }
        .tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          color: #6e6e73;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab:hover {
          color: #1d1d1f;
        }
        .tab.active {
          color: #0071e3;
          border-bottom-color: #0071e3;
        }
        .actions {
          margin-bottom: 16px;
        }
        .btn {
          padding: 10px 20px;
          background: #0071e3;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn:hover {
          background: #0077ed;
          transform: translateY(-1px);
        }
        .btn-secondary {
          background: #e5e5ea;
          color: #1d1d1f;
        }
        .btn-secondary:hover {
          background: #d2d2d7;
        }
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          overflow: hidden;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          text-align: left;
          padding: 16px;
          background: #f5f5f7;
          color: #1d1d1f;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td {
          padding: 16px;
          border-bottom: 1px solid #f5f5f7;
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
        .score-high { color: #d1453b; font-weight: 700; }
        .score-medium { color: #f5a623; font-weight: 600; }
        .score-low { color: #52c41a; font-weight: 600; }
      `}</style>

      <div className="header">
        <h1>Fiscal Reporting & Submission</h1>
        <p>Automated fiscal report generation and submission to tax authorities</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          Reports
        </button>
        <button
          className={`tab ${activeTab === "channels" ? "active" : ""}`}
          onClick={() => setActiveTab("channels")}
        >
          Channels
        </button>
        <button
          className={`tab ${activeTab === "remediations" ? "active" : ""}`}
          onClick={() => setActiveTab("remediations")}
        >
          Remediations
        </button>
      </div>

      {activeTab === "reports" && (
        <>
          <div className="actions">
            <button className="btn" onClick={generateReport}>
              + Generate Report
            </button>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th>SIRA Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.legal_entity}</td>
                    <td>{r.report_type}</td>
                    <td>
                      {r.period_start} → {r.period_end}
                    </td>
                    <td>{r.country}</td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === "accepted"
                            ? "badge-success"
                            : r.status === "submitted"
                            ? "badge-info"
                            : r.status === "ready"
                            ? "badge-warning"
                            : "badge-secondary"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          r.sira_reject_score > 60
                            ? "score-high"
                            : r.sira_reject_score > 30
                            ? "score-medium"
                            : "score-low"
                        }
                      >
                        {r.sira_reject_score || 0}%
                      </span>
                    </td>
                    <td>
                      <select
                        onChange={(e) => e.target.value && submitReport(r.id, e.target.value)}
                        defaultValue=""
                      >
                        <option value="">Submit to...</option>
                        {channels
                          .filter((c) => c.country === r.country && c.status === "active")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.authority} ({c.protocol})
                            </option>
                          ))}
                      </select>
                      <a
                        href={`/api/fiscal/reports/${r.id}/artifact`}
                        target="_blank"
                        style={{ marginLeft: 8, fontSize: 12 }}
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "channels" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Authority</th>
                <th>Protocol</th>
                <th>Format</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id}>
                  <td>{c.country}</td>
                  <td>{c.authority}</td>
                  <td>{c.protocol.toUpperCase()}</td>
                  <td>{c.format}</td>
                  <td>{c.priority}</td>
                  <td>
                    <span
                      className={`badge ${
                        c.status === "active" ? "badge-success" : "badge-secondary"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "remediations" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Report Type</th>
                <th>Issue</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {remediations.map((rem) => (
                <tr key={rem.id}>
                  <td>{rem.legal_entity}</td>
                  <td>{rem.report_type}</td>
                  <td>{rem.issue_code}</td>
                  <td>
                    <span
                      className={`badge ${
                        rem.severity === "critical"
                          ? "badge-danger"
                          : rem.severity === "high"
                          ? "badge-warning"
                          : "badge-info"
                      }`}
                    >
                      {rem.severity}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-secondary">{rem.status}</span>
                  </td>
                  <td>{new Date(rem.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
