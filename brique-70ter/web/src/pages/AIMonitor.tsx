/**
 * AI Training Monitor Dashboard
 *
 * Shows training runs, global models, and merchant configuration
 */

import React, { useEffect, useState } from 'react';

interface TrainingRun {
  id: string;
  modelVersion: string;
  modelType: string;
  sourceType: string;
  metrics: {
    accuracy: number;
    predictedUplift: number;
    confidence: number;
    trainingTimeMs: number;
  };
  deployed: boolean;
  createdAt: string;
}

interface MerchantConfig {
  modelVersion: string;
  personalizationLevel: string;
  trainingFrequency: string;
  autoDeploy: boolean;
  minConfidence: number;
  dataSources: {
    internal: boolean;
    external: boolean;
    federated: boolean;
  };
  lastTrainedAt?: string;
  nextTrainingAt?: string;
}

export default function AIMonitor() {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [runsRes, configRes] = await Promise.all([
        fetch('/api/ai-training/runs'),
        fetch('/api/ai-training/config'),
      ]);

      const runsData = await runsRes.json();
      const configData = await configRes.json();

      if (runsData.success) setRuns(runsData.data);
      if (configData.success) setConfig(configData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const trainModel = async () => {
    setTraining(true);
    try {
      const res = await fetch('/api/ai-training/train-personalized', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert(`Modèle entraîné avec succès! Accuracy: ${data.data.metrics.accuracy}`);
        await fetchData();
      }
    } catch (error) {
      console.error('Error training model:', error);
      alert('Erreur lors de l\'entraînement');
    } finally {
      setTraining(false);
    }
  };

  const deployModel = async (id: string) => {
    if (!confirm('Déployer ce modèle en production ?')) return;

    try {
      const res = await fetch(`/api/ai-training/${id}/deploy`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Modèle déployé avec succès!');
        await fetchData();
      }
    } catch (error) {
      console.error('Error deploying model:', error);
    }
  };

  const getModelTypeColor = (type: string) => {
    if (type === 'local') return 'bg-blue-100 text-blue-700';
    if (type === 'federated') return 'bg-purple-100 text-purple-700';
    if (type === 'personalized') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.85) return 'text-green-600';
    if (accuracy >= 0.75) return 'text-blue-600';
    if (accuracy >= 0.65) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg opacity-70">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Suivi Entraînement SIRA</h1>
          <p className="text-sm opacity-70 mt-1">
            Apprentissage automatique décentralisé
          </p>
        </div>
        <button
          onClick={trainModel}
          disabled={training}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {training ? 'Entraînement...' : '🧠 Entraîner modèle'}
        </button>
      </div>

      {/* Configuration */}
      {config && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-sm opacity-70 mb-1">Niveau de personnalisation</div>
              <div className="font-medium capitalize">{config.personalizationLevel}</div>
            </div>
            <div>
              <div className="text-sm opacity-70 mb-1">Fréquence d'entraînement</div>
              <div className="font-medium capitalize">{config.trainingFrequency}</div>
            </div>
            <div>
              <div className="text-sm opacity-70 mb-1">Déploiement automatique</div>
              <div className="font-medium">{config.autoDeploy ? '✅ Activé' : '❌ Désactivé'}</div>
            </div>
            <div>
              <div className="text-sm opacity-70 mb-1">Confiance minimale</div>
              <div className="font-medium">{(config.minConfidence * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-sm opacity-70 mb-1">Sources de données</div>
              <div className="flex gap-2">
                {config.dataSources.internal && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Interne</span>}
                {config.dataSources.external && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Externe</span>}
                {config.dataSources.federated && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Fédéré</span>}
              </div>
            </div>
            <div>
              <div className="text-sm opacity-70 mb-1">Dernier entraînement</div>
              <div className="font-medium">
                {config.lastTrainedAt ? new Date(config.lastTrainedAt).toLocaleString('fr-FR') : 'Jamais'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training Runs */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold mb-4">Historique d'entraînement</h2>
        {runs.length === 0 ? (
          <div className="text-center py-12 opacity-70">
            Aucun entraînement disponible. Cliquez sur "Entraîner modèle" pour commencer.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Version</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Source</th>
                <th className="text-right py-2">Accuracy</th>
                <th className="text-right py-2">Uplift</th>
                <th className="text-right py-2">Confiance</th>
                <th className="text-right py-2">Temps</th>
                <th className="text-left py-2">Statut</th>
                <th className="text-left py-2">Date</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b">
                  <td className="py-3">{run.modelVersion}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs ${getModelTypeColor(run.modelType)}`}>
                      {run.modelType}
                    </span>
                  </td>
                  <td className="py-3 capitalize">{run.sourceType}</td>
                  <td className={`py-3 text-right font-bold ${getAccuracyColor(run.metrics.accuracy)}`}>
                    {(run.metrics.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 text-right font-medium">+{run.metrics.predictedUplift}%</td>
                  <td className="py-3 text-right">{(run.metrics.confidence * 100).toFixed(0)}%</td>
                  <td className="py-3 text-right">{run.metrics.trainingTimeMs}ms</td>
                  <td className="py-3">
                    {run.deployed ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Déployé</span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">Non déployé</span>
                    )}
                  </td>
                  <td className="py-3 text-xs opacity-70">
                    {new Date(run.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="py-3 text-right">
                    {!run.deployed && (
                      <button
                        onClick={() => deployModel(run.id)}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs"
                      >
                        Déployer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
