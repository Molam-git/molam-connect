// ============================================================================
// Fee Rules Editor - Ops UI
// ============================================================================

import React, { useEffect, useState } from "react";

interface FeeRule {
  id: string;
  name: string;
  module: string;
  event_type: string;
  country?: string;
  currency?: string;
  percent: number;
  fixed_amount: number;
  min_amount?: number;
  max_amount?: number;
  agent_share_percent: number;
  active: boolean;
  priority: number;
  valid_from?: string;
  valid_until?: string;
  created_at: string;
}

interface SimulationResult {
  total_fee: string;
  breakdown: Array<{
    name: string;
    fee: string;
    percent: string;
    fixed: string;
  }>;
}

export default function FeeRulesEditor() {
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<FeeRule | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);

  // Simulator state
  const [simModule, setSimModule] = useState("wallet");
  const [simEventType, setSimEventType] = useState("p2p");
  const [simAmount, setSimAmount] = useState("100.00");
  const [simCurrency, setSimCurrency] = useState("USD");
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  async function fetchRules() {
    setLoading(true);
    try {
      const res = await fetch("/api/commissions/rules?limit=100");
      const data = await res.json();
      setRules(data);
    } catch (e) {
      console.error("Failed to fetch rules:", e);
    } finally {
      setLoading(false);
    }
  }

  async function saveRule() {
    if (!editingRule) return;

    try {
      const method = editingRule.id ? "PUT" : "POST";
      const url = editingRule.id
        ? `/api/commissions/rules/${editingRule.id}`
        : "/api/commissions/rules";

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRule),
      });

      setEditingRule(null);
      fetchRules();
    } catch (e) {
      alert("Failed to save rule");
    }
  }

  async function toggleActive(rule: FeeRule) {
    try {
      await fetch(`/api/commissions/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      fetchRules();
    } catch (e) {
      alert("Failed to toggle rule");
    }
  }

  async function runSimulation() {
    try {
      const res = await fetch("/api/commissions/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: simModule,
          event_type: simEventType,
          amount: simAmount,
          currency: simCurrency,
        }),
      });
      const data = await res.json();
      setSimResult(data);
    } catch (e) {
      alert("Simulation failed");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fee Rules Management</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showSimulator ? "Hide Simulator" : "Fee Simulator"}
          </button>
          <button
            onClick={() =>
              setEditingRule({
                id: "",
                name: "",
                module: "wallet",
                event_type: "p2p",
                percent: 0,
                fixed_amount: 0,
                agent_share_percent: 0,
                active: true,
                priority: 10,
                created_at: "",
              } as FeeRule)
            }
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            + New Rule
          </button>
        </div>
      </div>

      {/* Simulator Panel */}
      {showSimulator && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Fee Simulator</h2>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Module</label>
              <select
                value={simModule}
                onChange={(e) => setSimModule(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="wallet">Wallet</option>
                <option value="connect">Connect</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Event Type</label>
              <select
                value={simEventType}
                onChange={(e) => setSimEventType(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="p2p">P2P</option>
                <option value="merchant_payment">Merchant Payment</option>
                <option value="fx">FX Conversion</option>
                <option value="payout_instant">Instant Payout</option>
                <option value="cashin_other">Cash-in (other)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Currency</label>
              <input
                type="text"
                value={simCurrency}
                onChange={(e) => setSimCurrency(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
          <button
            onClick={runSimulation}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Calculate Fee
          </button>

          {simResult && (
            <div className="mt-4 p-3 bg-white border rounded">
              <div className="text-lg font-semibold mb-2">
                Total Fee: {simResult.total_fee} {simCurrency}
              </div>
              {simResult.breakdown.map((b, i) => (
                <div key={i} className="text-sm text-gray-600">
                  {b.name}: {b.fee} ({b.percent}% + {b.fixed} fixed)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingRule.id ? "Edit Rule" : "Create Rule"}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Module</label>
                <select
                  value={editingRule.module}
                  onChange={(e) => setEditingRule({ ...editingRule, module: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="wallet">Wallet</option>
                  <option value="connect">Connect</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Event Type</label>
                <select
                  value={editingRule.event_type}
                  onChange={(e) => setEditingRule({ ...editingRule, event_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="p2p">P2P</option>
                  <option value="merchant_payment">Merchant Payment</option>
                  <option value="fx">FX Conversion</option>
                  <option value="payout_instant">Instant Payout</option>
                  <option value="cashin_self">Cash-in (self)</option>
                  <option value="cashin_other">Cash-in (other)</option>
                  <option value="cashout">Cash-out</option>
                  <option value="bill_payment">Bill Payment</option>
                  <option value="topup">Topup</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Percent (decimal)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editingRule.percent}
                  onChange={(e) => setEditingRule({ ...editingRule, percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="0.0090 for 0.9%"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fixed Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingRule.fixed_amount}
                  onChange={(e) => setEditingRule({ ...editingRule, fixed_amount: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Min Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingRule.min_amount || ""}
                  onChange={(e) => setEditingRule({ ...editingRule, min_amount: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Max Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingRule.max_amount || ""}
                  onChange={(e) => setEditingRule({ ...editingRule, max_amount: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Agent Share %</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingRule.agent_share_percent}
                  onChange={(e) => setEditingRule({ ...editingRule, agent_share_percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="0.30 for 30%"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Priority</label>
                <input
                  type="number"
                  value={editingRule.priority}
                  onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Country (optional)</label>
                <input
                  type="text"
                  value={editingRule.country || ""}
                  onChange={(e) => setEditingRule({ ...editingRule, country: e.target.value || undefined })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="SN, CI, etc."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Currency (optional)</label>
                <input
                  type="text"
                  value={editingRule.currency || ""}
                  onChange={(e) => setEditingRule({ ...editingRule, currency: e.target.value || undefined })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="XOF, USD, etc."
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingRule.active}
                    onChange={(e) => setEditingRule({ ...editingRule, active: e.target.checked })}
                  />
                  <span className="text-sm text-gray-600">Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingRule(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Percent</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fixed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : rules.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No rules found</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold">{rule.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-1 text-xs rounded ${rule.module === 'wallet' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {rule.module}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{rule.event_type}</td>
                  <td className="px-4 py-3 text-sm">{(rule.percent * 100).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-sm">{rule.fixed_amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">{(rule.agent_share_percent * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-sm">{rule.priority}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${rule.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                      {rule.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingRule(rule)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(rule)}
                        className="text-yellow-600 hover:underline text-sm"
                      >
                        {rule.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
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
