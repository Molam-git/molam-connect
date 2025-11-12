/**
 * Anomalies Dashboard
 *
 * Shows SIRA-detected anomalies and fraud patterns
 */

import React, { useEffect, useState } from 'react';

interface Anomaly {
  id: string;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: string;
  entityId: string;
  description: string;
  details: {
    expectedRange: [number, number];
    actualValue: number;
    deviation: number;
    contributingFactors: string[];
  };
  suggestedAction: string;
  status: 'detected' | 'investigating' | 'resolved' | 'false_positive';
  detectedAt: string;
}

interface AnomalyStats {
  total: number;
  unresolved: number;
  critical: number;
  high: number;
  recent: number;
}

export default function Anomalies() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchAnomalies();
    fetchStats();
  }, [filter]);

  const fetchAnomalies = async () => {
    try {
      const url = filter === 'all'
        ? '/api/ai/anomalies'
        : `/api/ai/anomalies?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAnomalies(data.data);
      }
    } catch (error) {
      console.error('Error fetching anomalies:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/ai/anomalies/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const resolveAnomaly = async (id: string) => {
    const notes = prompt('Notes de résolution (optionnel):');
    try {
      const res = await fetch(`/api/ai/anomalies/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        await fetchAnomalies();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error resolving anomaly:', error);
    }
  };

  const markFalsePositive = async (id: string) => {
    if (!confirm('Marquer cette anomalie comme faux positif ?')) return;

    try {
      const res = await fetch(`/api/ai/anomalies/${id}/false-positive`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchAnomalies();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error marking false positive:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'critical') return 'bg-red-100 text-red-700 border-red-300';
    if (severity === 'high') return 'bg-orange-100 text-orange-700 border-orange-300';
    if (severity === 'medium') return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-blue-100 text-blue-700 border-blue-300';
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical') return '🚨';
    if (severity === 'high') return '⚠️';
    if (severity === 'medium') return '⚡';
    return 'ℹ️';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      suspicious_usage: 'Utilisation suspecte',
      sudden_spike: 'Pic soudain',
      fraud_pattern: 'Pattern de fraude',
      low_performance: 'Performance faible',
      market_shift: 'Changement de marché',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string) => {
    if (status === 'resolved') return 'bg-green-100 text-green-700';
    if (status === 'investigating') return 'bg-blue-100 text-blue-700';
    if (status === 'false_positive') return 'bg-gray-100 text-gray-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg opacity-70">Chargement des anomalies...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Détection d'Anomalies</h1>
        <p className="text-sm opacity-70 mt-1">
          Surveillance SIRA des patterns suspects et fraudes
        </p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Total</div>
            <div className="text-2xl font-bold mt-1">{stats.total}</div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Non résolues</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">{stats.unresolved}</div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Critiques</div>
            <div className="text-2xl font-bold mt-1 text-red-600">{stats.critical}</div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Élevées</div>
            <div className="text-2xl font-bold mt-1 text-orange-600">{stats.high}</div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Récentes (7j)</div>
            <div className="text-2xl font-bold mt-1">{stats.recent}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'detected', 'investigating', 'resolved', 'false_positive'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'Toutes' : f === 'detected' ? 'Détectées' : f === 'investigating' ? 'En investigation' : f === 'resolved' ? 'Résolues' : 'Faux positifs'}
          </button>
        ))}
      </div>

      {/* Anomalies List */}
      {anomalies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <div className="text-4xl mb-4">✅</div>
          <div className="text-lg font-medium mb-2">Aucune anomalie</div>
          <div className="text-sm opacity-70">
            {filter === 'all'
              ? 'Tout va bien ! Aucune anomalie détectée.'
              : `Aucune anomalie avec le statut "${filter}"`}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map((anomaly) => (
            <div
              key={anomaly.id}
              className={`p-6 bg-white rounded-xl shadow-sm border-2 ${getSeverityColor(anomaly.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{getSeverityIcon(anomaly.severity)}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-lg">
                          {getTypeLabel(anomaly.anomalyType)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(anomaly.status)}`}>
                          {anomaly.status}
                        </span>
                      </div>
                      <div className="text-sm opacity-70">
                        {anomaly.entityType} · ID: {anomaly.entityId.substring(0, 8)}...
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-3">
                    <div className="font-medium mb-1">{anomaly.description}</div>
                  </div>

                  {/* Details */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-3">
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <div className="text-xs opacity-70">Plage attendue</div>
                        <div className="font-medium">
                          {anomaly.details.expectedRange[0]} - {anomaly.details.expectedRange[1]}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs opacity-70">Valeur réelle</div>
                        <div className="font-medium text-red-600">
                          {anomaly.details.actualValue.toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs opacity-70">Déviation</div>
                        <div className="font-medium">
                          {(anomaly.details.deviation * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {anomaly.details.contributingFactors.length > 0 && (
                      <div>
                        <div className="text-xs opacity-70 mb-1">Facteurs contributifs:</div>
                        <ul className="text-sm space-y-1">
                          {anomaly.details.contributingFactors.map((factor, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="opacity-50">•</span>
                              <span>{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Suggested Action */}
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-sm font-medium mb-1">💡 Action suggérée:</div>
                    <div className="text-sm opacity-80">{anomaly.suggestedAction}</div>
                  </div>

                  <div className="text-xs opacity-50 mt-3">
                    Détectée: {new Date(anomaly.detectedAt).toLocaleString('fr-FR')}
                  </div>
                </div>

                {/* Actions */}
                {anomaly.status === 'detected' && (
                  <div className="ml-6 flex flex-col gap-2">
                    <button
                      onClick={() => resolveAnomaly(anomaly.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      ✅ Résoudre
                    </button>
                    <button
                      onClick={() => markFalsePositive(anomaly.id)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      ❌ Faux positif
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
