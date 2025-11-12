/**
 * Brique 70sexies - AI Social Ads Generator
 * Social Ads Dashboard UI (Sira Social Engine)
 */

import React, { useState, useEffect } from 'react';

interface SocialAd {
  id: string;
  merchant_id: string;
  platform: string;
  campaign_name: string;
  objective: string;
  title: string;
  copy_text: string;
  cta_button: string;
  media_url: string;
  media_type: string;
  targeting: any;
  audience_size_estimate: number;
  budget: number;
  currency: string;
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
  status: string;
  ai_confidence_score: number;
  created_at: string;
}

interface AdReport {
  adId: string;
  platform: string;
  status: string;
  budget: number;
  totals: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    revenue: number;
    ctr: string;
    roas: string;
  };
  timeline: any[];
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3076/api';

export default function SocialAdsAI() {
  const [ads, setAds] = useState<SocialAd[]>([]);
  const [selectedAd, setSelectedAd] = useState<SocialAd | null>(null);
  const [adReport, setAdReport] = useState<AdReport | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    merchantId: '',
    platform: 'facebook',
    objective: 'conversions',
    productName: '',
    productCategory: 'ecommerce',
    budget: 50,
    currency: 'USD',
    format: 'image',
    desiredConversions: 10
  });

  useEffect(() => {
    if (formData.merchantId) {
      loadAds();
    }
  }, [formData.merchantId]);

  const loadAds = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/social-ads?merchantId=${formData.merchantId}&limit=50`
      );
      const data = await response.json();
      if (data.success) {
        setAds(data.ads);
      }
    } catch (error) {
      console.error('Error loading ads:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdReport = async (adId: string) => {
    try {
      const response = await fetch(`${API_BASE}/social-ads/${adId}/report?days=7`);
      const data = await response.json();
      if (data.success) {
        setAdReport(data.report);
      }
    } catch (error) {
      console.error('Error loading report:', error);
    }
  };

  const generateAd = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/social-ads/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        alert('Publicité générée avec succès !');
        setShowCreateModal(false);
        loadAds();
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (error) {
      console.error('Error generating ad:', error);
      alert('Erreur lors de la génération de la publicité');
    } finally {
      setLoading(false);
    }
  };

  const startAd = async (adId: string) => {
    try {
      const response = await fetch(`${API_BASE}/social-ads/${adId}/start`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        loadAds();
      }
    } catch (error) {
      console.error('Error starting ad:', error);
    }
  };

  const pauseAd = async (adId: string) => {
    try {
      const response = await fetch(`${API_BASE}/social-ads/${adId}/pause`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        loadAds();
      }
    } catch (error) {
      console.error('Error pausing ad:', error);
    }
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      facebook: '📘',
      instagram: '📸',
      tiktok: '🎵',
      linkedin: '💼',
      twitter: '🐦'
    };
    return icons[platform] || '📱';
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      facebook: 'bg-blue-100 text-blue-800',
      instagram: 'bg-pink-100 text-pink-800',
      tiktok: 'bg-purple-100 text-purple-800',
      linkedin: 'bg-indigo-100 text-indigo-800',
      twitter: 'bg-sky-100 text-sky-800'
    };
    return colors[platform] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending_review: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      running: 'bg-green-500 text-white',
      paused: 'bg-orange-100 text-orange-800',
      completed: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getObjectiveLabel = (objective: string) => {
    const labels: Record<string, string> = {
      awareness: 'Notoriété',
      traffic: 'Trafic',
      engagement: 'Engagement',
      conversions: 'Conversions',
      app_installs: 'Installations App',
      video_views: 'Vues Vidéo'
    };
    return labels[objective] || objective;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold">
                🚀 Sira Social Engine
              </h1>
              <p className="text-purple-100 mt-2 text-lg">
                Génération automatique de publicités multi-plateformes
              </p>
              <div className="flex space-x-4 mt-3">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">Facebook</span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">Instagram</span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">TikTok</span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">LinkedIn</span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">Twitter</span>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-white text-purple-600 px-8 py-4 rounded-lg hover:bg-purple-50 transition-colors font-bold text-lg shadow-lg"
            >
              + Générer une Pub IA
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Merchant ID Input */}
        {!formData.merchantId && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Merchant ID
            </label>
            <input
              type="text"
              value={formData.merchantId}
              onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
              placeholder="Entrez votre Merchant ID"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Ads Grid */}
        {formData.merchantId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Ads List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  Mes Publicités ({ads.length})
                </h2>
                <button
                  onClick={loadAds}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  🔄 Actualiser
                </button>
              </div>

              {loading && (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
                  <p className="text-gray-600 mt-3">Chargement...</p>
                </div>
              )}

              {!loading && ads.length === 0 && (
                <div className="bg-white rounded-xl p-16 text-center shadow-sm">
                  <div className="text-6xl mb-4">📱</div>
                  <p className="text-gray-500 text-xl">Aucune publicité</p>
                  <p className="text-gray-400 mt-2">Générez votre première publicité IA</p>
                </div>
              )}

              {!loading && ads.map((ad) => (
                <div
                  key={ad.id}
                  className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 cursor-pointer ${
                    selectedAd?.id === ad.id ? 'ring-2 ring-purple-500' : ''
                  }`}
                  onClick={() => {
                    setSelectedAd(ad);
                    loadAdReport(ad.id);
                  }}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start space-x-3">
                      <span className="text-3xl">{getPlatformIcon(ad.platform)}</span>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{ad.campaign_name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPlatformColor(ad.platform)}`}>
                            {ad.platform.toUpperCase()}
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {getObjectiveLabel(ad.objective)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-4 py-2 rounded-lg text-sm font-bold ${getStatusColor(ad.status)}`}>
                      {ad.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Preview */}
                  <div className="flex space-x-4 mb-4">
                    {ad.media_url && (
                      <div className="flex-shrink-0">
                        <img
                          src={ad.media_url}
                          alt={ad.title}
                          className="w-32 h-32 object-cover rounded-lg"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 mb-2">{ad.title}</p>
                      <p className="text-gray-600 text-sm line-clamp-3">{ad.copy_text}</p>
                      {ad.cta_button && (
                        <button className="mt-2 bg-purple-600 text-white px-4 py-1 rounded text-sm font-medium">
                          {ad.cta_button}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">Impressions</p>
                      <p className="text-lg font-bold text-gray-900">
                        {(ad.performance?.impressions || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Clics</p>
                      <p className="text-lg font-bold text-blue-600">
                        {(ad.performance?.clicks || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Conversions</p>
                      <p className="text-lg font-bold text-green-600">
                        {ad.performance?.conversions || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Revenu</p>
                      <p className="text-lg font-bold text-purple-600">
                        ${ad.performance?.revenue || 0}
                      </p>
                    </div>
                  </div>

                  {/* AI Score */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">IA Confidence Score</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                            style={{ width: `${(ad.ai_confidence_score || 0) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold text-purple-600">
                          {Math.round((ad.ai_confidence_score || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex space-x-2">
                    {ad.status === 'draft' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startAd(ad.id);
                        }}
                        className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium"
                      >
                        ▶️ Lancer
                      </button>
                    )}
                    {ad.status === 'running' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          pauseAd(ad.id);
                        }}
                        className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium"
                      >
                        ⏸️ Pause
                      </button>
                    )}
                    <button className="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-100 font-medium">
                      📊 Rapport
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Details Panel */}
            <div className="lg:col-span-1">
              {selectedAd && adReport ? (
                <div className="bg-white rounded-xl shadow-lg p-6 sticky top-4">
                  <h3 className="font-bold text-gray-900 mb-4 text-lg">Performance (7 jours)</h3>

                  {/* KPI Cards */}
                  <div className="space-y-3 mb-6">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                      <p className="text-xs text-blue-600 font-medium">CTR (Taux de clic)</p>
                      <p className="text-3xl font-bold text-blue-700">{adReport.totals.ctr}</p>
                    </div>
                    <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
                      <p className="text-xs text-green-600 font-medium">ROAS</p>
                      <p className="text-3xl font-bold text-green-700">{adReport.totals.roas}x</p>
                    </div>
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
                      <p className="text-xs text-purple-600 font-medium">Dépenses</p>
                      <p className="text-3xl font-bold text-purple-700">${adReport.totals.spend}</p>
                    </div>
                    <div className="bg-gradient-to-r from-pink-50 to-pink-100 rounded-lg p-4">
                      <p className="text-xs text-pink-600 font-medium">Revenu Généré</p>
                      <p className="text-3xl font-bold text-pink-700">${adReport.totals.revenue}</p>
                    </div>
                  </div>

                  {/* Targeting Info */}
                  <div className="pt-6 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">Ciblage</h4>
                    <div className="text-sm text-gray-600 space-y-2">
                      <div className="flex justify-between">
                        <span>Pays:</span>
                        <span className="font-medium text-gray-900">
                          {selectedAd.targeting?.countries?.join(', ')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Âge:</span>
                        <span className="font-medium text-gray-900">
                          {selectedAd.targeting?.ageMin}-{selectedAd.targeting?.ageMax} ans
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Audience:</span>
                        <span className="font-medium text-gray-900">
                          {selectedAd.audience_size_estimate?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Budget:</span>
                        <span className="font-medium text-gray-900">
                          ${selectedAd.budget}/{selectedAd.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-6 text-center text-gray-500">
                  <div className="text-4xl mb-3">📊</div>
                  <p>Sélectionnez une publicité</p>
                  <p className="text-sm mt-1">pour voir les détails</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Ad Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                🤖 Générer une Pub IA
              </h2>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Plateforme
                    </label>
                    <select
                      value={formData.platform}
                      onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="facebook">📘 Facebook</option>
                      <option value="instagram">📸 Instagram</option>
                      <option value="tiktok">🎵 TikTok</option>
                      <option value="linkedin">💼 LinkedIn</option>
                      <option value="twitter">🐦 Twitter/X</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Objectif
                    </label>
                    <select
                      value={formData.objective}
                      onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="awareness">Notoriété</option>
                      <option value="traffic">Trafic</option>
                      <option value="engagement">Engagement</option>
                      <option value="conversions">Conversions</option>
                      <option value="app_installs">Installations App</option>
                      <option value="video_views">Vues Vidéo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du produit
                  </label>
                  <input
                    type="text"
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    placeholder="Ex: iPhone 15 Pro"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Catégorie
                    </label>
                    <select
                      value={formData.productCategory}
                      onChange={(e) => setFormData({ ...formData, productCategory: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="ecommerce">E-commerce</option>
                      <option value="fashion">Mode</option>
                      <option value="tech">Tech</option>
                      <option value="beauty">Beauté</option>
                      <option value="food">Food</option>
                      <option value="fitness">Fitness</option>
                      <option value="travel">Voyage</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Format
                    </label>
                    <select
                      value={formData.format}
                      onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="image">🖼️ Image</option>
                      <option value="video">🎥 Vidéo</option>
                      <option value="carousel">📸 Carrousel</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Budget (${formData.currency})
                    </label>
                    <input
                      type="number"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) })}
                      min="5"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Conversions souhaitées
                    </label>
                    <input
                      type="number"
                      value={formData.desiredConversions}
                      onChange={(e) => setFormData({ ...formData, desiredConversions: parseInt(e.target.value) })}
                      min="1"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end space-x-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  onClick={generateAd}
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 font-bold shadow-lg disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? '⚡ Génération IA...' : '🚀 Générer la Pub'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
