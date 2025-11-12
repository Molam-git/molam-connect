import { useEffect, useState } from 'react';
import { Plus, Search, Edit, TrendingUp, Pause, Play, Archive } from 'lucide-react';
import { fetchCampaigns, createCampaign, updateCampaign, fetchCampaignStats } from '../utils/api';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [campaignStats, setCampaignStats] = useState<any>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await fetchCampaigns({ limit: 100 });
      setCampaigns(data.data || []);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await createCampaign({
        merchant_id: formData.get('merchant_id'),
        name: formData.get('name'),
        description: formData.get('description'),
        type: formData.get('type'),
        min_purchase_amount: formData.get('min_purchase_amount') || null,
        max_discount_amount: formData.get('max_discount_amount') || null,
        total_usage_limit: formData.get('total_usage_limit') || null,
        per_user_limit: formData.get('per_user_limit') || null,
        starts_at: formData.get('starts_at') || new Date().toISOString(),
        ends_at: formData.get('ends_at') || null,
      });

      setShowCreateModal(false);
      loadCampaigns();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      alert('Failed to create campaign');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateCampaign(id, { status });
      loadCampaigns();
    } catch (error) {
      console.error('Failed to update campaign:', error);
      alert('Failed to update campaign');
    }
  };

  const handleViewStats = async (campaign: any) => {
    try {
      const stats = await fetchCampaignStats(campaign.id);
      setCampaignStats(stats);
      setSelectedCampaign(campaign);
      setShowStatsModal(true);
    } catch (error) {
      console.error('Failed to load stats:', error);
      alert('Failed to load campaign stats');
    }
  };

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campaign.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'promo_code': return 'bg-blue-100 text-blue-800';
      case 'coupon': return 'bg-purple-100 text-purple-800';
      case 'subscription_plan': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketing Campaigns</h1>
          <p className="mt-2 text-gray-600">Create and manage your marketing campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Campaign
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search campaigns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Campaigns List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dates
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCampaigns.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-gray-900">{campaign.name}</div>
                    <div className="text-sm text-gray-500">{campaign.description}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(campaign.type)}`}>
                    {campaign.type.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {campaign.total_usage_count} / {campaign.total_usage_limit || '∞'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div>{new Date(campaign.starts_at).toLocaleDateString()}</div>
                  {campaign.ends_at && (
                    <div>to {new Date(campaign.ends_at).toLocaleDateString()}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => handleViewStats(campaign)}
                    className="text-primary-600 hover:text-primary-900"
                    title="View Stats"
                  >
                    <TrendingUp className="w-5 h-5" />
                  </button>
                  {campaign.status === 'active' ? (
                    <button
                      onClick={() => handleUpdateStatus(campaign.id, 'paused')}
                      className="text-yellow-600 hover:text-yellow-900"
                      title="Pause"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  ) : campaign.status === 'paused' ? (
                    <button
                      onClick={() => handleUpdateStatus(campaign.id, 'active')}
                      className="text-green-600 hover:text-green-900"
                      title="Activate"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  ) : null}
                  {campaign.status !== 'archived' && (
                    <button
                      onClick={() => handleUpdateStatus(campaign.id, 'archived')}
                      className="text-gray-600 hover:text-gray-900"
                      title="Archive"
                    >
                      <Archive className="w-5 h-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredCampaigns.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No campaigns found</p>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Campaign</h2>
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Merchant ID
                </label>
                <input
                  type="text"
                  name="merchant_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Type
                </label>
                <select
                  name="type"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="promo_code">Promo Code</option>
                  <option value="coupon">Coupon</option>
                  <option value="subscription_plan">Subscription Plan</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Purchase Amount
                  </label>
                  <input
                    type="number"
                    name="min_purchase_amount"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Discount Amount
                  </label>
                  <input
                    type="number"
                    name="max_discount_amount"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    name="total_usage_limit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Per User Limit
                  </label>
                  <input
                    type="number"
                    name="per_user_limit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Starts At
                  </label>
                  <input
                    type="datetime-local"
                    name="starts_at"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ends At
                  </label>
                  <input
                    type="datetime-local"
                    name="ends_at"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && campaignStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Campaign Stats: {selectedCampaign?.name}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Total Uses</p>
                <p className="text-2xl font-bold text-gray-900">{campaignStats.total_uses || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Promo Codes</p>
                <p className="text-2xl font-bold text-gray-900">{campaignStats.promo_codes_count || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Total Discount Given</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${(parseFloat(campaignStats.total_discount_given) || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Unique Customers</p>
                <p className="text-2xl font-bold text-gray-900">{campaignStats.unique_customers || 0}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowStatsModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
