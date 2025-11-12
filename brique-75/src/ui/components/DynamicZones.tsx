/**
 * Sous-Brique 75bis - Dynamic Sales Zones UI
 *
 * React component for managing sales zones with Sira AI recommendations:
 * - Configure allowed/excluded countries, regions, cities
 * - View zone performance analytics
 * - Review Sira AI recommendations
 * - Apply or ignore recommendations
 * - View restriction logs
 *
 * @module DynamicZones
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface SalesZone {
  id: string;
  merchant_id: string;
  allowed_countries: string[];
  excluded_countries: string[];
  allowed_regions: string[];
  excluded_regions: string[];
  allowed_cities: string[];
  excluded_cities: string[];
  auto_recommend: boolean;
  last_sira_analysis?: string;
}

interface SiraRecommendation {
  id: string;
  recommendation_type: 'suspend' | 'expand' | 'restrict' | 'monitor';
  zone_type: 'country' | 'region' | 'city';
  zone_identifier: string;
  reason: string;
  confidence_score: number;
  fraud_rate?: number;
  chargeback_rate?: number;
  conversion_rate?: number;
  transaction_volume_30d?: number;
  estimated_revenue_impact?: number;
  status: 'pending' | 'applied' | 'ignored' | 'expired';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  expires_at: string;
}

interface ZonePerformance {
  zone_identifier: string;
  total_transactions: number;
  fraud_rate: number;
  chargeback_rate: number;
  success_rate: number;
  avg_amount: number;
  unique_customers: number;
}

interface ZoneRestrictionLog {
  id: string;
  action: string;
  zone_identifier: string;
  triggered_by: string;
  reason: string;
  created_at: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================================================
// COUNTRY METADATA
// ============================================================================

const COUNTRY_FLAGS: Record<string, string> = {
  SN: '🇸🇳', CI: '🇨🇮', NG: '🇳🇬', KE: '🇰🇪', GH: '🇬🇭', UG: '🇺🇬',
  TZ: '🇹🇿', ZA: '🇿🇦', MA: '🇲🇦', EG: '🇪🇬', FR: '🇫🇷', US: '🇺🇸',
  GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', BR: '🇧🇷',
};

const COUNTRY_NAMES: Record<string, string> = {
  SN: 'Senegal', CI: 'Côte d\'Ivoire', NG: 'Nigeria', KE: 'Kenya',
  GH: 'Ghana', UG: 'Uganda', TZ: 'Tanzania', ZA: 'South Africa',
  MA: 'Morocco', EG: 'Egypt', FR: 'France', US: 'United States',
  GB: 'United Kingdom', DE: 'Germany', ES: 'Spain', IT: 'Italy',
  PT: 'Portugal', BR: 'Brazil',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DynamicZones: React.FC<{ merchantId: string }> = ({ merchantId }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'recommendations' | 'performance' | 'logs'>('config');
  const [zones, setZones] = useState<SalesZone | null>(null);
  const [recommendations, setRecommendations] = useState<SiraRecommendation[]>([]);
  const [performance, setPerformance] = useState<ZonePerformance[]>([]);
  const [logs, setLogs] = useState<ZoneRestrictionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadAll();
  }, [merchantId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadZones(),
        loadRecommendations(),
        loadPerformance(),
        loadLogs(),
      ]);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadZones = async () => {
    const response = await apiClient.get(`/connect/${merchantId}/zones`);
    setZones(response.data.zones);
  };

  const loadRecommendations = async () => {
    const response = await apiClient.get(`/connect/${merchantId}/zones/recommendations`);
    setRecommendations(response.data.recommendations);
  };

  const loadPerformance = async () => {
    const response = await apiClient.get(`/connect/${merchantId}/zones/performance?days=30`);
    setPerformance(response.data.performance);
  };

  const loadLogs = async () => {
    const response = await apiClient.get(`/connect/${merchantId}/zones/logs?limit=20`);
    setLogs(response.data.logs);
  };

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    try {
      await apiClient.post(`/connect/${merchantId}/zones/analyze`);
      await loadRecommendations();
      alert('Analysis completed! Check recommendations tab.');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading zones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">🌍 Dynamic Sales Zones</h1>
          <p className="mt-2 text-gray-600">AI-powered zone management with Sira recommendations</p>
        </div>
        <button
          onClick={triggerAnalysis}
          disabled={analyzing}
          className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span>🤖</span>
          <span>{analyzing ? 'Analyzing...' : 'Run Sira Analysis'}</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-gray-200 mb-6">
        <TabButton
          active={activeTab === 'config'}
          onClick={() => setActiveTab('config')}
          icon="⚙️"
          label="Configuration"
          badge={zones?.auto_recommend ? '🤖 Auto' : undefined}
        />
        <TabButton
          active={activeTab === 'recommendations'}
          onClick={() => setActiveTab('recommendations')}
          icon="💡"
          label="Recommendations"
          badge={recommendations.filter(r => r.status === 'pending').length.toString()}
        />
        <TabButton
          active={activeTab === 'performance'}
          onClick={() => setActiveTab('performance')}
          icon="📊"
          label="Performance"
        />
        <TabButton
          active={activeTab === 'logs'}
          onClick={() => setActiveTab('logs')}
          icon="📜"
          label="Logs"
        />
      </div>

      {/* Content */}
      {activeTab === 'config' && <ZoneConfiguration merchantId={merchantId} zones={zones} onUpdate={loadZones} />}
      {activeTab === 'recommendations' && (
        <SiraRecommendations
          merchantId={merchantId}
          recommendations={recommendations}
          onUpdate={() => {
            loadRecommendations();
            loadZones();
            loadLogs();
          }}
        />
      )}
      {activeTab === 'performance' && <ZonePerformanceView performance={performance} />}
      {activeTab === 'logs' && <ZoneLogsView logs={logs} />}
    </div>
  );
};

