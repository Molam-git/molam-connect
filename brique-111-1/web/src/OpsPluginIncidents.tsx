/**
 * Brique 111-1 - Self-Healing Plugins (SIRA)
 * Ops UI: Plugin Incidents & Approvals Dashboard
 */

import React, { useState, useEffect } from "react";

interface Incident {
  id: string;
  merchant_plugin_id: string;
  incident_type: string;
  severity: string;
  detected_at: string;
  status: string;
  sira_decision: any;
  telemetry_snapshot: any;
  escalated_to_ops: boolean;
}

interface AutopatchAttempt {
  id: string;
  incident_id: string;
  from_version: string;
  to_version: string;
  status: string;
  executed_at: string;
  logs: any[];
}

export default function OpsPluginIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [autopatchAttempts, setAutopatchAttempts] = useState<AutopatchAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [incidentsRes, attemptsRes] = await Promise.all([
        fetch("/api/ops/plugin-incidents", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch("/api/ops/autopatch-attempts", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
      ]);

      const incidentsData = await incidentsRes.json();
      const attemptsData = await attemptsRes.json();

      setIncidents(incidentsData);
      setAutopatchAttempts(attemptsData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function approveAutoPatch(incidentId: string) {
    try {
      await fetch(`/api/ops/plugin-incidents/${incidentId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      alert("Auto-patch approved");
      await loadData();
    } catch (error) {
      console.error("Failed to approve:", error);
      alert("Error approving auto-patch");
    }
  }

  async function takeManualAction(incidentId: string) {
    const action = prompt("Manual action description?");
    if (!action) return;

    try {
      await fetch(`/api/ops/plugin-incidents/${incidentId}/manual-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ action })
      });

      alert("Manual action recorded");
      await loadData();
    } catch (error) {
      console.error("Failed to record manual action:", error);
      alert("Error recording action");
    }
  }

  function getSeverityBadge(severity: string) {
    const colors: Record<string, string> = {
      low: "bg-blue-100 text-blue-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800"
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[severity] || "bg-gray-100"}`}>
        {severity.toUpperCase()}
      </span>
    );
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      open: "bg-red-100 text-red-800",
      in_progress: "bg-yellow-100 text-yellow-800",
      mitigated: "bg-green-100 text-green-800",
      closed: "bg-gray-100 text-gray-800",
      escalated: "bg-purple-100 text-purple-800"
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || "bg-gray-100"}`}>
        {status.toUpperCase()}
      </span>
    );
  }

  if (loading) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Plugin Incidents & Auto-Patch</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Incidents</div>
          <div className="text-2xl font-bold">{incidents.length}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Open</div>
          <div className="text-2xl font-bold text-red-600">
            {incidents.filter(i => i.status === "open").length}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Mitigated</div>
          <div className="text-2xl font-bold text-green-600">
            {incidents.filter(i => i.status === "mitigated").length}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-600">Auto-Patch Attempts</div>
          <div className="text-2xl font-bold">{autopatchAttempts.length}</div>
        </div>
      </div>

      {/* Incidents List */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Recent Incidents</h2>
        <div className="space-y-4">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className="border rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{incident.incident_type}</h3>
                    {getSeverityBadge(incident.severity)}
                    {getStatusBadge(incident.status)}
                    {incident.escalated_to_ops && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                        ESCALATED
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Plugin ID: {incident.merchant_plugin_id}</div>
                    <div>Detected: {new Date(incident.detected_at).toLocaleString()}</div>
                    {incident.sira_decision && (
                      <div className="mt-2">
                        <div className="font-medium">SIRA Decision:</div>
                        <div className="text-xs bg-gray-50 p-2 rounded mt-1">
                          Action: {incident.sira_decision.action}
                          {incident.sira_decision.patch_version && (
                            <> → Patch: {incident.sira_decision.patch_version}</>
                          )}
                          <br />
                          Confidence: {(incident.sira_decision.confidence * 100).toFixed(1)}%
                          <br />
                          {incident.sira_decision.explanation && (
                            <>Explanation: {incident.sira_decision.explanation}</>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedIncident(incident)}
                    className="px-3 py-1 border rounded-lg hover:bg-gray-50"
                  >
                    Détails
                  </button>
                  {incident.status === "open" && incident.sira_decision?.action === "patch" && (
                    <button
                      onClick={() => approveAutoPatch(incident.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Approve Patch
                    </button>
                  )}
                  <button
                    onClick={() => takeManualAction(incident.id)}
                    className="px-3 py-1 border rounded-lg hover:bg-blue-50 text-blue-600"
                  >
                    Manual Action
                  </button>
                </div>
              </div>
            </div>
          ))}

          {incidents.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucun incident détecté
            </div>
          )}
        </div>
      </section>

      {/* Auto-Patch Attempts */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Auto-Patch Attempts</h2>
        <div className="space-y-3">
          {autopatchAttempts.map((attempt) => (
            <div
              key={attempt.id}
              className="border rounded-lg p-3 flex justify-between items-center"
            >
              <div>
                <div className="font-medium">
                  {attempt.from_version} → {attempt.to_version}
                </div>
                <div className="text-sm text-gray-600">
                  {new Date(attempt.executed_at).toLocaleString()} • {attempt.status}
                </div>
              </div>
              <div>
                {getStatusBadge(attempt.status)}
              </div>
            </div>
          ))}

          {autopatchAttempts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Aucune tentative de patch automatique
            </div>
          )}
        </div>
      </section>

      {/* Incident Details Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">{selectedIncident.incident_type}</h3>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Telemetry Snapshot</h4>
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(selectedIncident.telemetry_snapshot, null, 2)}
                </pre>
              </div>

              {selectedIncident.sira_decision && (
                <div>
                  <h4 className="font-medium mb-2">SIRA Decision</h4>
                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto">
                    {JSON.stringify(selectedIncident.sira_decision, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



