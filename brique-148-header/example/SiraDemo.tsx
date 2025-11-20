/**
 * SIRA Param Advisor Demo
 * Demonstrates AI-powered menu optimization
 */
import React, { useState } from 'react';
import { Header, UIConfigProvider } from '../src';
import { useSiraAdvisor } from '../src/hooks/useSiraAdvisor';
import type { UserRole } from '../src/hooks/useRBAC';

function SiraDemo() {
  const [role, setRole] = useState<UserRole>('ops');
  const userId = 'demo-user-123';

  const {
    optimizedMenu,
    recommendations,
    alerts,
    patterns,
    criticalAlertsCount,
    highImpactRecommendations,
    logUsage,
    analyze,
    exportAnalytics
  } = useSiraAdvisor(role, userId, {
    autoOptimize: false, // Manual approval for demo
    realTimeAnalysis: true
  });

  // Simulate user actions
  const simulateUsage = () => {
    // Simulate normal usage
    logUsage('profile', 'SN');
    logUsage('payments', 'SN');
    logUsage('payments', 'SN');
    logUsage('security', 'SN');

    // Simulate rare usage
    logUsage('campaigns', 'SN');

    // Simulate potential abuse (only for non-owner roles)
    if (role !== 'owner') {
      for (let i = 0; i < 60; i++) {
        logUsage('rbac', 'SN');
      }
    }

    analyze();
  };

  const analytics = exportAnalytics();

  return (
    <UIConfigProvider>
      <div className="min-h-screen bg-gray-50">
        <Header role={role} userName="SIRA Demo User" userEmail="demo@molam.io" />

        <main className="pt-20 px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                SIRA Param Advisor Demo
              </h1>
              <p className="text-gray-600">
                AI-powered menu optimization based on usage patterns
              </p>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Controls
              </h2>

              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="owner">Owner</option>
                    <option value="ops">Ops</option>
                    <option value="finance">Finance</option>
                    <option value="merchant">Merchant</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button
                    onClick={simulateUsage}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Simulate Usage
                  </button>

                  <button
                    onClick={analyze}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Run Analysis
                  </button>
                </div>
              </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🚨</span>
                  <h2 className="text-lg font-semibold text-red-900">
                    Security Alerts ({criticalAlertsCount} critical)
                  </h2>
                </div>

                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 border-red-300'
                          : alert.severity === 'high'
                          ? 'bg-orange-100 border-orange-300'
                          : 'bg-yellow-100 border-yellow-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {alert.type.toUpperCase()} - {alert.featureId}
                          </p>
                          <p className="text-sm text-gray-700 mt-1">
                            {alert.description}
                          </p>
                        </div>
                        <span className="text-xs font-semibold uppercase px-2 py-1 rounded bg-white">
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                SIRA Recommendations ({highImpactRecommendations.length} high impact)
              </h2>

              {recommendations.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No recommendations yet. Click "Simulate Usage" to generate data.
                </p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-shrink-0">
                        {rec.type === 'hide' && <span className="text-2xl">👁️‍🗨️</span>}
                        {rec.type === 'highlight' && <span className="text-2xl">⭐</span>}
                        {rec.type === 'alert' && <span className="text-2xl">⚠️</span>}
                        {rec.type === 'reorder' && <span className="text-2xl">🔄</span>}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 capitalize">
                            {rec.type}
                          </span>
                          <span className="text-sm text-gray-600">
                            {rec.featureId}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              rec.impact === 'high'
                                ? 'bg-red-100 text-red-700'
                                : rec.impact === 'medium'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {rec.impact}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{rec.reason}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Confidence: {rec.confidence}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage Patterns */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Usage Patterns
              </h2>

              {patterns.length === 0 ? (
                <p className="text-gray-500 text-sm">No usage data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Feature
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Total Calls
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Unique Users
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Avg/User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Trend
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {patterns
                        .sort((a, b) => b.totalCalls - a.totalCalls)
                        .map((pattern) => (
                          <tr key={pattern.featureId}>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {pattern.featureId}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {pattern.totalCalls}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {pattern.uniqueUsers}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {pattern.avgCallsPerUser.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  pattern.trend === 'increasing'
                                    ? 'bg-green-100 text-green-800'
                                    : pattern.trend === 'decreasing'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {pattern.trend === 'increasing' && '📈'}
                                {pattern.trend === 'decreasing' && '📉'}
                                {pattern.trend === 'stable' && '➡️'}
                                {' '}
                                {pattern.trend}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Analytics Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Analytics Summary
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {analytics.summary.totalUsers}
                  </p>
                  <p className="text-sm text-gray-600">Total Users</p>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {analytics.summary.totalActions}
                  </p>
                  <p className="text-sm text-gray-600">Total Actions</p>
                </div>

                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">
                    {analytics.summary.activeFeatures}
                  </p>
                  <p className="text-sm text-gray-600">Active Features</p>
                </div>

                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">
                    {analytics.summary.inactiveFeatures}
                  </p>
                  <p className="text-sm text-gray-600">Inactive Features</p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Most Used Feature
                </h3>
                <p className="text-lg font-semibold text-gray-900">
                  {analytics.summary.mostUsedFeature}
                </p>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Usage by Role
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {Object.entries(analytics.usageByRole).map(([role, count]) => (
                    <div key={role} className="text-sm">
                      <span className="font-medium capitalize">{role}:</span>{' '}
                      <span className="text-gray-600">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </UIConfigProvider>
  );
}

export default SiraDemo;
