import React, { useState, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3077/api';

export default function LoyaltyDashboard({ merchantId }: { merchantId: string }) {
  const [programs, setPrograms] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    currency: 'points',
    earnRate: 0.02,
    enableTiers: true,
    enableCashback: false,
    aiEnabled: true
  });

  useEffect(() => {
    if (merchantId) {
      loadPrograms();
      loadRecommendations();
    }
  }, [merchantId]);

  const loadPrograms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/loyalty/programs?merchantId=${merchantId}`);
      const data = await response.json();
      if (data.success) {
        setPrograms(data.programs);
        if (data.programs.length > 0) {
          setSelectedProgram(data.programs[0]);
        }
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    try {
      const response = await fetch(`${API_BASE}/loyalty/campaigns/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId })
      });
      const data = await response.json();
      if (data.success) {
        setRecommendations(data.recommendations);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }
  };

  const createProgram = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/loyalty/programs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, ...formData })
      });

      const data = await response.json();
      if (data.success) {
        alert('Programme créé avec succès !');
        setShowCreateModal(false);
        loadPrograms();
      }
    } catch (error) {
      alert('Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      basic: 'bg-gray-100 text-gray-800',
      silver: 'bg-gray-300 text-gray-900',
      gold: 'bg-yellow-200 text-yellow-900',
      platinum: 'bg-purple-200 text-purple-900'
    };
    return colors[tier] || 'bg-gray-100';
  };

  const getTierIcon = (tier: string) => {
    const icons: Record<string, string> = {
      basic: '⚪',
      silver: '⚫',
      gold: '🥇',
      platinum: '💎'
    };
    return icons[tier] || '⚪';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🎁 Sira Loyalty Engine</h1>
              <p className="text-gray-600 mt-1">Programmes de fidélité intelligents propulsés par IA</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              + Créer un Programme
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Programs List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Programs */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Programmes actifs ({programs.length})</h2>

              {loading && <div className="text-center py-8">Chargement...</div>}

              {!loading && programs.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🎁</div>
                  <p className="text-gray-500 text-lg">Aucun programme</p>
                  <p className="text-gray-400 mt-2">Créez votre premier programme de fidélité</p>
                </div>
              )}

              <div className="space-y-4">
                {programs.map((program) => (
                  <div
                    key={program.id}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedProgram?.id === program.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                    }`}
                    onClick={() => setSelectedProgram(program)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-gray-900">{program.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{program.description}</p>
                        <div className="flex space-x-3 mt-3">
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {program.earn_rate * 100}% taux de gain
                          </span>
                          {program.enable_tiers && (
                            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                              Tiers activés
                            </span>
                          )}
                          {program.ai_enabled && (
                            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              🤖 IA Sira
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                        {program.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Recommendations */}
            {recommendations.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
                <h2 className="text-xl font-bold mb-4">🤖 Recommandations IA</h2>
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="bg-white/10 backdrop-blur rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold">{rec.title}</h3>
                          <p className="text-sm text-white/90 mt-1">{rec.description}</p>
                          <div className="flex space-x-3 mt-3">
                            <span className="px-2 py-1 bg-white/20 rounded text-xs">
                              {rec.expected_participation_rate}% participation
                            </span>
                            <span className="px-2 py-1 bg-white/20 rounded text-xs">
                              +${rec.expected_revenue_impact.toFixed(0)} revenu
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{(rec.ai_confidence_score * 100).toFixed(0)}%</div>
                          <div className="text-xs">confiance</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tiers Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-4">
              <h3 className="font-bold text-gray-900 mb-4">Niveaux de fidélité</h3>

              <div className="space-y-3">
                {['basic', 'silver', 'gold', 'platinum'].map((tier) => (
                  <div key={tier} className={`${getTierColor(tier)} rounded-lg p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{getTierIcon(tier)}</span>
                        <div>
                          <div className="font-bold capitalize">{tier}</div>
                          <div className="text-xs">
                            {tier === 'basic' && '0+ points'}
                            {tier === 'silver' && '1,000+ points'}
                            {tier === 'gold' && '5,000+ points'}
                            {tier === 'platinum' && '20,000+ points'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {tier === 'basic' && '1.0x'}
                          {tier === 'silver' && '1.25x'}
                          {tier === 'gold' && '1.5x'}
                          {tier === 'platinum' && '2.0x'}
                        </div>
                        <div className="text-xs">multiplier</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3">Avantages Platinum</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center"><span className="mr-2">✓</span> Points x2</li>
                  <li className="flex items-center"><span className="mr-2">✓</span> Livraison gratuite</li>
                  <li className="flex items-center"><span className="mr-2">✓</span> Support prioritaire</li>
                  <li className="flex items-center"><span className="mr-2">✓</span> Offres exclusives</li>
                  <li className="flex items-center"><span className="mr-2">✓</span> Cashback 5%</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Créer un programme de fidélité</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nom du programme</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: MoLam Rewards"
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Devise</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
                  >
                    <option value="points">Points</option>
                    <option value="USD">USD</option>
                    <option value="XOF">XOF</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Taux de gain (%)</label>
                  <input
                    type="number"
                    value={formData.earnRate * 100}
                    onChange={(e) => setFormData({ ...formData, earnRate: parseFloat(e.target.value) / 100 })}
                    step="0.1"
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enableTiers}
                    onChange={(e) => setFormData({ ...formData, enableTiers: e.target.checked })}
                    className="h-4 w-4 text-indigo-600"
                  />
                  <span className="ml-2 text-sm">Activer les niveaux de fidélité (Silver, Gold, Platinum)</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enableCashback}
                    onChange={(e) => setFormData({ ...formData, enableCashback: e.target.checked })}
                    className="h-4 w-4 text-indigo-600"
                  />
                  <span className="ml-2 text-sm">Activer le cashback</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.aiEnabled}
                    onChange={(e) => setFormData({ ...formData, aiEnabled: e.target.checked })}
                    className="h-4 w-4 text-indigo-600"
                  />
                  <span className="ml-2 text-sm">🤖 Activer l'optimisation IA (Sira)</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={createProgram}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                disabled={loading}
              >
                {loading ? 'Création...' : 'Créer le programme'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
