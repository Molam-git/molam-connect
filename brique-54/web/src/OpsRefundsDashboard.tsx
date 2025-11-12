/**
 * Ops Refunds Dashboard
 * Analytics and rule management
 */
import React, { useEffect, useState } from "react";

interface RefundRule {
  id: string;
  merchant_id: string | null;
  max_refund_days: number;
  max_amount_without_approval: number;
  require_ops_approval_above: number;
  auto_refund_enabled: boolean;
  max_refund_percentage: number;
  sira_threshold: number;
}

export default function OpsRefundsDashboard() {
  const [rules, setRules] = useState<RefundRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<RefundRule | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/refund-rules", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();
      setRules(data.data || []);
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRule = async (rule: RefundRule) => {
    try {
      await fetch("/api/refund-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(rule),
      });

      fetchRules();
      setEditingRule(null);
      alert("Rule updated successfully");
    } catch (err) {
      console.error("Failed to update rule:", err);
      alert("Failed to update rule");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-semibold text-gray-900 mb-2">Ops Refund Dashboard</h1>
        <p className="text-gray-600">Manage refund rules and monitor abuse</p>
      </div>

      {/* Metrics Overview */}
      <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Pending Approvals</div>
          <div className="text-4xl font-bold">12</div>
          <div className="text-sm opacity-75 mt-2">Requires ops review</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">High Risk Refunds</div>
          <div className="text-4xl font-bold">3</div>
          <div className="text-sm opacity-75 mt-2">SIRA score &gt; 0.7</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Avg Processing Time</div>
          <div className="text-4xl font-bold">2.5h</div>
          <div className="text-sm opacity-75 mt-2">End-to-end</div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90 mb-2">Abuse Detection</div>
          <div className="text-4xl font-bold">1</div>
          <div className="text-sm opacity-75 mt-2">Merchants flagged</div>
        </div>
      </div>

      {/* Refund Rules */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Refund Rules Configuration</h2>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No rules found</div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div key={rule.id} className="border border-gray-200 rounded-xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {rule.merchant_id ? `Merchant ${rule.merchant_id.slice(0, 8)}...` : "Global Rules"}
                      </h3>
                    </div>
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Max Refund Days</div>
                      <div className="font-semibold text-gray-900">{rule.max_refund_days} days</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Max Without Approval</div>
                      <div className="font-semibold text-gray-900">${rule.max_amount_without_approval}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Ops Approval Above</div>
                      <div className="font-semibold text-gray-900">${rule.require_ops_approval_above}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Auto Refund</div>
                      <div className={`font-semibold ${rule.auto_refund_enabled ? 'text-green-600' : 'text-red-600'}`}>
                        {rule.auto_refund_enabled ? "Enabled" : "Disabled"}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Max Percentage</div>
                      <div className="font-semibold text-gray-900">{rule.max_refund_percentage}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">SIRA Threshold</div>
                      <div className="font-semibold text-gray-900">{rule.sira_threshold}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4">
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">Edit Refund Rule</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Refund Days
                </label>
                <input
                  type="number"
                  value={editingRule.max_refund_days}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, max_refund_days: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Amount Without Approval ($)
                </label>
                <input
                  type="number"
                  value={editingRule.max_amount_without_approval}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      max_amount_without_approval: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Require Ops Approval Above ($)
                </label>
                <input
                  type="number"
                  value={editingRule.require_ops_approval_above}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      require_ops_approval_above: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={editingRule.auto_refund_enabled}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, auto_refund_enabled: e.target.checked })
                  }
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label className="ml-2 text-sm font-medium text-gray-700">
                  Enable Auto Refund
                </label>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => handleUpdateRule(editingRule)}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditingRule(null)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
