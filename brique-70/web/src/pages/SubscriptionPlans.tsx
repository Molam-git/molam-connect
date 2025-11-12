import { useEffect, useState } from 'react';
import { Plus, Search, Edit, TrendingUp, Trash2 } from 'lucide-react';
import {
  fetchSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  fetchPlanStats,
  deactivateSubscriptionPlan,
} from '../utils/api';

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [planStats, setPlanStats] = useState<any>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const data = await fetchSubscriptionPlans({ limit: 100 });
      setPlans(data.data || []);
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await createSubscriptionPlan({
        merchant_id: formData.get('merchant_id'),
        name: formData.get('name'),
        description: formData.get('description'),
        amount: parseFloat(formData.get('amount') as string),
        currency: formData.get('currency'),
        interval: formData.get('interval'),
        interval_count: parseInt(formData.get('interval_count') as string) || 1,
        trial_period_days: parseInt(formData.get('trial_period_days') as string) || 0,
        features: null,
        metadata: null,
      });

      setShowCreateModal(false);
      loadPlans();
    } catch (error) {
      console.error('Failed to create subscription plan:', error);
      alert('Failed to create subscription plan');
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this plan?')) return;

    try {
      await deactivateSubscriptionPlan(id);
      loadPlans();
    } catch (error) {
      console.error('Failed to deactivate plan:', error);
      alert('Failed to deactivate plan');
    }
  };

  const handleViewStats = async (plan: any) => {
    try {
      const stats = await fetchPlanStats(plan.id);
      setPlanStats(stats);
      setSelectedPlan(plan);
      setShowStatsModal(true);
    } catch (error) {
      console.error('Failed to load stats:', error);
      alert('Failed to load plan stats');
    }
  };

  const filteredPlans = plans.filter((plan) =>
    plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIntervalLabel = (interval: string, count: number) => {
    const labels: Record<string, string> = {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
      year: 'Yearly',
    };

    if (count === 1) {
      return labels[interval] || interval;
    }

    return `Every ${count} ${interval}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subscription Plans</h1>
          <p className="mt-2 text-gray-600">Create and manage recurring subscription plans</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Plan
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search plans..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlans.map((plan) => (
          <div
            key={plan.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            {/* Plan Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                )}
              </div>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  plan.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {plan.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Pricing */}
            <div className="mb-6">
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-gray-900">
                  {parseFloat(plan.amount).toFixed(2)}
                </span>
                <span className="ml-2 text-gray-600">{plan.currency}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {getIntervalLabel(plan.interval, plan.interval_count)}
              </p>
            </div>

            {/* Trial */}
            {plan.trial_period_days > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  {plan.trial_period_days} days free trial
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleViewStats(plan)}
                className="flex-1 flex items-center justify-center px-3 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <TrendingUp className="w-4 h-4 mr-1" />
                Stats
              </button>
              {plan.is_active && (
                <button
                  onClick={() => handleDeactivate(plan.id)}
                  className="flex items-center justify-center px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredPlans.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-500">No subscription plans found</p>
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Subscription Plan</h2>
            <form onSubmit={handleCreatePlan} className="space-y-4">
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
                  Plan Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g., Premium Plan"
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
                  placeholder="Describe what's included in this plan..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    name="amount"
                    required
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    name="currency"
                    required
                    defaultValue="USD"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Billing Interval
                  </label>
                  <select
                    name="interval"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="week">Weekly</option>
                    <option value="day">Daily</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval Count
                  </label>
                  <input
                    type="number"
                    name="interval_count"
                    defaultValue="1"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trial Period (days)
                </label>
                <input
                  type="number"
                  name="trial_period_days"
                  defaultValue="0"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
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
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && planStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Plan Stats: {selectedPlan?.name}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Active Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {planStats.active_subscribers || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Canceled Subscribers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {planStats.canceled_subscribers || 0}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 col-span-2">
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${(parseFloat(planStats.total_revenue) || 0).toFixed(2)}
                </p>
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
