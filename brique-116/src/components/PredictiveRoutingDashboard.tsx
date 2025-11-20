/**
 * Brique 116sexies: Predictive Routing Dashboard
 * UI for viewing ML-based route forecasts
 */

import React, { useState, useEffect } from 'react';

interface Forecast {
  id: string;
  route: string;
  predicted_success_rate: number;
  predicted_latency_ms: number;
  predicted_fee_percent: number;
  sira_confidence: number;
  forecast_date: string;
  created_at: string;
}

interface PredictiveRoutingDashboardProps {
  merchantId: string;
  currency: string;
  apiBaseUrl?: string;
}

export default function PredictiveRoutingDashboard({
  merchantId,
  currency,
  apiBaseUrl = '/api/routing',
}: PredictiveRoutingDashboardProps) {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [bestRoute, setBestRoute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadForecasts();
    loadBestRoute();
  }, [merchantId, currency]);

  const loadForecasts = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${apiBaseUrl}/forecasts?merchantId=${merchantId}&currency=${currency}`
      );
      const data = await res.json();

      if (data.success) {
        setForecasts(data.forecasts);
      }
    } catch (error) {
      console.error('Error loading forecasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBestRoute = async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/forecasts/best?merchantId=${merchantId}&currency=${currency}`
      );
      const data = await res.json();

      if (data.success) {
        setBestRoute(data.bestRoute);
      }
    } catch (error) {
      console.error('Error loading best route:', error);
    }
  };

  const generateForecasts = async () => {
    try {
      setGenerating(true);

      const routes = ['bank_bci', 'bank_coris', 'mobile_money', 'stripe', 'adyen'];

      const res = await fetch(`${apiBaseUrl}/forecasts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId,
          currency,
          routes,
          lookbackDays: 30,
        }),
      });

      const data = await res.json();

      if (data.success) {
        loadForecasts();
        loadBestRoute();
        alert(`✅ ${data.count} prévisions générées avec succès!`);
      } else {
        alert('❌ Erreur lors de la génération des prévisions');
      }
    } catch (error) {
      console.error('Error generating forecasts:', error);
      alert('❌ Erreur lors de la génération des prévisions');
    } finally {
      setGenerating(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatPercent = (value: number) => (value * 100).toFixed(2) + '%';

  if (loading) {
    return <div className="p-6 text-center">Chargement des prévisions...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Prévisions de Routage — {currency}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prédictions ML par Sira pour optimiser les routes de paiement
          </p>
        </div>
        <button
          onClick={generateForecasts}
          disabled={generating}
          className={`px-4 py-2 rounded-lg transition ${
            generating
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
        >
          {generating ? '⏳ Génération...' : '🔮 Générer Prévisions'}
        </button>
      </div>

      {/* Best Route Recommendation */}
      {bestRoute && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🏆</span>
            <h2 className="text-2xl font-bold">Meilleure Route Prédite</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-purple-100 text-sm">Route</p>
              <p className="text-2xl font-bold">{bestRoute.route}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Taux de Succès</p>
              <p className="text-2xl font-bold">{formatPercent(bestRoute.predicted_success_rate)}</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Latence</p>
              <p className="text-2xl font-bold">{bestRoute.predicted_latency_ms?.toFixed(0)}ms</p>
            </div>
            <div>
              <p className="text-purple-100 text-sm">Confiance Sira</p>
              <p className="text-2xl font-bold">{formatPercent(bestRoute.sira_confidence)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Forecasts Table */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold">Toutes les Prévisions</h2>
        </div>

        {forecasts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg mb-2">Aucune prévision disponible</p>
            <p className="text-sm">
              Cliquez sur &quot;Générer Prévisions&quot; pour créer de nouvelles prévisions
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Route</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">
                    Taux Succès Prévu
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">
                    Latence (ms)
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Frais (%)</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">
                    Confiance Sira
                  </th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {forecasts.map((forecast, index) => {
                  const score =
                    forecast.predicted_success_rate -
                    forecast.predicted_fee_percent * 0.01 -
                    forecast.predicted_latency_ms * 0.0005;

                  return (
                    <tr
                      key={forecast.id}
                      className={index === 0 ? 'bg-purple-50' : 'hover:bg-gray-50'}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {index === 0 && <span className="text-lg">👑</span>}
                          <span className="font-semibold">{forecast.route}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono">
                          {formatPercent(forecast.predicted_success_rate)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono">
                          {forecast.predicted_latency_ms?.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono">
                          {formatPercent(forecast.predicted_fee_percent)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${getConfidenceColor(
                            forecast.sira_confidence
                          )}`}
                        >
                          {formatPercent(forecast.sira_confidence)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-purple-600">
                          {score.toFixed(4)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Comment ça marche ?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>
            • <strong>Sira</strong> analyse l&apos;historique des 30 derniers jours de chaque route
          </li>
          <li>
            • Prédit le <strong>taux de succès</strong>, la <strong>latence</strong> et les{' '}
            <strong>frais</strong>
          </li>
          <li>
            • Calcule un <strong>score composite</strong> et un niveau de <strong>confiance</strong>
          </li>
          <li>
            • La route avec le <strong>meilleur score</strong> est recommandée 👑
          </li>
        </ul>
      </div>
    </div>
  );
}
