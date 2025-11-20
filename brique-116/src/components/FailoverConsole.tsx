/**
 * Brique 116septies: AI Anomaly-Based Failover - Ops Console
 * Interface pour gérer les failovers automatiques et manuels
 */

import React, { useState, useEffect } from 'react';

interface Anomaly {
  id: string;
  connector_name: string;
  region: string;
  currency: string;
  detected_at: string;
  anomaly_type: string;
  anomaly_score: number;
  sira_decision: {
    recommendation: string;
    candidate: string;
    confidence: number;
    reason: string;
  };
  processed: boolean;
  current_success_rate: number;
  current_latency: number;
  connector_status: string;
}

interface FailoverAction {
  id: string;
  action_ref: string;
  connector_from: string;
  connector_to: string;
  region: string;
  currency: string;
  requested_by: string;
  requested_at: string;
  executed_at: string | null;
  status: string;
  sira_score: number;
}

interface FailoverConsoleProps {
  apiBaseUrl?: string;
}

export default function FailoverConsole({ apiBaseUrl = '/api/failover' }: FailoverConsoleProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [actions, setActions] = useState<FailoverAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'anomalies' | 'actions'>('anomalies');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadAnomalies(), loadActions()]);
    } finally {
      setLoading(false);
    }
  };

  const loadAnomalies = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/anomalies/pending`);
      const data = await res.json();
      if (data.success) {
        setAnomalies(data.pending);
      }
    } catch (error) {
      console.error('Error loading anomalies:', error);
    }
  };

  const loadActions = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/actions?limit=50`);
      const data = await res.json();
      if (data.success) {
        setActions(data.actions);
      }
    } catch (error) {
      console.error('Error loading actions:', error);
    }
  };

  const approveFailover = async (anomalyId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/anomalies/${anomalyId}/approve`, {
        method: 'POST',
        headers: { 'X-User-Id': 'ops-user' },
      });

      const data = await res.json();

      if (data.success) {
        alert('✅ Failover approuvé et créé!');
        loadData();
      } else {
        alert('❌ Erreur: ' + data.error);
      }
    } catch (error) {
      console.error('Error approving failover:', error);
      alert('❌ Erreur lors de l\'approbation');
    }
  };

  const executeFailover = async (actionId: string) => {
    if (!confirm('Exécuter ce failover maintenant?')) return;

    try {
      const res = await fetch(`${apiBaseUrl}/actions/${actionId}/execute`, {
        method: 'POST',
      });

      const data = await res.json();

      if (data.success) {
        alert('✅ Failover exécuté avec succès!');
        loadData();
      } else {
        alert('❌ Erreur: ' + data.error);
      }
    } catch (error) {
      console.error('Error executing failover:', error);
      alert('❌ Erreur lors de l\'exécution');
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 0.9) return 'bg-red-100 text-red-800 border-red-300';
    if (score >= 0.7) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'executing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && anomalies.length === 0) {
    return <div className="p-6 text-center">Chargement...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">🚨 Failover Console</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des anomalies et failovers automatiques par Sira
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setTab('anomalies')}
            className={`pb-3 px-1 font-medium transition ${
              tab === 'anomalies'
                ? 'border-b-2 border-red-500 text-red-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Anomalies ({anomalies.length})
          </button>
          <button
            onClick={() => setTab('actions')}
            className={`pb-3 px-1 font-medium transition ${
              tab === 'actions'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Actions Failover ({actions.length})
          </button>
        </div>
      </div>

      {/* Anomalies Tab */}
      {tab === 'anomalies' && (
        <div className="space-y-4">
          {anomalies.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-12 text-center">
              <p className="text-lg text-gray-500">✅ Aucune anomalie détectée</p>
              <p className="text-sm text-gray-400 mt-2">Tous les connecteurs fonctionnent normalement</p>
            </div>
          ) : (
            anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`bg-white rounded-xl shadow-lg p-6 border-l-4 ${getSeverityColor(
                  anomaly.anomaly_score
                )}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <h3 className="text-lg font-bold">
                          {anomaly.connector_name}
                          <span className="text-sm font-normal text-gray-500 ml-2">
                            {anomaly.region} / {anomaly.currency}
                          </span>
                        </h3>
                        <p className="text-xs text-gray-500">
                          Détecté: {new Date(anomaly.detected_at).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                      <div>
                        <p className="text-gray-500">Type</p>
                        <p className="font-semibold">{anomaly.anomaly_type}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Taux de Succès</p>
                        <p className="font-semibold">
                          {(anomaly.current_success_rate * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Latence</p>
                        <p className="font-semibold">{anomaly.current_latency?.toFixed(0)}ms</p>
                      </div>
                    </div>

                    {/* Sira Decision */}
                    {anomaly.sira_decision && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                          <span className="text-lg">🤖</span>
                          <div className="flex-1">
                            <p className="font-semibold text-blue-900">
                              Recommandation Sira (Confiance: {(anomaly.anomaly_score * 100).toFixed(0)}%)
                            </p>
                            <p className="text-sm text-blue-800 mt-1">
                              Basculer vers: <strong>{anomaly.sira_decision.candidate}</strong>
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                              {anomaly.sira_decision.reason}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => approveFailover(anomaly.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                    >
                      ✅ Approuver Failover
                    </button>
                    <button
                      onClick={() => alert('Escalade à implémenter')}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
                    >
                      📋 Escalader
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Actions Tab */}
      {tab === 'actions' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Action</th>
                  <th className="px-6 py-3 text-left font-semibold">From → To</th>
                  <th className="px-6 py-3 text-left font-semibold">Region/Currency</th>
                  <th className="px-6 py-3 text-left font-semibold">Par</th>
                  <th className="px-6 py-3 text-left font-semibold">Status</th>
                  <th className="px-6 py-3 text-left font-semibold">Date</th>
                  <th className="px-6 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {actions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Aucune action de failover
                    </td>
                  </tr>
                ) : (
                  actions.map((action) => (
                    <tr key={action.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs">{action.action_ref}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold">
                          {action.connector_from} → {action.connector_to}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {action.region} / {action.currency}
                      </td>
                      <td className="px-6 py-4">{action.requested_by}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(
                            action.status
                          )}`}
                        >
                          {action.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {new Date(action.requested_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-6 py-4">
                        {action.status === 'pending' && (
                          <button
                            onClick={() => executeFailover(action.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                          >
                            Exécuter
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
