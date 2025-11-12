/**
 * Market Benchmarks Dashboard
 *
 * Shows SIRA-powered competitive intelligence and market positioning
 */

import React, { useEffect, useState } from 'react';

interface Benchmark {
  industry: string;
  country: string;
  benchmarks: {
    avgDiscountRate: number;
    mostCommonPromoType: string;
    churnBenchmarks: { low: number; avg: number; high: number };
    ltvBenchmarks: { low: number; avg: number; high: number };
  };
  competitorOffers: Array<{
    competitor: string;
    offer: string;
    engagement: 'low' | 'medium' | 'high';
  }>;
  merchantComparison: {
    discountRate: { merchant: number; market: number; position: string };
    churn: { merchant: number; market: number; position: string };
    ltv: { merchant: number; market: number; position: string };
  };
  recommendations: Array<{
    action: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

export default function Benchmarks() {
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBenchmark();
  }, []);

  const fetchBenchmark = async () => {
    try {
      const res = await fetch('/api/ai/benchmarks');
      const data = await res.json();
      if (data.success) {
        setBenchmark(data.data);
      }
    } catch (error) {
      console.error('Error fetching benchmark:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPositionColor = (position: string) => {
    if (position === 'above_market') return 'text-green-600 bg-green-50';
    if (position === 'market_aligned') return 'text-blue-600 bg-blue-50';
    if (position === 'below_market') return 'text-orange-600 bg-orange-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getPositionLabel = (position: string) => {
    if (position === 'above_market') return 'Au-dessus du marché';
    if (position === 'market_aligned') return 'Aligné au marché';
    if (position === 'below_market') return 'En-dessous du marché';
    return 'Position inconnue';
  };

  const getPriorityColor = (priority: string) => {
    if (priority === 'high') return 'bg-red-100 text-red-700';
    if (priority === 'medium') return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700';
  };

  const getEngagementIcon = (engagement: string) => {
    if (engagement === 'high') return '🔥';
    if (engagement === 'medium') return '⚡';
    return '💧';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg opacity-70">Chargement des benchmarks...</div>
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <div className="text-4xl mb-4">📊</div>
          <div className="text-lg font-medium mb-2">Données non disponibles</div>
          <div className="text-sm opacity-70">
            Les benchmarks seront bientôt disponibles
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Benchmarking Marché</h1>
        <p className="text-sm opacity-70 mt-1">
          Intelligence compétitive SIRA · {benchmark.industry} · {benchmark.country}
        </p>
      </div>

      {/* Market Position Overview */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70 mb-2">Taux de réduction</div>
          <div className="text-3xl font-bold mb-3">
            {benchmark.merchantComparison.discountRate.merchant.toFixed(0)}%
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">
              Marché: {benchmark.merchantComparison.discountRate.market.toFixed(0)}%
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPositionColor(benchmark.merchantComparison.discountRate.position)}`}>
              {getPositionLabel(benchmark.merchantComparison.discountRate.position)}
            </span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70 mb-2">Churn Rate</div>
          <div className="text-3xl font-bold mb-3">
            {benchmark.merchantComparison.churn.merchant.toFixed(1)}%
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">
              Marché: {benchmark.merchantComparison.churn.market.toFixed(1)}%
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPositionColor(benchmark.merchantComparison.churn.position)}`}>
              {getPositionLabel(benchmark.merchantComparison.churn.position)}
            </span>
          </div>
        </div>

        <div className="p-6 bg-white rounded-xl shadow-sm border">
          <div className="text-sm opacity-70 mb-2">LTV Client</div>
          <div className="text-3xl font-bold mb-3">
            {benchmark.merchantComparison.ltv.merchant.toFixed(0)}€
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">
              Marché: {benchmark.merchantComparison.ltv.market.toFixed(0)}€
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPositionColor(benchmark.merchantComparison.ltv.position)}`}>
              {getPositionLabel(benchmark.merchantComparison.ltv.position)}
            </span>
          </div>
        </div>
      </div>

      {/* Market Benchmarks */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Benchmarks du marché</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-2">Type de promo le plus courant</div>
            <div className="text-2xl font-bold">{benchmark.benchmarks.mostCommonPromoType}</div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Taux de réduction moyen</div>
            <div className="text-2xl font-bold">{benchmark.benchmarks.avgDiscountRate.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-sm font-medium mb-3">Churn Benchmarks</div>
            <div className="flex gap-4">
              <div>
                <div className="text-xs opacity-70">Bas</div>
                <div className="font-medium">{benchmark.benchmarks.churnBenchmarks.low}%</div>
              </div>
              <div>
                <div className="text-xs opacity-70">Moyen</div>
                <div className="font-medium">{benchmark.benchmarks.churnBenchmarks.avg}%</div>
              </div>
              <div>
                <div className="text-xs opacity-70">Haut</div>
                <div className="font-medium">{benchmark.benchmarks.churnBenchmarks.high}%</div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-3">LTV Benchmarks</div>
            <div className="flex gap-4">
              <div>
                <div className="text-xs opacity-70">Bas</div>
                <div className="font-medium">{benchmark.benchmarks.ltvBenchmarks.low}€</div>
              </div>
              <div>
                <div className="text-xs opacity-70">Moyen</div>
                <div className="font-medium">{benchmark.benchmarks.ltvBenchmarks.avg}€</div>
              </div>
              <div>
                <div className="text-xs opacity-70">Haut</div>
                <div className="font-medium">{benchmark.benchmarks.ltvBenchmarks.high}€</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Competitor Offers */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Offres concurrentes</h2>
        <div className="space-y-3">
          {benchmark.competitorOffers.map((offer, idx) => (
            <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getEngagementIcon(offer.engagement)}</span>
                <div>
                  <div className="font-medium">{offer.offer}</div>
                  <div className="text-xs opacity-70">{offer.competitor}</div>
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                offer.engagement === 'high' ? 'bg-red-100 text-red-700' :
                offer.engagement === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {offer.engagement}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold mb-4">Recommandations stratégiques</h2>
        <div className="space-y-3">
          {benchmark.recommendations.map((rec, idx) => (
            <div key={idx} className="flex items-start gap-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-l-4 border-blue-500">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                {rec.priority.toUpperCase()}
              </span>
              <div className="flex-1">
                <div className="font-medium mb-1">{rec.action.replace('_', ' ').toUpperCase()}</div>
                <div className="text-sm opacity-80">{rec.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
