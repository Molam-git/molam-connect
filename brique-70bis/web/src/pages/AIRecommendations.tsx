/**
 * AI Recommendations Dashboard
 *
 * Shows SIRA-generated marketing recommendations with confidence scores
 */

import React, { useEffect, useState } from 'react';

interface Recommendation {
  id: string;
  recommendation: {
    type: string;
    discountType?: string;
    discountValue?: number;
    target: string;
    message: string;
    reasoning: string;
    expectedImpact: {
      conversionUplift: number;
      revenueImpact: number;
      customerRetention?: number;
    };
    durationDays: number;
  };
  confidence: number;
  dataPoints: any;
  generatedAt: string;
}

export default function AIRecommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchRecommendations();
    fetchMetrics();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const res = await fetch('/api/ai/recommendations');
      const data = await res.json();
      if (data.success) {
        setRecommendations(data.data);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/ai/metrics?timeframe=30d');
      const data = await res.json();
      if (data.success) {
        setMetrics(data.data);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const generateNew = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/recommendations/generate', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        await fetchRecommendations();
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setGenerating(false);
    }
  };

  const applyRecommendation = async (id: string) => {
    if (!confirm('Appliquer cette recommandation et créer une campagne ?')) return;

    try {
      const res = await fetch(`/api/ai/recommendations/${id}/apply`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert('Recommandation appliquée avec succès !');
        await fetchRecommendations();
      }
    } catch (error) {
      console.error('Error applying recommendation:', error);
      alert('Erreur lors de l\'application');
    }
  };

  const dismissRecommendation = async (id: string) => {
    const reason = prompt('Raison du rejet (optionnel):');
    try {
      const res = await fetch(`/api/ai/recommendations/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchRecommendations();
      }
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600 bg-green-50';
    if (confidence >= 75) return 'text-blue-600 bg-blue-50';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'promo_code': return '🎟️';
      case 'coupon': return '🎫';
      case 'subscription_plan': return '📅';
      case 'campaign': return '📢';
      default: return '✨';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg opacity-70">Chargement des recommandations...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Recommandations Marketing AI</h1>
          <p className="text-sm opacity-70 mt-1">
            Suggestions intelligentes par SIRA basées sur vos données
          </p>
        </div>
        <button
          onClick={generateNew}
          disabled={generating}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {generating ? 'Génération...' : '🤖 Générer nouvelles'}
        </button>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Taux d'abandon</div>
            <div className="text-2xl font-bold mt-1">
              {(metrics.abandonmentRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Valeur panier moyenne</div>
            <div className="text-2xl font-bold mt-1">
              {metrics.avgOrderValue.toFixed(0)}€
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Taux de churn</div>
            <div className="text-2xl font-bold mt-1">
              {(metrics.churnRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <div className="text-sm opacity-70">Clients actifs</div>
            <div className="text-2xl font-bold mt-1">
              {metrics.activeCustomers}
            </div>
          </div>
        </div>
      )}

      {/* Recommendations List */}
      {recommendations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <div className="text-4xl mb-4">🤖</div>
          <div className="text-lg font-medium mb-2">Aucune recommandation disponible</div>
          <div className="text-sm opacity-70 mb-4">
            Cliquez sur "Générer nouvelles" pour obtenir des suggestions AI
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{getTypeIcon(rec.recommendation.type)}</span>
                    <div>
                      <div className="font-semibold text-lg">
                        {rec.recommendation.message}
                      </div>
                      <div className="text-sm opacity-70">
                        {rec.recommendation.type === 'promo_code' && 'Code Promo'}
                        {rec.recommendation.type === 'coupon' && 'Coupon Récurrent'}
                        {rec.recommendation.type === 'subscription_plan' && 'Plan d\'Abonnement'}
                        {rec.recommendation.type === 'campaign' && 'Campagne Marketing'}
                        {' · '}
                        Cible: {rec.recommendation.target.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="text-sm font-medium mb-1">💡 Analyse SIRA</div>
                    <div className="text-sm opacity-80">
                      {rec.recommendation.reasoning}
                    </div>
                  </div>

                  {/* Expected Impact */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center p-2 bg-green-50 rounded-lg">
                      <div className="text-xs opacity-70">Conversion</div>
                      <div className="text-lg font-bold text-green-600">
                        +{rec.recommendation.expectedImpact.conversionUplift}%
                      </div>
                    </div>
                    <div className="text-center p-2 bg-blue-50 rounded-lg">
                      <div className="text-xs opacity-70">Revenus potentiels</div>
                      <div className="text-lg font-bold text-blue-600">
                        {rec.recommendation.expectedImpact.revenueImpact.toFixed(0)}€
                      </div>
                    </div>
                    <div className="text-center p-2 bg-purple-50 rounded-lg">
                      <div className="text-xs opacity-70">Durée</div>
                      <div className="text-lg font-bold text-purple-600">
                        {rec.recommendation.durationDays}j
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  {rec.recommendation.discountValue && (
                    <div className="text-sm opacity-70">
                      Réduction: <span className="font-medium">
                        {rec.recommendation.discountType === 'percentage'
                          ? `${rec.recommendation.discountValue}%`
                          : `${rec.recommendation.discountValue}€`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confidence & Actions */}
                <div className="ml-6 flex flex-col items-end gap-3">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(rec.confidence)}`}>
                    {rec.confidence}% confiance
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => applyRecommendation(rec.id)}
                      className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-all"
                    >
                      ✅ Appliquer
                    </button>
                    <button
                      onClick={() => dismissRecommendation(rec.id)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-all"
                    >
                      ❌ Rejeter
                    </button>
                  </div>

                  <div className="text-xs opacity-50 mt-2">
                    {new Date(rec.generatedAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
