/**
 * Ops Radar Dashboard
 * Manage fraud prevention rules and monitor actions
 */
import React, { useEffect, useState } from "react";

interface RadarRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  scope: any;
  condition: string;
  action: any;
  priority: number;
  created_at: string;
}

export default function OpsRadarDashboard() {
  const [rules, setRules] = useState<RadarRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    condition: '{"and": [{">":[{"var":"amount"},500]},{"in":[{"var":"country"},["SN","CI"]]}]}',
    action: '{"type":"challenge","method":"otp","require_approval":false}',
    priority: 100,
    scope: "{}",
  });
  const [testData, setTestData] = useState({
    condition: "",
    sample_data: '{"amount":1000,"country":"SN","sira_score":0.3}',
  });
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/radar/rules", {
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

  const handleCreateRule = async () => {
    try {
      await fetch("/api/radar/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: newRule.name,
          description: newRule.description,
          condition: newRule.condition,
          action: JSON.parse(newRule.action),
          priority: newRule.priority,
          scope: JSON.parse(newRule.scope),
        }),
      });

      alert("Rule created successfully");
      setShowCreateModal(false);
      fetchRules();
    } catch (err) {
      console.error("Failed to create rule:", err);
      alert("Failed to create rule");
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await fetch(`/api/radar/rules/${ruleId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ enabled: !enabled }),
      });
      fetchRules();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  const handleTestRule = async () => {
    try {
      const response = await fetch("/api/radar/rules/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          condition: testData.condition,
          sample_data: JSON.parse(testData.sample_data),
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (err) {
      console.error("Failed to test rule:", err);
      alert("Failed to test rule");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-semibold text-gray-900 mb-2">Radar Engine</h1>
            <p className="text-gray-600">Fraud prevention rules and automated responses</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowTestModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg"
            >
              Test Rule
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg"
            >
              + Create Rule
            </button>
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No rules found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">{rule.priority}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">{rule.description || "N/A"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{rule.action?.type || "N/A"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                          rule.enabled
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggleRule(rule.id, rule.enabled)}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">Create Radar Rule</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="High Amount Foreign Transaction"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Flag high-value transactions from foreign countries"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition (JSONLogic)
                </label>
                <textarea
                  value={newRule.condition}
                  onChange={(e) => setNewRule({ ...newRule, condition: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  placeholder='{"and": [{">":[{"var":"amount"},500]}]}'
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action (JSON)</label>
                <textarea
                  value={newRule.action}
                  onChange={(e) => setNewRule({ ...newRule, action: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                  placeholder='{"type":"challenge","method":"otp"}'
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={newRule.priority}
                  onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleCreateRule}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              >
                Create Rule
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Rule Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full">
            <h3 className="text-2xl font-semibold text-gray-900 mb-6">Test Rule</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition (JSONLogic)
                </label>
                <textarea
                  value={testData.condition}
                  onChange={(e) => setTestData({ ...testData, condition: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sample Data (JSON)</label>
                <textarea
                  value={testData.sample_data}
                  onChange={(e) => setTestData({ ...testData, sample_data: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              {testResult && (
                <div
                  className={`p-4 rounded-lg ${
                    testResult.triggered ? "bg-red-100 border border-red-200" : "bg-green-100 border border-green-200"
                  }`}
                >
                  <div className="font-semibold mb-2">
                    Result: {testResult.triggered ? "TRIGGERED" : "NOT TRIGGERED"}
                  </div>
                  {testResult.error && <div className="text-sm text-red-600">Error: {testResult.error}</div>}
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleTestRule}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Test Rule
              </button>
              <button
                onClick={() => setShowTestModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
