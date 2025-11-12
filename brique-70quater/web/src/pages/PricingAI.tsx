/**
 * Pricing AI Dashboard
 *
 * Shows AI-generated price recommendations with impact predictions
 */

import React, { useEffect, useState } from 'react';

interface PriceRecommendation {
  id: string;
  productId: string;
  currentPrice: number;
  suggestedPrice: number;
  priceChange: number;
  priceChangePct: number;
  confidence: number;
  reason: string;
  predictedImpact: {
    revenueUpliftPct: number;
    revenueUpliftAmount: number;
    volumeChangePct: number;
    churnRiskPct: number;
    marginImprovementPct: number;
  };
}

export default function PricingAI() {
  const [recommendations, setRecommendations] = useState<PriceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const res = await fetch('/api/pricing/recommendations?status=pending');
      const data = await res.json();
      if (data.success) {
        setRecommendations(data.data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (id: string) => {
    if (!confirm('Appliquer cette recommandation de prix ?')) return;

    try {
      const res = await fetch('/api/pricing/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id, accepted: true }),
      });

      if (res.ok) {
        alert('Prix mis à jour avec succès!');
        await fetchRecommendations();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Erreur lors de l\'application');
    }
  };

  const rejectRecommendation = async (id: string) => {
    try {
      await fetch('/api/pricing/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id, accepted: false }),
      });
      await fetchRecommendations();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getPriceChangeColor = (pct: number) => {
    if (pct > 0) return 'text-green-600';
    if (pct < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'bg-green-100 text-green-700';
    if (confidence >= 0.70) return 'bg-blue-100 text-blue-700';
    return 'bg-yellow-100 text-yellow-700';
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Pricing AI — SIRA</h1>
        <p className="text-sm opacity-70 mt-1">
          Recommandations de prix optimales basées sur l'IA
        </p>
      </div>

      {/* Recommendations */}
      {recommendations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <div className="text-4xl mb-4">💰</div>
          <div className="text-lg font-medium mb-2">Aucune recommandation disponible</div>
          <div className="text-sm opacity-70">
            L'IA analysera vos produits et générera des recommandations bientôt
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
                    <div className="text-2xl">💡</div>
                    <div>
                      <div className="font-semibold text-lg">
                        Produit: {rec.productId.substring(0, 8)}...
                      </div>
                      <div className="text-sm opacity-70">{rec.reason}</div>
                    </div>
                  </div>

                  {/* Price Comparison */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs opacity-70 mb-1">Prix actuel</div>
                      <div className="text-2xl font-bold">{rec.currentPrice.toFixed(0)} FCFA</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <div className="text-xs opacity-70 mb-1">Prix suggéré</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {rec.suggestedPrice.toFixed(0)} FCFA
                      </div>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
                      <div className="text-xs opacity-70 mb-1">Changement</div>
                      <div className={`text-2xl font-bold ${getPriceChangeColor(rec.priceChangePct)}`}>
                        {rec.priceChangePct > 0 ? '+' : ''}{rec.priceChangePct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Predicted Impact */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 mb-3">
                    <div className="text-sm font-medium mb-2">📊 Impact prévu:</div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="opacity-70">Revenus</div>
                        <div className="font-bold text-green-600">
                          +{rec.predictedImpact.revenueUpliftPct.toFixed(1)}%
                        </div>
                        <div className="text-xs opacity-70">
                          {rec.predictedImpact.revenueUpliftAmount.toFixed(0)} FCFA
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">Volume</div>
                        <div className="font-bold">
                          {rec.predictedImpact.volumeChangePct > 0 ? '+' : ''}
                          {rec.predictedImpact.volumeChangePct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">Risque churn</div>
                        <div className="font-bold text-orange-600">
                          {rec.predictedImpact.churnRiskPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">Marge</div>
                        <div className="font-bold text-blue-600">
                          +{rec.predictedImpact.marginImprovementPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confidence & Actions */}
                <div className="ml-6 flex flex-col items-end gap-3">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(rec.confidence)}`}>
                    {(rec.confidence * 100).toFixed(0)}% confiance
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => applyRecommendation(rec.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      ✅ Appliquer
                    </button>
                    <button
                      onClick={() => rejectRecommendation(rec.id)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      ❌ Rejeter
                    </button>
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
