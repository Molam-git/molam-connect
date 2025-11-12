/**
 * Brique 70quinquies - AI Campaign Generator
 * Campaign Dashboard UI
 */

import React, { useState, useEffect } from 'react';

interface Campaign {
  id: string;
  merchantId: string;
  channel: string;
  language: string;
  title: string;
  body: string;
  cta?: string;
  slogan?: string;
  audience: any;
  performance: {
    sent: number;
    opened: number;
    clicked: number;
    revenue: number;
  };
  status: string;
  scheduledAt?: string;
  createdAt: string;
}

interface CampaignReport {
  campaignId: string;
  status: string;
  metrics: {
    sent: number;
    opened: number;
    clicked: number;
    revenue: number;
    openRate: string;
    clickRate: string;
    conversionRate: string;
    roi: string;
  };
  timeline: any[];
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3075/api';

export default function CampaignAI() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignReport, setCampaignReport] = useState<CampaignReport | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    merchantId: '',
    type: 'abandoned_cart',
    channel: 'email',
    language: 'fr',
    discountValue: 15,
    autoOptimize: true
  });

  useEffect(() => {
    if (formData.merchantId) {
      loadCampaigns();
    }
  }, [formData.merchantId]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/campaigns?merchantId=${formData.merchantId}&limit=50`
      );
      const data = await response.json();
      if (data.success) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignReport = async (campaignId: string) => {
    try {
      const response = await fetch(`${API_BASE}/campaigns/${campaignId}/report`);
      const data = await response.json();
      if (data.success) {
        setCampaignReport(data.report);
      }
    } catch (error) {
      console.error('Error loading report:', error);
    }
  };

  const createCampaign = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        alert('Campaign créée avec succès !');
        setShowCreateModal(false);
        loadCampaigns();
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('Erreur lors de la création de la campagne');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (campaignId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE}/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      const data = await response.json();
      if (data.success) {
        loadCampaigns();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const optimizeCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`${API_BASE}/campaigns/${campaignId}/optimize`, {
        method: 'POST'
      });

      const data = await response.json();
      if (data.success) {
        alert('Optimisation lancée !');
        loadCampaigns();
      }
    } catch (error) {
      console.error('Error optimizing campaign:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      scheduled: 'bg-blue-100 text-blue-800',
      sending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      paused: 'bg-orange-100 text-orange-800',
      stopped: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getChannelIcon = (channel: string) => {
    const icons: Record<string, string> = {
      email: '📧',
      sms: '💬',
      push: '🔔',
      social: '📱',
      checkout_banner: '🛒'
    };
    return icons[channel] || '📧';
  };

  const getCampaignTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      abandoned_cart: 'Panier Abandonné',
      welcome: 'Bienvenue',
      reactivation: 'Réactivation',
      vip_exclusive: 'VIP Exclusif',
      seasonal: 'Saisonnier',
      flash_sale: 'Flash Sale'
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🤖 AI Campaign Generator
              </h1>
              <p className="text-gray-600 mt-1">
                Génération autonome de campagnes marketing multilingues
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Nouvelle Campagne
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Merchant ID Input */}
        {!formData.merchantId && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Merchant ID
            </label>
            <input
              type="text"
              value={formData.merchantId}
              onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
              placeholder="Entrez votre Merchant ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Campaigns Grid */}
        {formData.merchantId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaign List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Mes Campagnes ({campaigns.length})
                </h2>
                <button
                  onClick={loadCampaigns}
                  className="text-blue-600 hover:text-blue-700"
                >
                  🔄 Actualiser
                </button>
              </div>

              {loading && (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
                  <p className="text-gray-600 mt-2">Chargement...</p>
                </div>
              )}

              {!loading && campaigns.length === 0 && (
                <div className="bg-white rounded-lg p-12 text-center">
                  <p className="text-gray-500 text-lg">Aucune campagne</p>
                  <p className="text-gray-400 mt-2">Créez votre première campagne IA</p>
                </div>
              )}

              {!loading && campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`bg-white rounded-lg shadow-sm p-6 cursor-pointer transition-all hover:shadow-md ${
                    selectedCampaign?.id === campaign.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => {
                    setSelectedCampaign(campaign);
                    loadCampaignReport(campaign.id);
                  }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start space-x-3">
                      <span className="text-2xl">{getChannelIcon(campaign.channel)}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{campaign.title}</h3>
                        <p className="text-sm text-gray-500">
                          {campaign.language.toUpperCase()} • {campaign.channel}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        campaign.status
                      )}`}
                    >
                      {campaign.status}
                    </span>
                  </div>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{campaign.body}</p>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">Envoyés</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {campaign.performance.sent || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Ouvertures</p>
                      <p className="text-lg font-semibold text-blue-600">
                        {campaign.performance.opened || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Clics</p>
                      <p className="text-lg font-semibold text-green-600">
                        {campaign.performance.clicked || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Revenu</p>
                      <p className="text-lg font-semibold text-purple-600">
                        {campaign.performance.revenue || 0}€
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  {campaign.status !== 'sent' && campaign.status !== 'stopped' && (
                    <div className="mt-4 flex space-x-2">
                      {campaign.status === 'draft' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStatus(campaign.id, 'scheduled');
                          }}
                          className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded hover:bg-blue-100"
                        >
                          📅 Planifier
                        </button>
                      )}
                      {campaign.status === 'scheduled' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStatus(campaign.id, 'sending');
                          }}
                          className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded hover:bg-green-100"
                        >
                          ▶️ Envoyer
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          optimizeCampaign(campaign.id);
                        }}
                        className="text-sm bg-purple-50 text-purple-700 px-3 py-1 rounded hover:bg-purple-100"
                      >
                        ⚡ Optimiser
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Campaign Details Panel */}
            <div className="lg:col-span-1">
              {selectedCampaign ? (
                <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Détails de la campagne</h3>

                  {campaignReport && (
                    <>
                      {/* Metrics Cards */}
                      <div className="space-y-3 mb-6">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-blue-600 font-medium">Taux d'ouverture</p>
                          <p className="text-2xl font-bold text-blue-700">
                            {campaignReport.metrics.openRate}
                          </p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs text-green-600 font-medium">Taux de clic</p>
                          <p className="text-2xl font-bold text-green-700">
                            {campaignReport.metrics.clickRate}
                          </p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3">
                          <p className="text-xs text-purple-600 font-medium">Taux de conversion</p>
                          <p className="text-2xl font-bold text-purple-700">
                            {campaignReport.metrics.conversionRate}
                          </p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-3">
                          <p className="text-xs text-orange-600 font-medium">ROI</p>
                          <p className="text-2xl font-bold text-orange-700">
                            {campaignReport.metrics.roi}
                          </p>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Chronologie</h4>
                        <div className="space-y-2">
                          {campaignReport.timeline.map((event, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{event.event}</span>
                              <span className="font-medium text-gray-900">{event.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Audience Info */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">Audience</h4>
                    <div className="text-sm text-gray-600">
                      <p>Type: {selectedCampaign.audience.type}</p>
                      {selectedCampaign.audience.estimatedSize && (
                        <p>Taille estimée: {selectedCampaign.audience.estimatedSize}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
                  Sélectionnez une campagne pour voir les détails
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Créer une campagne IA
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type de campagne
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="abandoned_cart">Panier Abandonné</option>
                    <option value="welcome">Bienvenue</option>
                    <option value="reactivation">Réactivation</option>
                    <option value="vip_exclusive">VIP Exclusif</option>
                    <option value="seasonal">Saisonnier</option>
                    <option value="flash_sale">Flash Sale</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Canal
                  </label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="email">📧 Email</option>
                    <option value="sms">💬 SMS</option>
                    <option value="push">🔔 Push</option>
                    <option value="social">📱 Social</option>
                    <option value="checkout_banner">🛒 Banner Checkout</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Langue
                  </label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="wo">🇸🇳 Wolof</option>
                    <option value="ar">🇸🇦 العربية</option>
                    <option value="pt">🇵🇹 Português</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valeur de réduction (%)
                  </label>
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) =>
                      setFormData({ ...formData, discountValue: parseInt(e.target.value) })
                    }
                    min="0"
                    max="100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoOptimize"
                    checked={formData.autoOptimize}
                    onChange={(e) =>
                      setFormData({ ...formData, autoOptimize: e.target.checked })
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="autoOptimize" className="ml-2 text-sm text-gray-700">
                    Activer l'optimisation automatique
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  onClick={createCampaign}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                  disabled={loading}
                >
                  {loading ? 'Création...' : 'Créer la campagne'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
