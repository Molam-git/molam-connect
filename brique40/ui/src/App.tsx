import React, { useEffect, useState, useRef } from "react";
import { createWS } from "./wsClient";

type Alert = {
  txnId: string;
  userId: string;
  amount: number;
  currency: string;
  risk: "low" | "medium" | "high" | "critical";
  rule: string;
  createdAt: string;
  meta?: any;
};

type FraudCase = {
  playbook_id: any;
  id: string;
  correlation_id: string;
  severity: string;
  score: number;
  status: string;
  suggested_action: string;
  created_at: string;
};

function RiskPill({ risk }: { risk: string }) {
  const color = risk === "critical" ? "bg-red-600 text-white" :
                risk === "high" ? "bg-orange-500 text-white" :
                risk === "medium" ? "bg-yellow-400 text-black" :
                "bg-green-200 text-black";
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${color}`}>{risk.toUpperCase()}</span>;
}

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<FraudCase | null>(null);
  const [filters, setFilters] = useState({ risk: "all", country: "all", q: "", from: "", to: "" });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<any>(null);

  // WebSocket connection for real-time alerts
  useEffect(() => {
    const token = localStorage.getItem("molam_jwt") || "test-token"; // Replace with actual JWT
    const ws = createWS((import.meta.env.VITE_WS_URL || "ws://localhost:4000") + "/ws/alerts", token, (msg: any) => {
      if (msg.type === "alert") setAlerts(a => [msg.payload, ...a].slice(0, 500));
      if (msg.type === "case_created") {
        // Refresh cases when new case is created
        fetchCases();
      }
    });
    wsRef.current = ws;
    setConnected(true);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Fetch fraud cases from API
  const fetchCases = async () => {
    try {
      const response = await fetch("/api/fraud/cases");
      const data = await response.json();
      setCases(data);
    } catch (error) {
      console.error("Failed to fetch cases:", error);
    }
  };

  // Initial data load
  useEffect(() => {
    fetchCases();
  }, []);

  // Filter alerts based on filter criteria
  const filteredAlerts = alerts.filter(alert =>
    (filters.risk === "all" || alert.risk === filters.risk) &&
    (!filters.q || alert.userId.includes(filters.q) || alert.txnId.includes(filters.q))
  );

  // Search alerts with backend API
  async function searchAlerts() {
    const q = new URLSearchParams();
    if (filters.risk !== "all") q.set("risk", filters.risk);
    if (filters.country !== "all") q.set("country", filters.country);
    if (filters.q) q.set("q", filters.q);
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    
    try {
      const res = await fetch(`/api/alerts/search?${q.toString()}`, { 
        headers: { Authorization: `Bearer ${localStorage.getItem("molam_jwt")}` }
      });
      const data = await res.json();
      setAlerts(data.rows || []);
    } catch (error) {
      console.error("Search failed:", error);
    }
  }

  // Create fraud case from alert
  async function createCase(txnId: string, userId: string) {
    const body = { 
      txnId, 
      userId, 
      summary: "Auto created from UI", 
      severity: "high",
      correlation_id: txnId,
      origin_module: "pay",
      entity_type: "transaction",
      entity_id: txnId,
      score: 0.95,
      suggested_action: "review"
    };
    
    try {
      const res = await fetch("/api/fraud/cases", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("molam_jwt")}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      alert("Case created successfully!");
      fetchCases(); // Refresh cases list
    } catch (error) {
      console.error("Failed to create case:", error);
      alert("Failed to create case");
    }
  }

  // Freeze request (multi-sig)
  async function freezeRequest(userId: string, reason: string) {
    try {
      const res = await fetch("/api/fraud/actions/freeze-request", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("molam_jwt")}`
        },
        body: JSON.stringify({ userId, reason })
      });
      const data = await res.json();
      alert(`Freeze request created: ${data.reqId}`);
    } catch (error) {
      console.error("Freeze request failed:", error);
      alert("Freeze request failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Molam Fraud Ops Console</h1>
            <p className="text-gray-600">Brique 40 - Operationalize Fraud Console</p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs ${connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Real-time Alerts Panel */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Real-time Alerts</h2>
              <button 
                onClick={() => setAlerts([])}
                className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
              >
                Clear
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center mb-4 p-3 bg-gray-50 rounded">
              <select 
                value={filters.risk} 
                onChange={e => setFilters({...filters, risk: e.target.value})}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">All risks</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              
              <input 
                placeholder="Search userId/txnId" 
                value={filters.q} 
                onChange={e => setFilters({...filters, q: e.target.value})}
                className="border rounded px-2 py-1 text-sm"
              />
              
              <input 
                type="date"
                value={filters.from} 
                onChange={e => setFilters({...filters, from: e.target.value})}
                className="border rounded px-2 py-1 text-sm"
              />
              
              <input 
                type="date"
                value={filters.to} 
                onChange={e => setFilters({...filters, to: e.target.value})}
                className="border rounded px-2 py-1 text-sm"
              />
              
              <button 
                onClick={searchAlerts}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Search
              </button>
            </div>

            {/* Alerts List */}
            <div className="max-h-[600px] overflow-y-auto">
              {filteredAlerts.map((alert, i) => (
                <div key={alert.txnId + i} className="flex items-start gap-4 p-3 border-b hover:bg-gray-50">
                  <div className="w-12">
                    <div className="text-xs text-gray-500">Txn</div>
                    <div className="font-mono text-sm">{alert.txnId.slice(-8)}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-semibold">{alert.userId}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(alert.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{alert.amount} {alert.currency}</div>
                        <div className="mt-1"><RiskPill risk={alert.risk} /></div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {alert.rule} • {alert.meta?.ip ?? ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => createCase(alert.txnId, alert.userId)}
                      className="px-3 py-1 text-xs border rounded hover:bg-gray-100"
                    >
                      Investigate
                    </button>
                    <button 
                      onClick={() => freezeRequest(alert.userId, "Suspicious activity detected")}
                      className="px-3 py-1 text-xs bg-red-50 border rounded hover:bg-red-100"
                    >
                      Block
                    </button>
                  </div>
                </div>
              ))}
              {filteredAlerts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No alerts yet — waiting for Kafka stream...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fraud Cases Panel */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Fraud Cases</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">ID</th>
                    <th className="text-left p-2">Severity</th>
                    <th className="text-left p-2">Score</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((caseItem) => (
                    <tr 
                      key={caseItem.id} 
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedCase(caseItem)}
                    >
                      <td className="p-2 text-sm">{caseItem.id.slice(0, 8)}...</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          caseItem.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          caseItem.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          caseItem.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {caseItem.severity}
                        </span>
                      </td>
                      <td className="p-2">{caseItem.score}</td>
                      <td className="p-2">{caseItem.status}</td>
                      <td className="p-2">{caseItem.suggested_action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cases.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No fraud cases yet
                </div>
              )}
            </div>
          </div>

          {/* Case Details Panel */}
          {selectedCase ? (
            <div className="mt-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Case Details</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Case ID</label>
                  <p className="text-sm text-gray-900">{selectedCase.id}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Severity</label>
                  <p className="text-sm text-gray-900">{selectedCase.severity}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Score</label>
                  <p className="text-sm text-gray-900">{selectedCase.score}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className="text-sm text-gray-900">{selectedCase.status}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Suggested Action</label>
                  <p className="text-sm text-gray-900">{selectedCase.suggested_action}</p>
                </div>

                <div className="pt-4">
                  <button
                    onClick={async () => {
                      const idempotencyKey = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      try {
                        await fetch(`/api/fraud/cases/${selectedCase.id}/execute_playbook`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Idempotency-Key': idempotencyKey
                          },
                          body: JSON.stringify({ playbook_id: selectedCase.playbook_id })
                        });
                        alert("Playbook triggered");
                        fetchCases();
                      } catch (error) {
                        console.error("Failed to execute playbook:", error);
                        alert("Failed to execute playbook");
                      }
                    }}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Execute Playbook
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 bg-white rounded-lg shadow p-6">
              <p className="text-gray-500">Select a case to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}