/**
 * Brique 116quinquies: Dynamic A/B Routing - UI Console
 * Interface for managing and monitoring A/B routing tests
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ABTest {
  id: string;
  merchant_id: string;
  currency: string;
  primary_route: string;
  test_route: string;
  allocation_percent: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  start_date: string;
  end_date?: string;
  created_at: string;
}

interface ABPerformance {
  test_id: string;
  merchant_id: string;
  currency: string;
  primary_route: string;
  test_route: string;
  status: string;
  primary_count: number;
  primary_avg_latency: number;
  primary_avg_fee: number;
  primary_success_rate: number;
  test_count: number;
  test_avg_latency: number;
  test_avg_fee: number;
  test_success_rate: number;
  start_date: string;
  last_result_at: string;
}

interface ABRoutingConsoleProps {
  merchantId?: string;
  apiBaseUrl?: string;
}

export default function ABRoutingConsole({
  merchantId,
  apiBaseUrl = '/api/routing',
}: ABRoutingConsoleProps) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [performance, setPerformance] = useState<ABPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state for creating new test
  const [newTest, setNewTest] = useState({
    merchantId: merchantId || '',
    currency: 'XOF',
    primaryRoute: '',
    testRoute: '',
    allocationPercent: 5,
  });

  useEffect(() => {
    loadTests();
  }, [merchantId]);

  useEffect(() => {
    if (selectedTest) {
      loadPerformance(selectedTest.id);
    }
  }, [selectedTest]);

  const loadTests = async () => {
    try {
      setLoading(true);
      const url = merchantId
        ? `${apiBaseUrl}/ab-test/list?merchantId=${merchantId}`
        : `${apiBaseUrl}/ab-test/list`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setTests(data.tests);
        if (data.tests.length > 0 && !selectedTest) {
          setSelectedTest(data.tests[0]);
        }
      }
    } catch (error) {
      console.error('Error loading tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPerformance = async (testId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/ab-test/${testId}/performance`);
      const data = await res.json();

      if (data.success) {
        setPerformance(data.performance);
      }
    } catch (error) {
      console.error('Error loading performance:', error);
    }
  };

  const createTest = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/ab-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'ops', // À adapter selon votre système d'auth
        },
        body: JSON.stringify(newTest),
      });

      const data = await res.json();

      if (data.success) {
        setShowCreateModal(false);
        loadTests();
        setNewTest({
          merchantId: merchantId || '',
          currency: 'XOF',
          primaryRoute: '',
          testRoute: '',
          allocationPercent: 5,
        });
      } else {
        alert('Error creating test: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating test:', error);
      alert('Failed to create test');
    }
  };

  const updateTestStatus = async (testId: string, status: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/ab-test/${testId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'ops',
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (data.success) {
        loadTests();
      } else {
        alert('Error updating test: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating test:', error);
      alert('Failed to update test');
    }
  };

  const evaluateTest = async (testId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/ab-test/${testId}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'sira_admin',
        },
        body: JSON.stringify({ minTransactions: 100, autoApply: false }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`Decision: ${data.decision.winning_route} wins!\n${data.decision.decision_reason}`);
        loadTests();
      } else {
        alert('Evaluation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error evaluating test:', error);
      alert('Failed to evaluate test');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPercent = (value: number | null | undefined) => {
    return value ? (value * 100).toFixed(2) + '%' : 'N/A';
  };

  const formatNumber = (value: number | null | undefined, decimals = 2) => {
    return value ? value.toFixed(decimals) : 'N/A';
  };

  if (loading) {
    return <div className="p-6 text-center">Loading A/B tests...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">A/B Routing Experiments</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + New Test
        </button>
      </div>

      {/* Tests List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Test List */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-lg p-4">
          <h2 className="text-lg font-bold mb-4">Active Tests</h2>
          <div className="space-y-3">
            {tests.length === 0 ? (
              <p className="text-gray-500 text-sm">No tests found</p>
            ) : (
              tests.map((test) => (
                <div
                  key={test.id}
                  onClick={() => setSelectedTest(test)}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    selectedTest?.id === test.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-sm">{test.currency}</p>
                      <p className="text-xs text-gray-500">
                        {test.merchant_id.substring(0, 8)}...
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                        test.status
                      )}`}
                    >
                      {test.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    <p>
                      <strong>Primary:</strong> {test.primary_route}
                    </p>
                    <p>
                      <strong>Test:</strong> {test.test_route} ({test.allocation_percent}%)
                    </p>
                    <p className="text-gray-400 mt-1">
                      Started: {new Date(test.start_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Test Details & Performance */}
        <div className="lg:col-span-2 space-y-6">
          {selectedTest ? (
            <>
              {/* Test Details */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-bold">Test Details</h2>
                    <p className="text-sm text-gray-500">ID: {selectedTest.id}</p>
                  </div>
                  <div className="flex gap-2">
                    {selectedTest.status === 'active' && (
                      <>
                        <button
                          onClick={() => updateTestStatus(selectedTest.id, 'paused')}
                          className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                        >
                          Pause
                        </button>
                        <button
                          onClick={() => evaluateTest(selectedTest.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                        >
                          Evaluate
                        </button>
                      </>
                    )}
                    {selectedTest.status === 'paused' && (
                      <button
                        onClick={() => updateTestStatus(selectedTest.id, 'active')}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => updateTestStatus(selectedTest.id, 'completed')}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      Complete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Merchant ID</p>
                    <p className="font-mono">{selectedTest.merchant_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Currency</p>
                    <p className="font-semibold">{selectedTest.currency}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Primary Route</p>
                    <p className="font-semibold">{selectedTest.primary_route}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Test Route</p>
                    <p className="font-semibold">{selectedTest.test_route}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Allocation</p>
                    <p className="font-semibold">{selectedTest.allocation_percent}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                        selectedTest.status
                      )}`}
                    >
                      {selectedTest.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              {performance && (
                <>
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-bold mb-4">Performance Comparison</h2>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                      {/* Primary Route */}
                      <div className="border-r pr-4">
                        <h3 className="font-semibold text-lg mb-3 text-blue-700">
                          Primary: {performance.primary_route}
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Transactions:</span>
                            <span className="font-semibold">{performance.primary_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Success Rate:</span>
                            <span className="font-semibold">
                              {formatPercent(performance.primary_success_rate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Avg Latency:</span>
                            <span className="font-semibold">
                              {formatNumber(performance.primary_avg_latency, 0)}ms
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Avg Fee:</span>
                            <span className="font-semibold">
                              {formatPercent(performance.primary_avg_fee)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Test Route */}
                      <div className="pl-4">
                        <h3 className="font-semibold text-lg mb-3 text-green-700">
                          Test: {performance.test_route}
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Transactions:</span>
                            <span className="font-semibold">{performance.test_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Success Rate:</span>
                            <span className="font-semibold">
                              {formatPercent(performance.test_success_rate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Avg Latency:</span>
                            <span className="font-semibold">
                              {formatNumber(performance.test_avg_latency, 0)}ms
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Avg Fee:</span>
                            <span className="font-semibold">
                              {formatPercent(performance.test_avg_fee)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Chart */}
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={[
                          {
                            name: 'Success Rate',
                            Primary: (performance.primary_success_rate || 0) * 100,
                            Test: (performance.test_success_rate || 0) * 100,
                          },
                          {
                            name: 'Latency (ms)',
                            Primary: performance.primary_avg_latency || 0,
                            Test: performance.test_avg_latency || 0,
                          },
                          {
                            name: 'Fee (%)',
                            Primary: (performance.primary_avg_fee || 0) * 100,
                            Test: (performance.test_avg_fee || 0) * 100,
                          },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Primary" fill="#3b82f6" />
                        <Bar dataKey="Test" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center text-gray-500">
              Select a test to view details
            </div>
          )}
        </div>
      </div>

      {/* Create Test Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New A/B Test</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Merchant ID
                </label>
                <input
                  type="text"
                  value={newTest.merchantId}
                  onChange={(e) => setNewTest({ ...newTest, merchantId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="UUID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <input
                  type="text"
                  value={newTest.currency}
                  onChange={(e) => setNewTest({ ...newTest, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="XOF, EUR, USD..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Route
                </label>
                <input
                  type="text"
                  value={newTest.primaryRoute}
                  onChange={(e) => setNewTest({ ...newTest, primaryRoute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="bank_bci, stripe..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test Route</label>
                <input
                  type="text"
                  value={newTest.testRoute}
                  onChange={(e) => setNewTest({ ...newTest, testRoute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="bank_coris, adyen..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allocation % (Test Route)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={newTest.allocationPercent}
                  onChange={(e) =>
                    setNewTest({ ...newTest, allocationPercent: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={createTest}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Create Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
