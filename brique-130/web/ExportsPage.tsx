// ============================================================================
// Treasury Exports Dashboard
// ============================================================================

import React, { useEffect, useState } from "react";

interface ExportJob {
  id: string;
  format: string;
  period_start: string;
  period_end: string;
  status: string;
  checksum?: string;
  file_size_bytes?: number;
  created_at: string;
  completed_at?: string;
}

interface Stats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total_bytes: number;
}

export default function ExportsPage() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [format, setFormat] = useState("BCEAO_CSV");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  useEffect(() => {
    fetchJobs();
    fetchStats();
    const interval = setInterval(() => {
      fetchJobs();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch("/api/treasury/exports?limit=50");
      const data = await res.json();
      setJobs(data);
    } catch (e) {
      console.error("Failed to fetch jobs:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/treasury/exports/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }

  async function createExport() {
    if (!periodStart || !periodEnd) {
      alert("Please select period dates");
      return;
    }

    try {
      const res = await fetch("/api/treasury/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, period_start: periodStart, period_end: periodEnd })
      });

      if (res.ok) {
        alert("Export job created");
        fetchJobs();
      } else {
        alert("Failed to create export");
      }
    } catch (e) {
      alert("Error creating export");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-50";
      case "running": return "text-blue-600 bg-blue-50";
      case "pending": return "text-yellow-600 bg-yellow-50";
      case "failed": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '-';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Treasury Regulatory Exports</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Pending</div>
            <div className="text-2xl font-bold">{stats.pending || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Running</div>
            <div className="text-2xl font-bold text-blue-600">{stats.running || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Completed</div>
            <div className="text-2xl font-bold text-green-600">{stats.completed || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Size</div>
            <div className="text-xl font-bold">{formatBytes(stats.total_bytes)}</div>
          </div>
        </div>
      )}

      {/* Create Export Form */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Create New Export</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="BCEAO_CSV">BCEAO CSV</option>
              <option value="BCEAO_XML">BCEAO XML</option>
              <option value="BCE_XML">BCE XML</option>
              <option value="FED_JSON">FED JSON</option>
              <option value="SEC_CSV">SEC CSV</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={createExport}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Generate Export
            </button>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Format</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Checksum</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No exports found</td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">{job.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-sm font-semibold">{job.format}</td>
                  <td className="px-4 py-3 text-sm">
                    {job.period_start} → {job.period_end}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${getStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{formatBytes(job.file_size_bytes)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-xs">
                    {job.checksum ? job.checksum.slice(0, 12) + '...' : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {job.status === 'completed' && (
                      <a
                        href={`/api/treasury/exports/${job.id}/download`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Download
                      </a>
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
