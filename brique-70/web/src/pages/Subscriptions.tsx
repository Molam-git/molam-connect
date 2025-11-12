import { useEffect, useState } from 'react';
import { Search, X, RotateCcw, Receipt } from 'lucide-react';
import {
  fetchSubscriptions,
  cancelSubscription,
  reactivateSubscription,
  fetchSubscriptionInvoices,
} from '../utils/api';

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    loadSubscriptions();
  }, [filterStatus]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 100 };
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }
      const data = await fetchSubscriptions(params);
      setSubscriptions(data.data || []);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (id: string) => {
    const reason = prompt('Cancellation reason (optional):');
    if (reason === null) return; // User clicked cancel

    try {
      await cancelSubscription(id, {
        cancel_at_period_end: true,
        reason: reason || undefined,
      });
      loadSubscriptions();
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await reactivateSubscription(id);
      loadSubscriptions();
    } catch (error) {
      console.error('Failed to reactivate subscription:', error);
      alert('Failed to reactivate subscription');
    }
  };

  const handleViewInvoices = async (subscription: any) => {
    try {
      const data = await fetchSubscriptionInvoices(subscription.id);
      setInvoices(data.data || []);
      setSelectedSubscription(subscription);
      setShowInvoicesModal(true);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      alert('Failed to load invoices');
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) =>
    sub.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.customer_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trialing': return 'bg-blue-100 text-blue-800';
      case 'past_due': return 'bg-yellow-100 text-yellow-800';
      case 'canceled': return 'bg-red-100 text-red-800';
      case 'paused': return 'bg-gray-100 text-gray-800';
      case 'unpaid': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInvoiceStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'void': return 'bg-gray-100 text-gray-800';
      case 'uncollectible': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Subscriptions</h1>
        <p className="mt-2 text-gray-600">Manage customer subscriptions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by subscription or customer ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
          <option value="paused">Paused</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      {/* Subscriptions List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Current Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trial
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubscriptions.map((subscription) => (
              <tr key={subscription.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {subscription.customer_id}
                    </div>
                    <div className="text-xs text-gray-500">{subscription.id}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{subscription.plan_id}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(subscription.status)}`}>
                    {subscription.status}
                  </span>
                  {subscription.cancel_at_period_end && (
                    <div className="text-xs text-red-600 mt-1">Cancels at period end</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div>{new Date(subscription.current_period_start).toLocaleDateString()}</div>
                  <div>to {new Date(subscription.current_period_end).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4">
                  {subscription.trial_start && subscription.trial_end ? (
                    <div className="text-sm text-gray-900">
                      <div>Trial ends:</div>
                      <div>{new Date(subscription.trial_end).toLocaleDateString()}</div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No trial</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button
                    onClick={() => handleViewInvoices(subscription)}
                    className="inline-flex items-center text-primary-600 hover:text-primary-900"
                    title="View Invoices"
                  >
                    <Receipt className="w-5 h-5" />
                  </button>

                  {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                    <button
                      onClick={() => handleCancelSubscription(subscription.id)}
                      className="inline-flex items-center text-red-600 hover:text-red-900"
                      title="Cancel Subscription"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}

                  {subscription.status === 'canceled' && (
                    <button
                      onClick={() => handleReactivate(subscription.id)}
                      className="inline-flex items-center text-green-600 hover:text-green-900"
                      title="Reactivate"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredSubscriptions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No subscriptions found</p>
          </div>
        )}
      </div>

      {/* Invoices Modal */}
      {showInvoicesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Invoices for Subscription {selectedSubscription?.id}
            </h2>

            <div className="space-y-4">
              {invoices.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No invoices found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Period
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Paid At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {new Date(invoice.period_start).toLocaleDateString()} -
                            {new Date(invoice.period_end).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {invoice.total_amount} {invoice.currency}
                              </div>
                              {invoice.discount_amount > 0 && (
                                <div className="text-xs text-gray-500">
                                  Discount: {invoice.discount_amount}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getInvoiceStatusColor(invoice.status)}`}>
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {invoice.paid_at
                              ? new Date(invoice.paid_at).toLocaleDateString()
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowInvoicesModal(false)}
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