// ============================================================================
// TAB BUTTON
// ============================================================================

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition-colors relative
      ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}
    `}
  >
    <span className="text-xl">{icon}</span>
    <span>{label}</span>
    {badge && (
      <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
        {badge}
      </span>
    )}
  </button>
);

// ============================================================================
// ZONE CONFIGURATION
// ============================================================================

const ZoneConfiguration: React.FC<{
  merchantId: string;
  zones: SalesZone | null;
  onUpdate: () => void;
}> = ({ merchantId, zones, onUpdate }) => {
  const [formData, setFormData] = useState({
    allowed_countries: zones?.allowed_countries?.join(', ') || '',
    excluded_countries: zones?.excluded_countries?.join(', ') || '',
    allowed_regions: zones?.allowed_regions?.join(', ') || '',
    excluded_regions: zones?.excluded_regions?.join(', ') || '',
    auto_recommend: zones?.auto_recommend ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/connect/${merchantId}/zones`, {
        allowed_countries: formData.allowed_countries.split(',').map(c => c.trim()).filter(Boolean),
        excluded_countries: formData.excluded_countries.split(',').map(c => c.trim()).filter(Boolean),
        allowed_regions: formData.allowed_regions.split(',').map(r => r.trim()).filter(Boolean),
        excluded_regions: formData.excluded_regions.split(',').map(r => r.trim()).filter(Boolean),
        auto_recommend: formData.auto_recommend,
      });
      onUpdate();
      alert('Zones updated successfully!');
    } catch (error) {
      console.error('Failed to save zones:', error);
      alert('Failed to save zones');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Zone Configuration</h2>

      <div className="space-y-6">
        {/* Allowed Countries */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Allowed Countries (comma-separated ISO codes)
          </label>
          <input
            type="text"
            value={formData.allowed_countries}
            onChange={(e) => setFormData({ ...formData, allowed_countries: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="SN, CI, NG, KE, GH"
          />
          <p className="mt-1 text-sm text-gray-500">Example: SN, CI, NG, KE (leave empty for all countries)</p>
        </div>

        {/* Excluded Countries */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Excluded Countries (comma-separated ISO codes)
          </label>
          <input
            type="text"
            value={formData.excluded_countries}
            onChange={(e) => setFormData({ ...formData, excluded_countries: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="XX, YY"
          />
          <p className="mt-1 text-sm text-gray-500">Countries to block due to fraud or regulations</p>
        </div>

        {/* Allowed Regions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Allowed Regions
          </label>
          <input
            type="text"
            value={formData.allowed_regions}
            onChange={(e) => setFormData({ ...formData, allowed_regions: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="WAEMU, EU, ASEAN"
          />
          <p className="mt-1 text-sm text-gray-500">Regional groups: WAEMU, EU, ASEAN, SADC, etc.</p>
        </div>

        {/* Auto-Recommend */}
        <div className="flex items-center space-x-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <input
            type="checkbox"
            checked={formData.auto_recommend}
            onChange={(e) => setFormData({ ...formData, auto_recommend: e.target.checked })}
            className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
          />
          <div>
            <label className="font-medium text-gray-900">Enable Sira Auto-Recommendations</label>
            <p className="text-sm text-gray-600 mt-1">
              Sira AI will analyze your zones and suggest suspensions for high-fraud areas or expansions for high-growth markets
            </p>
          </div>
        </div>

        {/* Last Analysis */}
        {zones?.last_sira_analysis && (
          <div className="text-sm text-gray-600">
            Last Sira Analysis: {new Date(zones.last_sira_analysis).toLocaleString()}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SIRA RECOMMENDATIONS
// ============================================================================

const SiraRecommendations: React.FC<{
  merchantId: string;
  recommendations: SiraRecommendation[];
  onUpdate: () => void;
}> = ({ merchantId, recommendations, onUpdate }) => {
  const [applying, setApplying] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');

  const pendingRecs = recommendations.filter(r => r.status === 'pending');
  const appliedRecs = recommendations.filter(r => r.status === 'applied');
  const ignoredRecs = recommendations.filter(r => r.status === 'ignored');

  const handleApply = async (recId: string) => {
    if (!confirm('Apply this recommendation? This will update your zone configuration.')) return;

    setApplying(recId);
    try {
      await apiClient.post(`/connect/${merchantId}/zones/recommendations/${recId}/apply`);
      onUpdate();
      alert('Recommendation applied successfully!');
    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      alert('Failed to apply recommendation');
    } finally {
      setApplying(null);
    }
  };

  const handleIgnore = async (recId: string) => {
    if (!ignoreReason || ignoreReason.length < 10) {
      alert('Please provide a reason (min 10 characters)');
      return;
    }

    try {
      await apiClient.post(`/connect/${merchantId}/zones/recommendations/${recId}/ignore`, {
        reason: ignoreReason,
      });
      onUpdate();
      setIgnoring(null);
      setIgnoreReason('');
      alert('Recommendation ignored');
    } catch (error) {
      console.error('Failed to ignore recommendation:', error);
      alert('Failed to ignore recommendation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Recommendations */}
      <div className="bg-white rounded-xl shadow-sm p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
          Pending Recommendations ({pendingRecs.length})
        </h2>

        {pendingRecs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <span className="text-5xl mb-4 block">✨</span>
            <p>No pending recommendations</p>
            <p className="text-sm mt-2">Run Sira Analysis to get AI-powered suggestions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRecs.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                onApply={() => handleApply(rec.id)}
                onIgnore={() => setIgnoring(rec.id)}
                applying={applying === rec.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ignore Modal */}
      {ignoring && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Ignore Recommendation</h3>
            <p className="text-gray-600 mb-4">Please provide a reason for ignoring this recommendation:</p>
            <textarea
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., This market is strategic despite higher fraud rate..."
            />
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setIgnoring(null);
                  setIgnoreReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleIgnore(ignoring)}
                disabled={ignoreReason.length < 10}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Applied & Ignored History */}
      {(appliedRecs.length > 0 || ignoredRecs.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">History</h3>

          {appliedRecs.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-green-700 mb-2">✅ Applied ({appliedRecs.length})</h4>
              <div className="space-y-2">
                {appliedRecs.slice(0, 5).map(rec => (
                  <div key={rec.id} className="text-sm text-gray-600 p-2 bg-green-50 rounded">
                    {getRecIcon(rec.recommendation_type)} {rec.zone_identifier} - {rec.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ignoredRecs.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">⏭️ Ignored ({ignoredRecs.length})</h4>
              <div className="space-y-2">
                {ignoredRecs.slice(0, 5).map(rec => (
                  <div key={rec.id} className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                    {getRecIcon(rec.recommendation_type)} {rec.zone_identifier} - {rec.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RecommendationCard: React.FC<{
  recommendation: SiraRecommendation;
  onApply: () => void;
  onIgnore: () => void;
  applying: boolean;
}> = ({ recommendation: rec, onApply, onIgnore, applying }) => {
  const priorityColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const typeColors = {
    suspend: 'bg-red-50 border-red-200',
    expand: 'bg-green-50 border-green-200',
    restrict: 'bg-orange-50 border-orange-200',
    monitor: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`border-2 rounded-lg p-6 ${typeColors[rec.recommendation_type]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <span className="text-3xl">{getRecIcon(rec.recommendation_type)}</span>
            <div>
              <h3 className="font-semibold text-lg text-gray-900">
                {COUNTRY_FLAGS[rec.zone_identifier] || '🌍'} {COUNTRY_NAMES[rec.zone_identifier] || rec.zone_identifier}
              </h3>
              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${priorityColors[rec.priority]}`}>
                {rec.priority.toUpperCase()} PRIORITY
              </span>
            </div>
          </div>

          <p className="text-gray-700 mb-4">{rec.reason}</p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {rec.fraud_rate !== undefined && (
              <div>
                <div className="text-xs text-gray-600">Fraud Rate</div>
                <div className="font-semibold text-red-600">{(rec.fraud_rate * 100).toFixed(2)}%</div>
              </div>
            )}
            {rec.conversion_rate !== undefined && (
              <div>
                <div className="text-xs text-gray-600">Conversion</div>
                <div className="font-semibold text-green-600">{(rec.conversion_rate * 100).toFixed(2)}%</div>
              </div>
            )}
            {rec.transaction_volume_30d !== undefined && (
              <div>
                <div className="text-xs text-gray-600">Volume (30d)</div>
                <div className="font-semibold">{rec.transaction_volume_30d.toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Confidence: {(rec.confidence_score * 100).toFixed(0)}%</span>
            {rec.estimated_revenue_impact && (
              <span>
                Impact: {rec.estimated_revenue_impact > 0 ? '+' : ''}
                {rec.estimated_revenue_impact.toLocaleString()} XOF
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col space-y-2 ml-4">
          <button
            onClick={onApply}
            disabled={applying}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
          <button
            onClick={onIgnore}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
};

function getRecIcon(type: string): string {
  const icons = {
    suspend: '🚫',
    expand: '🚀',
    restrict: '⚠️',
    monitor: '👁️',
  };
  return icons[type as keyof typeof icons] || '💡';
}

// ============================================================================
// ZONE PERFORMANCE VIEW
// ============================================================================

const ZonePerformanceView: React.FC<{ performance: ZonePerformance[] }> = ({ performance }) => {
  // Sort by total volume
  const sorted = [...performance].sort((a, b) => b.total_transactions - a.total_transactions);

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Zone Performance (Last 30 Days)</h2>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <span className="text-5xl mb-4 block">📊</span>
          <p>No performance data yet</p>
          <p className="text-sm mt-2">Data will appear as transactions are processed</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">Zone</th>
                <th className="text-right py-3 px-4">Transactions</th>
                <th className="text-right py-3 px-4">Success Rate</th>
                <th className="text-right py-3 px-4">Fraud Rate</th>
                <th className="text-right py-3 px-4">Chargeback</th>
                <th className="text-right py-3 px-4">Avg Amount</th>
                <th className="text-right py-3 px-4">Customers</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((perf) => (
                <tr key={perf.zone_identifier} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">
                    {COUNTRY_FLAGS[perf.zone_identifier] || '🌍'}{' '}
                    {COUNTRY_NAMES[perf.zone_identifier] || perf.zone_identifier}
                  </td>
                  <td className="text-right py-3 px-4">{perf.total_transactions.toLocaleString()}</td>
                  <td className="text-right py-3 px-4">
                    <span className={perf.success_rate > 0.9 ? 'text-green-600 font-semibold' : ''}>
                      {(perf.success_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    <span className={perf.fraud_rate > 0.1 ? 'text-red-600 font-semibold' : ''}>
                      {(perf.fraud_rate * 100).toFixed(2)}%
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">{(perf.chargeback_rate * 100).toFixed(2)}%</td>
                  <td className="text-right py-3 px-4">{perf.avg_amount?.toLocaleString()} XOF</td>
                  <td className="text-right py-3 px-4">{perf.unique_customers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ZONE LOGS VIEW
// ============================================================================

const ZoneLogsView: React.FC<{ logs: ZoneRestrictionLog[] }> = ({ logs }) => {
  const actionIcons: Record<string, string> = {
    suspend: '🚫',
    activate: '✅',
    restrict: '⚠️',
    unrestrict: '🔓',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Zone Restriction Logs</h2>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <span className="text-5xl mb-4 block">📜</span>
          <p>No logs yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-4">
                <span className="text-2xl">{actionIcons[log.action] || '📝'}</span>
                <div>
                  <div className="font-medium">
                    {COUNTRY_FLAGS[log.zone_identifier] || '🌍'} {log.zone_identifier} - {log.action}
                  </div>
                  <div className="text-sm text-gray-600">{log.reason}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Triggered by: {log.triggered_by} • {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DynamicZones;
