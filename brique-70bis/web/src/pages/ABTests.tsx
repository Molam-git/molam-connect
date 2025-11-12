/**
 * A/B Testing Dashboard
 *
 * Create and monitor A/B tests with automatic winner selection
 */

import React, { useEffect, useState } from 'react';

interface ABTest {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'auto_stopped';
  variantA: any;
  variantB: any;
  variantC?: any;
  metricsA: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    ctr: number;
    cvr: number;
  };
  metricsB: any;
  metricsC?: any;
  result?: {
    winner: string;
    confidence: number;
    uplift: number;
    statisticalSignificance: boolean;
    recommendation: string;
    insights: string;
  };
  startDate: string;
  endDate?: string;
  createdAt: string;
}

export default function ABTests() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      const res = await fetch('/api/ai/ab-tests');
      const data = await res.json();
      if (data.success) {
        setTests(data.data);
      }
    } catch (error) {
      console.error('Error fetching tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTest = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/ab-tests/${id}/start`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchTests();
      }
    } catch (error) {
      console.error('Error starting test:', error);
    }
  };

  const stopTest = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/ab-tests/${id}/stop`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchTests();
      }
    } catch (error) {
      console.error('Error stopping test:', error);
    }
  };

  const analyzeTest = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/ab-tests/${id}/analyze`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchTests();
      }
    } catch (error) {
      console.error('Error analyzing test:', error);
    }
  };

  const deployWinner = async (id: string, winner: string) => {
    if (!confirm(`Déployer ${winner} comme campagne permanente ?`)) return;

    try {
      const res = await fetch(`/api/ai/ab-tests/${id}/deploy-winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner }),
      });
      if (res.ok) {
        alert('Variante gagnante déployée !');
        await fetchTests();
      }
    } catch (error) {
      console.error('Error deploying winner:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      running: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700',
      auto_stopped: 'bg-purple-100 text-purple-700',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const renderMetrics = (metrics: any, label: string) => (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="font-medium mb-3">{label}</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="opacity-70">Impressions</div>
          <div className="font-medium">{metrics.impressions.toLocaleString()}</div>
        </div>
        <div>
          <div className="opacity-70">Clicks</div>
          <div className="font-medium">{metrics.clicks.toLocaleString()}</div>
        </div>
        <div>
          <div className="opacity-70">CTR</div>
          <div className="font-medium">{metrics.ctr.toFixed(2)}%</div>
        </div>
        <div>
          <div className="opacity-70">CVR</div>
          <div className="font-medium">{metrics.cvr.toFixed(2)}%</div>
        </div>
        <div>
          <div className="opacity-70">Conversions</div>
          <div className="font-medium">{metrics.conversions}</div>
        </div>
        <div>
          <div className="opacity-70">Revenus</div>
          <div className="font-medium">{metrics.revenue.toFixed(0)}€</div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg opacity-70">Chargement des tests A/B...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tests A/B Automatisés</h1>
          <p className="text-sm opacity-70 mt-1">
            Expérimentations avec sélection automatique du gagnant
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all"
        >
          🧪 Créer un test
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70">Total</div>
          <div className="text-2xl font-bold mt-1">{tests.length}</div>
        </div>
        <div className="p-4 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70">En cours</div>
          <div className="text-2xl font-bold mt-1">
            {tests.filter(t => t.status === 'running').length}
          </div>
        </div>
        <div className="p-4 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70">Complétés</div>
          <div className="text-2xl font-bold mt-1">
            {tests.filter(t => t.status === 'completed' || t.status === 'auto_stopped').length}
          </div>
        </div>
        <div className="p-4 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70">Taux succès</div>
          <div className="text-2xl font-bold mt-1">
            {tests.filter(t => t.result?.statisticalSignificance).length > 0
              ? Math.round((tests.filter(t => t.result?.statisticalSignificance).length / tests.length) * 100)
              : 0}%
          </div>
        </div>
      </div>

      {/* Tests List */}
      {tests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <div className="text-4xl mb-4">🧪</div>
          <div className="text-lg font-medium mb-2">Aucun test A/B</div>
          <div className="text-sm opacity-70 mb-4">
            Créez votre premier test pour optimiser vos campagnes
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {tests.map((test) => (
            <div
              key={test.id}
              className="p-6 bg-white rounded-xl shadow-sm border"
            >
              {/* Test Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold">{test.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(test.status)}`}>
                      {test.status}
                    </span>
                  </div>
                  {test.description && (
                    <p className="text-sm opacity-70">{test.description}</p>
                  )}
                  <div className="text-xs opacity-50 mt-1">
                    Démarré: {new Date(test.startDate).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                <div className="flex gap-2">
                  {test.status === 'draft' && (
                    <button
                      onClick={() => startTest(test.id)}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
                    >
                      ▶️ Démarrer
                    </button>
                  )}
                  {test.status === 'running' && (
                    <>
                      <button
                        onClick={() => analyzeTest(test.id)}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                      >
                        📊 Analyser
                      </button>
                      <button
                        onClick={() => stopTest(test.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                      >
                        ⏸️ Arrêter
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Variants Comparison */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {renderMetrics(test.metricsA, `Variante A: ${test.variantA.name}`)}
                {renderMetrics(test.metricsB, `Variante B: ${test.variantB.name}`)}
              </div>

              {/* Results */}
              {test.result && (
                <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-2 border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg mb-2">
                        🏆 Gagnant: {test.result.winner.replace('variant_', 'Variante ').toUpperCase()}
                      </div>
                      <div className="text-sm opacity-80 mb-1">
                        <strong>Uplift:</strong> +{test.result.uplift}% ·
                        <strong> Confiance:</strong> {test.result.confidence}% ·
                        <strong> Significatif:</strong> {test.result.statisticalSignificance ? '✅ Oui' : '❌ Non'}
                      </div>
                      <div className="text-sm opacity-80">
                        <strong>Insights:</strong> {test.result.insights}
                      </div>
                      <div className="text-sm mt-2 font-medium">
                        💡 {test.result.recommendation}
                      </div>
                    </div>

                    {test.result.statisticalSignificance && test.result.winner !== 'no_clear_winner' && (
                      <button
                        onClick={() => deployWinner(test.id, test.result!.winner)}
                        className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                      >
                        🚀 Déployer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
