import { useEffect, useState } from 'react';
import { Tag, Ticket, CreditCard, TrendingUp } from 'lucide-react';
import { fetchCampaigns, fetchPromoCodes, fetchSubscriptionPlans, fetchSubscriptions } from '../utils/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    activePromoCodes: 0,
    subscriptionPlans: 0,
    activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [campaigns, promoCodes, plans, subscriptions] = await Promise.all([
        fetchCampaigns({ status: 'active', limit: 1 }),
        fetchPromoCodes({ is_active: true, limit: 1 }),
        fetchSubscriptionPlans({ is_active: true, limit: 1 }),
        fetchSubscriptions({ status: 'active', limit: 1 }),
      ]);

      setStats({
        activeCampaigns: campaigns.pagination?.total || 0,
        activePromoCodes: promoCodes.pagination?.total || 0,
        subscriptionPlans: plans.pagination?.total || 0,
        activeSubscriptions: subscriptions.pagination?.total || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Active Campaigns',
      value: stats.activeCampaigns,
      icon: Tag,
      color: 'bg-blue-500',
    },
    {
      name: 'Active Promo Codes',
      value: stats.activePromoCodes,
      icon: Ticket,
      color: 'bg-green-500',
    },
    {
      name: 'Subscription Plans',
      value: stats.subscriptionPlans,
      icon: CreditCard,
      color: 'bg-purple-500',
    },
    {
      name: 'Active Subscriptions',
      value: stats.activeSubscriptions,
      icon: TrendingUp,
      color: 'bg-orange-500',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Marketing Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Manage your marketing campaigns, promo codes, and subscriptions
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`${stat.color} rounded-xl p-3`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button className="flex items-center justify-center px-4 py-3 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
            <Tag className="w-5 h-5 mr-2" />
            New Campaign
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
            <Ticket className="w-5 h-5 mr-2" />
            New Promo Code
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors">
            <CreditCard className="w-5 h-5 mr-2" />
            New Plan
          </button>
          <button className="flex items-center justify-center px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors">
            <TrendingUp className="w-5 h-5 mr-2" />
            View Reports
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <p className="text-gray-500 text-center py-8">No recent activity</p>
      </div>
    </div>
  );
}
